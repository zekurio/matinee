/*
 * Eligibility is separate from sleeping/waking/awake/disposing in sandbox-lease.ts.
 * Admin actions serialize per id and close the old lease before checking new
 * settings. Calls reserve that lease before awaiting; close is terminal, so an
 * old wake can never serve a newly enabled plugin. Ordinary wakes leave
 * state=running. Only admin checks use starting.
 */
import {
  PLUGIN_API_VERSION,
  type PluginAuthContribution,
  type PluginMetadataContribution,
  type PluginEventName,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import type { JsonValue } from "@matinee/db"

import { env } from "../env"
import { log } from "../log"
import { hostAllowed, type HostRule } from "../net/guarded-fetch"
import { SERVER_VERSION } from "../version"
import { builtins } from "./builtin"
import { resolveConfig } from "./config"
import { files, errorText, readFolder } from "./files"
import { createHost, drainHostStorage, networkRules } from "./host"
import type { DeclaredMetadata, Running } from "./index"
import { pluginLog } from "./logs"
import {
  createSandbox,
  SandboxError,
  setSandboxThreadCap,
  stopSandboxHost,
} from "./sandbox"
import { SandboxLease, SandboxPool } from "./sandbox-lease"
import { Json } from "./schema"
import { pluginState, type RuntimeState } from "./state"
import { changed, rows } from "./store"

export type Runtime = RuntimeState & {
  lease?: SandboxLease
  start?: Promise<void>
  rules: HostRule[]
  handlers?: Set<string>
  integrity?: string
}
export const runtimes = new Map<string, Runtime>()
const chains = new Map<string, Promise<void>>()
let stopping = false
setSandboxThreadCap(env.MATINEE_PLUGIN_THREADS)
const pool = new SandboxPool(
  env.MATINEE_PLUGIN_MAX_AWAKE,
  env.MATINEE_PLUGIN_IDLE_SECONDS * 1000,
)

export function serialize<T>(id: string, run: () => Promise<T>): Promise<T> {
  const previous = chains.get(id) ?? Promise.resolve()
  const next = previous.then(run)
  const settled = next.then(
    () => {},
    () => {},
  )
  chains.set(id, settled)
  void settled.then(() => {
    if (chains.get(id) === settled) chains.delete(id)
  })
  return next
}
/*
 * What the event code uses of a plugin's runtime. These three signatures
 * are fixed: `events.ts` is written against them.
 */

/** Whether the plugin's sandbox is loaded now. */
export function isAwake(id: string): boolean {
  return runtimes.get(id)?.lease?.awake ?? false
}

/** The plugins that are on and listen for the event, awake or not. */
export function eventSubscribers(name: PluginEventName): string[] {
  const ids: string[] = []
  for (const [id, runtime] of runtimes) {
    if (runtime.state !== "running") continue
    if (files.get(id)?.manifest?.contributes.events.includes(name)) ids.push(id)
  }
  return ids
}

/**
 * The plugins an event is recorded for: on, approved, set up, and
 * listening, whether or not they run right now. One that failed and waits
 * for a restart still gets its events kept, so nothing is missing once it
 * is back. One that is off, or waits for approval or settings, gets none.
 */
export function eventRecorders(name: PluginEventName): string[] {
  const ids: string[] = []
  for (const [id, row] of rows) {
    const file = files.get(id)
    if (!file?.manifest?.contributes.events.includes(name)) continue
    if (pluginState(row, file).state === "starting") ids.push(id)
  }
  return ids
}

const availabilityListeners = new Set<() => void>()
/** Hear when a plugin turns on or off, or what one listens for changes. */
export function onAvailabilityChanged(listener: () => void): void {
  availabilityListeners.add(listener)
}

/**
 * Call one of a plugin's handlers by its path, like
 * `events.playback.stopped`, waking its sandbox if it sleeps. Rejects
 * with `SandboxError`: kind `crashed` when the plugin isn't on.
 */
export async function callHandler(
  id: string,
  path: string,
  args: JsonValue[],
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<JsonValue> {
  const runtime = runtimes.get(id)
  if (runtime?.state === "starting") await runtime.start
  const row = rows.get(id)
  if (
    !row ||
    stopping ||
    !runtime?.lease ||
    runtime.state !== "running" ||
    pluginState(row, files.get(id), runtime).state !== "running"
  )
    throw new SandboxError("crashed", `Plugin ${id} isn't running`)
  const manifest = files.get(id)?.manifest
  const justified =
    requiredHandlers(id).includes(path) ||
    manifest?.contributes.metadata.some((provider) =>
      ["lookup", "images"].some(
        (method) => path === `metadata.${provider.id}.${method}`,
      ),
    )
  if (!justified || (runtime.handlers && !runtime.handlers.has(path)))
    throw new SandboxError("protocol", `Plugin ${id} doesn't provide ${path}`)
  const result = await runtime.lease.run(async (sandbox) => {
    if (!runtime.handlers?.has(path))
      throw new SandboxError("protocol", `Plugin ${id} doesn't provide ${path}`)
    return sandbox.call(path, args, options)
  })
  const parsed = Json.safeParse(result)
  if (!parsed.success)
    throw new SandboxError(
      "protocol",
      "Plugin returned a value that isn't JSON",
    )
  return parsed.data
}

const metadataListeners = new Set<(started: string[]) => void>()
let runningProviders = new Set<string>()
/** Hear which metadata providers just started, by provider id. */
export function onMetadataStarted(listener: (started: string[]) => void) {
  metadataListeners.add(listener)
}
function refreshProviders(): void {
  const now = new Set<string>()
  for (const [id, runtime] of runtimes) {
    if (runtime.state !== "running") continue
    for (const provider of files.get(id)?.manifest?.contributes.metadata ?? [])
      now.add(provider.id)
  }
  const started = [...now].filter((id) => !runningProviders.has(id))
  runningProviders = now
  if (started.length === 0) return
  for (const listener of metadataListeners) {
    try {
      listener(started)
    } catch (cause) {
      log.warn("A metadata provider listener failed", cause)
    }
  }
}
function transition(): void {
  refreshProviders()
  for (const listener of availabilityListeners) {
    try {
      listener()
    } catch (cause) {
      log.warn("A plugin availability listener failed", cause)
    }
  }
  changed()
}
function runtimeFor(id: string): Runtime {
  let runtime = runtimes.get(id)
  if (!runtime) {
    runtime = {
      state: "starting",
      error: null,
      rules: [],
    }
    runtimes.set(id, runtime)
  }
  return runtime
}
export async function stopRuntime(id: string): Promise<void> {
  const runtime = runtimes.get(id)
  if (!runtime) return
  const lease = runtime.lease
  runtime.lease = undefined
  runtime.state = "starting"
  runtime.error = null
  transition()
  await lease?.close()
}
function conflict(id: string): string | null {
  const manifest = files.get(id)?.manifest
  if (!manifest) return null
  const own = builtins.get(id)
  if (own)
    return `Plugin ${manifest.name} (${id}) conflicts with built-in plugin ${own.definition.name} (${id}).`
  for (const provider of manifest.contributes.metadata) {
    for (const { definition } of builtins.values()) {
      if (definition.metadata?.some((entry) => entry.id === provider.id))
        return `Plugin ${manifest.name} and built-in plugin ${definition.name} both provide metadata id ${provider.id}.`
    }
    for (const [other, runtime] of runtimes) {
      if (
        other === id ||
        (runtime.state !== "running" && runtime.state !== "starting")
      )
        continue
      const otherRow = rows.get(other)
      if (
        !otherRow ||
        pluginState(otherRow, files.get(other)).state !== "starting"
      )
        continue
      const otherManifest = files.get(other)?.manifest
      if (
        otherManifest?.contributes.metadata.some(
          (entry) => entry.id === provider.id,
        )
      )
        return `Plugin ${manifest.name} and plugin ${otherManifest.name} (${other}) both provide metadata id ${provider.id}.`
    }
  }
  return null
}
function requiredHandlers(id: string): string[] {
  const manifest = files.get(id)?.manifest
  if (!manifest) return []
  return [
    ...manifest.contributes.metadata.flatMap((provider) =>
      ["search", "details"].map(
        (method) => `metadata.${provider.id}.${method}`,
      ),
    ),
    ...manifest.contributes.auth.flatMap((provider) =>
      (provider.kind === "redirect"
        ? ["start", "finish"]
        : ["authenticate"]
      ).map((method) => `auth.${provider.id}.${method}`),
    ),
    ...manifest.contributes.events.map((event) => `events.${event}`),
  ]
}
export async function startRuntime(id: string, reset = false): Promise<void> {
  await turnOn(id, reset, true)
}
/** Discovery establishes availability without evaluating plugin code. */
export async function activateRuntime(id: string): Promise<void> {
  await turnOn(id, false, false)
}
async function turnOn(
  id: string,
  reset: boolean,
  check: boolean,
): Promise<void> {
  const row = rows.get(id)
  const file = files.get(id)
  if (!row || !file?.manifest || stopping) return
  const runtime = runtimeFor(id)
  if (runtime.lease || (!reset && runtime.error)) return
  if (reset) {
    runtime.error = null
    runtime.state = "starting"
  }
  if (pluginState(row, file).state !== "starting") return
  const collision = conflict(id)
  if (collision) {
    runtime.state = "error"
    runtime.error = collision
    pluginLog(id, "warn", collision)
    transition()
    return
  }
  if (runtime.integrity !== file.integrity) runtime.handlers = undefined
  runtime.integrity = file.integrity
  const manifest = file.manifest
  const config = resolveConfig(manifest.config, row)
  runtime.rules = networkRules(manifest, config)
  runtime.state = check ? "starting" : "running"
  runtime.error = null
  const lease = new SandboxLease(
    pool,
    async (onCrowded) => {
      // Never evaluate newly changed files under an old grant, even without a rescan.
      const current = await readFolder(file.path, file.external).catch(
        () => null,
      )
      if (
        !current ||
        current.id !== id ||
        current.files.integrity !== file.integrity ||
        current.files.problems.length
      ) {
        if (current?.id === id) files.set(id, current.files)
        else files.delete(id)
        runtime.state = "error"
        runtime.error =
          "The plugin's files changed. Rescan and approve them again."
        transition()
        throw new SandboxError("crashed", runtime.error)
      }
      const hostCall = await createHost(manifest, runtime.rules)
      const sandbox = createSandbox({
        pluginId: id,
        code: file.code,
        context: {
          plugin: { id, version: manifest.version },
          server: {
            version: SERVER_VERSION,
            api: PLUGIN_API_VERSION,
            publicUrl: env.PUBLIC_URL,
          },
          config,
        },
        hostCall,
        onCrowded,
      })
      // Validation belongs to start, including after an unexpected exit. The
      // lease sees failures here exactly as it sees a throwing setup.
      return {
        ...sandbox,
        get thread() {
          return sandbox.thread
        },
        async start() {
          const result = await sandbox.start()
          const handlers = new Set(result.handlers)
          const missing = requiredHandlers(id).find(
            (path) => !handlers.has(path),
          )
          if (missing)
            throw new SandboxError(
              "protocol",
              `The plugin is missing its declared handler ${missing}.`,
            )
          runtime.handlers = handlers
          return result
        },
      }
    },
    (event, detail, terminal) => {
      pluginLog(
        id,
        event === "crashed" ? "warn" : "debug",
        event === "started"
          ? "Started"
          : event === "stopped"
            ? `Stopped: ${detail}`
            : `Crashed: ${detail}`,
      )
      if (runtime.lease !== lease) return
      if (terminal) {
        runtime.state = "error"
        runtime.error =
          "The plugin exited five times in ten minutes. Restart it after fixing the cause."
        transition()
      } else changed()
    },
    () => drainHostStorage(id),
  )
  runtime.lease = lease
  if (!check) {
    transition()
    return
  }
  runtime.start = (async () => {
    try {
      await lease.run(async () => {})
      if (runtime.lease !== lease || stopping) return
      runtime.state = "running"
      transition()
    } catch (cause) {
      if (runtime.lease !== lease) return
      await lease.close()
      runtime.lease = undefined
      runtime.state = "error"
      runtime.error = errorText(cause)
      pluginLog(id, "warn", `Couldn't start: ${runtime.error}`)
      transition()
    }
  })()
  transition()
  await runtime.start
}
export function resumeRuntimes(): void {
  stopping = false
}
export async function stopRuntimes(): Promise<void> {
  stopping = true
  await Promise.all(
    [...runtimes.keys()].map((id) =>
      stopRuntime(id).catch((cause) => pluginLog(id, "warn", errorText(cause))),
    ),
  )
  // End the host threads kept for later calls.
  await stopSandboxHost()
}
const ContributionOptions = t.record(
  t.string(),
  t.union([t.boolean(), t.number(), t.string()]).nullable(),
)
const AuthOptions = t.record(t.string(), ContributionOptions)
export function authOptions(
  id: string,
  provider: string,
): Record<string, boolean | number | string | null> {
  const options = AuthOptions.safeParse(rows.get(id)?.options.auth)
  return options.data?.[provider] ?? { allowSignUp: false }
}
function running<C extends PluginMetadataContribution | PluginAuthContribution>(
  id: string,
  kind: "metadata" | "auth",
  contribution: C,
): Running<C> {
  return {
    pluginId: id,
    pluginName: files.get(id)?.manifest?.name ?? id,
    contribution,
    get options() {
      return kind === "auth" ? authOptions(id, contribution.id) : {}
    },
    allows: (url) => hostAllowed(url, runtimes.get(id)?.rules ?? []),
    call(method, args, options): Promise<JsonValue> {
      const allowed =
        kind === "metadata"
          ? ["search", "details", "lookup", "images"]
          : files
                .get(id)
                ?.manifest?.contributes.auth.find(
                  (provider) => provider.id === contribution.id,
                )?.kind === "redirect"
            ? ["start", "finish"]
            : ["authenticate"]
      const path = `${kind}.${contribution.id}.${method}`
      if (!allowed.includes(method))
        return Promise.reject(
          new SandboxError("protocol", `Plugin ${id} doesn't provide ${path}`),
        )
      return callHandler(id, path, args, options)
    },
  }
}
export function metadataContributions(): Running<PluginMetadataContribution>[] {
  return [...runtimes].flatMap(([id, runtime]) =>
    runtime.state === "running"
      ? (files.get(id)?.manifest?.contributes.metadata ?? []).map((provider) =>
          running(id, "metadata", provider),
        )
      : [],
  )
}
export function authContributions(): Running<PluginAuthContribution>[] {
  return [...runtimes].flatMap(([id, runtime]) =>
    runtime.state === "running"
      ? (files.get(id)?.manifest?.contributes.auth ?? []).map((provider) =>
          running(id, "auth", provider),
        )
      : [],
  )
}
export function metadataDeclarations(): DeclaredMetadata[] {
  return [...rows.values()]
    .filter((row) => row.source.type !== "builtin")
    .flatMap((row) => {
      const manifest = files.get(row.id)?.manifest ?? row.manifest
      return (manifest?.contributes.metadata ?? []).map((contribution) => ({
        pluginId: row.id,
        pluginName: manifest?.name ?? row.id,
        contribution,
        state: pluginState(row, files.get(row.id), runtimes.get(row.id)).state,
      }))
    })
}
