import { readFile } from "node:fs/promises"
// These public signatures match the sandbox contract, including its opaque JSON values.
/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-object-parameters */
import { availableParallelism } from "node:os"
import {
  clearInterval,
  clearTimeout,
  setInterval,
  setTimeout,
} from "node:timers"
import { Worker } from "node:worker_threads"

import { t } from "@matinee/contracts/schema"

import {
  encodeMessage,
  Envelope,
  Limits,
  LOAD_SLOTS,
  WireText,
  WorkerMessage,
} from "./protocol"
import type { MainMessage } from "./protocol"

/*
 * Each awake plugin has its own WebAssembly memory and QuickJS instance
 * on one host thread. Light guests pack together; busy guests get room
 * on another thread when the pool allows it. A broken thread takes only
 * its own guests, and only the running guest is blamed.
 */

export type SandboxLimits = {
  memoryBytes: number
  stackBytes: number
  cpuMs: number
  callMs: number
  startMs: number
  /**
   * How long a handler may go on after the server stopped waiting for its
   * call. Until it ends it keeps its place among the calls a guest takes
   * at once, so giving up on calls is no way around that limit. One that
   * never ends gets the sandbox ended.
   */
  settleMs: number
}
export const DEFAULT_LIMITS: Readonly<SandboxLimits> = Object.freeze({
  memoryBytes: 64 * 1024 * 1024,
  stackBytes: 1024 * 1024,
  cpuMs: 2000,
  callMs: 30_000,
  startMs: 10_000,
  settleMs: 30_000,
})
export type HostCall = (
  name: string,
  args: unknown,
  signal: AbortSignal,
) => Promise<unknown>
export type SandboxExit = {
  /**
   * `host` is the thread going away through no fault of this sandbox,
   * because another plugin stuck it. It is no failure of this one.
   */
  kind: "stopped" | "crashed" | "limit" | "host"
  message: string
}
export class SandboxError extends Error {
  readonly status: number | null
  constructor(
    readonly kind: "guest" | "timeout" | "limit" | "crashed" | "protocol",
    message: string,
    name = "SandboxError",
    status: number | null = null,
  ) {
    super(message.slice(0, 2000))
    this.name = name.slice(0, 2000)
    this.status = status
  }
}
export type Sandbox = {
  readonly thread: number | undefined
  start(): Promise<{ handlers: string[] }>
  call(
    path: string,
    args: unknown[],
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<unknown>
  diagnostics(): Promise<unknown>
  stop(): Promise<void>
  readonly exited: Promise<SandboxExit>
}

/**
 * The most text one guest may have in flight each way: arguments of calls
 * that wait or run, and host calls being answered. A message is 8 MB at
 * most, and 16 calls and 128 host calls can be open, which without this
 * would be over a gigabyte held for one plugin.
 */
const BUDGET_BYTES = 32 * 1024 * 1024
/** The thread ends when no sandbox existed for this long. */
const HOST_IDLE_MS = 10 * 60_000
/**
 * How often the main thread looks at what the host thread is doing. QuickJS
 * asks its interrupt handler once in ten thousand loop turns, so a guest
 * looping over long native operations (parsing a large JSON text again and
 * again) runs far past its CPU limit before the handler is asked. The
 * watch below sees one run of one guest going on and ends it in time.
 */
const WATCH_MS = 500
/** What a run may take beyond its CPU limit before the watch ends it. */
const WATCH_GRACE_MS = 1000
/** Every so many looks the thread is also asked whether it still answers. */
const PING_EVERY = 6
const PING_MS = 5000

type GuestMessage = Exclude<WorkerMessage, { type: "pong" }>
type Load = { at: number; total: number }
type View = {
  pluginId: string
  slot: number
  samples: Load[]
  total: number
  share: number
  crowdedAt: number
  onCrowded?: () => void
  cpuMs: number
  receive(message: GuestMessage): Promise<void>
  finish(result: SandboxExit, errorKind?: SandboxError["kind"]): void
}
type Host = {
  id: number
  load: BigInt64Array
  slots: Map<number, number>
  free: number[]
  samples: Load[]
  total: number
  share: number
  busy: boolean
  emptySince: number
  worker: Worker
  views: Map<number, View>
  /**
   * As the thread writes them: the guest whose code runs now, 0 for none,
   * and the count of entries into guest code so far.
   */
  current: Int32Array
  /** The run the watch has been looking at, and since when. */
  watching: { guest: number; entry: number; since: number } | undefined
  looks: number
  pings: Map<number, NodeJS.Timeout>
  heartbeat: NodeJS.Timeout
  idle: NodeJS.Timeout | undefined
  ended: boolean
  closing: boolean
  exited: Promise<void>
}
type Pending = {
  id: number
  path: string
  json: string
  size: number
  resolve: (value: unknown) => void
  reject: (error: SandboxError) => void
  timer: NodeJS.Timeout
  cleanup: () => void
  active: boolean
}
const Handlers = t.object({
  handlers: t.array(t.string().max(1024)).max(10_000),
})
const HostError = t.object({ message: t.string() })

const hosts = new Set<Host>()
let generation = 0
let nextThread = 0
const ThreadCap = t.number().int().min(1)
let threadCap = Math.min(4, Math.max(1, availableParallelism() - 1))
/** The server's setting, MATINEE_PLUGIN_THREADS. The default is the same. */
export function setSandboxThreadCap(cap: number): void {
  threadCap = ThreadCap.parse(cap)
}
const thresholds = {
  windowMs: 5000,
  busy: 0.25,
  hot: 0.5,
  heavyMs: 600_000,
  spareMs: 30_000,
  idleMs: HOST_IDLE_MS,
}
const heavy = new Map<string, number>()
function isHeavy(id: string, now = performance.now()): boolean {
  const until = heavy.get(id)
  if (until === undefined) return false
  if (until > now) return true
  heavy.delete(id)
  return false
}
function markHeavy(id: string, now = performance.now()) {
  for (const [pluginId, until] of heavy)
    if (until <= now) heavy.delete(pluginId)
  heavy.set(id, now + thresholds.heavyMs)
}
let nextGuest = 0
let nextPing = 0
let testHooks = false
const numbers = new WeakMap<
  Sandbox,
  () => { host: Host; guest: number } | undefined
>()

let compiled: Promise<WebAssembly.Module> | undefined
/**
 * The QuickJS WebAssembly, read and compiled once for the process, and
 * kept when the host thread ends: compiling it again for each new host
 * left more memory behind than keeping it does.
 */
function compiledQuickJS(): Promise<WebAssembly.Module> {
  compiled ??= (async () => {
    const url = import.meta.url.endsWith(".ts")
      ? import.meta.resolve("@jitl/quickjs-ng-wasmfile-release-sync/wasm")
      : new URL("./plugin-quickjs.wasm", import.meta.url).href
    return WebAssembly.compile(await readFile(new URL(url)))
  })()
  return compiled
}

function post(state: Host, message: MainMessage) {
  if (!state.ended) state.worker.postMessage(encodeMessage(message), [])
}

/**
 * The thread is gone. `stuck` is the watchdog's verdict, `crashed` the
 * thread ending by itself. The guest that was running answers for either;
 * the rest only lost their host. With nobody running there is nobody to
 * single out, so each takes it as a failure of its own, which keeps a
 * host that dies again and again from being restarted forever.
 */
function endHost(
  state: Host,
  reason: "stopped" | "crashed" | "stuck",
  message: string,
) {
  if (state.ended) return
  state.ended = true
  clearTimeout(state.idle)
  clearInterval(state.heartbeat)
  for (const timer of state.pings.values()) clearTimeout(timer)
  state.pings.clear()
  const culprit = Atomics.load(state.current, 0)
  const views = [...state.views]
  state.views.clear()
  for (const [guest, view] of views) {
    if (reason === "stopped")
      view.finish({ kind: "stopped", message: "Sandbox stopped" })
    else if (guest === culprit && reason === "stuck")
      view.finish({ kind: "limit", message }, "limit")
    else if (guest === culprit || culprit === 0)
      view.finish({ kind: "crashed", message })
    else
      view.finish({
        kind: "host",
        message: "The plugin host restarted because of another plugin",
      })
  }
  void state.worker.terminate()
}

function pingHost(state: Host) {
  // One unanswered ping says as much as two.
  if (state.ended || state.closing || state.pings.size > 0) return
  const id = ++nextPing
  const timer = setTimeout(
    () =>
      endHost(
        state,
        "stuck",
        "The plugin kept the thread for more than 5 seconds",
      ),
    PING_MS,
  )
  timer.unref()
  state.pings.set(id, timer)
  post(state, { type: "ping", id })
}

/**
 * One look at the host thread. A guest that holds the thread holds every
 * other plugin up, so a run that outlasts its CPU limit by the grace is
 * ended from here, by ending the thread, whether or not QuickJS ever asks
 * the interrupt handler.
 */
function watch(state: Host) {
  if (state.ended || state.closing) return
  const guest = Atomics.load(state.current, 0)
  const entry = Atomics.load(state.current, 1)
  const now = performance.now()
  sampleLoad(state, now)
  const seen = state.watching
  state.busy =
    state.share >= thresholds.busy ||
    !!(guest && seen?.guest === guest && seen.entry === entry)
  if (guest === 0) state.watching = undefined
  else if (!seen || seen.guest !== guest || seen.entry !== entry)
    state.watching = { guest, entry, since: now }
  else {
    const allowed =
      (state.views.get(guest)?.cpuMs ?? DEFAULT_LIMITS.cpuMs) + WATCH_GRACE_MS
    if (now - seen.since > allowed) {
      endHost(
        state,
        "stuck",
        `The plugin ran for more than ${Math.round(allowed / 1000)} seconds without a pause`,
      )
      return
    }
  }
  // A thread stuck outside any guest shows only by not answering.
  if (state.views.size > 0 && ++state.looks % PING_EVERY === 0) pingHost(state)
}

function closeHost(state: Host): Promise<void> {
  if (state.ended) return state.exited
  if (!state.closing) {
    state.closing = true
    clearTimeout(state.idle)
    clearInterval(state.heartbeat)
    // Whoever waits for the end must get it, also from an empty host that
    // no longer kept the process alive.
    state.worker.ref()
    state.worker.postMessage(encodeMessage({ type: "close" }), [])
    const hardStop = setTimeout(() => void state.worker.terminate(), 250)
    void state.exited.then(() => clearTimeout(hardStop))
  }
  return state.exited
}

/** Integrate completed entries plus the current entry, even during a spin. */
function sampleLoad(state: Host, now: number) {
  for (const [guest, view] of state.views) {
    const sequence = Atomics.load(state.load, view.slot * 4 + 2)
    if (
      sequence % 2n ||
      Atomics.load(state.load, view.slot * 4 + 3) !== BigInt(guest)
    )
      continue
    const start = Number(Atomics.load(state.load, view.slot * 4 + 1)) / 1000
    const completed = Number(Atomics.load(state.load, view.slot * 4)) / 1000
    if (sequence !== Atomics.load(state.load, view.slot * 4 + 2)) continue
    const total = completed + (start ? Math.max(0, now - start) : 0)
    state.total += Math.max(0, total - view.total)
    view.total = total
    view.share = share(view.samples, now, total)
    if (view.share >= thresholds.hot) markHeavy(view.pluginId, now)
  }
  state.share = share(state.samples, now, state.total)
  if (state.share < thresholds.hot || state.views.size < 2) return
  const hottest = [...state.views.values()].sort(
    (a, b) => b.share - a.share,
  )[0]!
  markHeavy(hottest.pluginId, now)
  for (const view of state.views.values()) {
    if (view === hottest || now - view.crowdedAt < thresholds.windowMs) continue
    view.crowdedAt = now
    // Callers may detach a view while this loop is running.
    view.onCrowded?.()
  }
}
function share(samples: Load[], now: number, total: number): number {
  samples.push({ at: now, total })
  const cutoff = now - thresholds.windowMs
  while (samples.length > 1 && samples[1]!.at <= cutoff) samples.shift()
  const first = samples[0]!
  const next = samples[1]
  const baseline =
    first.at < cutoff && next && next.at > first.at
      ? first.total +
        ((next.total - first.total) * (cutoff - first.at)) /
          (next.at - first.at)
      : first.total
  return Math.min(1, Math.max(0, (total - baseline) / thresholds.windowMs))
}
function idleHost(state: Host) {
  clearTimeout(state.idle)
  const last =
    [...hosts].filter((item) => !item.ended && !item.closing).length <= 1
  const remaining =
    (last ? thresholds.idleMs : thresholds.spareMs) -
    (performance.now() - state.emptySince)
  if (remaining <= 0) void closeHost(state)
  else state.idle = setTimeout(() => idleHost(state), remaining).unref()
}
/** Reuse after ended/stopped; the worker resets the slot before starting again. */
function releaseSlot(state: Host, guest: number) {
  const slot = state.slots.get(guest)
  if (slot === undefined) return
  state.slots.delete(guest)
  state.free.push(slot)
}
function leave(state: Host, guest: number) {
  sampleLoad(state, performance.now())
  state.views.delete(guest)
  if (state.ended || state.closing || state.views.size > 0) return
  state.worker.unref()
  state.emptySince = performance.now()
  idleHost(state)
}

function openHost(wasmModule: WebAssembly.Module): Host {
  const shared = new SharedArrayBuffer(16 + LOAD_SLOTS * 32)
  const development = import.meta.url.endsWith(".ts")
  const worker = new Worker(
    new URL(
      development ? "./bootstrap.mjs" : "./plugin-worker.mjs",
      import.meta.url,
    ),
    {
      workerData: { wasmModule, current: shared, testHooks },
      name: "plugin-host",
      env: {},
      argv: [],
      execArgv: [],
      stdin: false,
      stdout: true,
      stderr: true,
      // The thread handles one message at a time, so its own heap holds
      // a few copies of one message of 8 MB at most, however many guests
      // there are: guests' data is in their WebAssembly memories, and
      // what waits to be handled is outside any heap. 192 MB leaves
      // room for the bridge itself several times over.
      resourceLimits: {
        maxOldGenerationSizeMb: 192,
        maxYoungGenerationSizeMb: 4,
        stackSizeMb: 4,
      },
    },
  )
  worker.stdout.resume()
  worker.stderr.resume()
  const exit = Promise.withResolvers<void>()
  const state: Host = {
    id: ++nextThread,
    load: new BigInt64Array(shared, 16),
    slots: new Map(),
    free: Array.from({ length: LOAD_SLOTS }, (_, i) => LOAD_SLOTS - i - 1),
    total: 0,
    share: 0,
    busy: false,
    emptySince: performance.now(),
    samples: [{ at: performance.now(), total: 0 }],
    worker,
    views: new Map(),
    current: new Int32Array(shared, 0, 2),
    pings: new Map(),
    watching: undefined,
    looks: 0,
    heartbeat: setInterval(() => watch(state), WATCH_MS),
    idle: undefined,
    ended: false,
    closing: false,
    exited: exit.promise,
  }
  state.heartbeat.unref()
  worker.on("message", (text: string) => route(state, text))
  worker.on("error", (cause) =>
    endHost(
      state,
      "crashed",
      (cause instanceof Error ? cause.message : "The plugin host failed").slice(
        0,
        2000,
      ),
    ),
  )
  worker.on("exit", (code) => {
    endHost(
      state,
      state.closing ? "stopped" : "crashed",
      `The plugin host exited (${code})`,
    )
    hosts.delete(state)
    exit.resolve()
  })
  hosts.add(state)
  // A previously last, empty thread is now a spare.
  for (const other of hosts)
    if (
      other !== state &&
      !other.ended &&
      !other.closing &&
      other.views.size === 0
    )
      idleHost(other)
  return state
}

function place(
  pluginId: string,
  wasmModule: WebAssembly.Module,
): Host | undefined {
  for (const state of hosts) watch(state)
  const available = [...hosts].filter(
    (state) => !state.ended && !state.closing && state.free.length > 0,
  )
  const least = () =>
    available.sort(
      (a, b) => a.share - b.share || a.views.size - b.views.size,
    )[0]
  if (isHeavy(pluginId)) {
    const empty = available.find((state) => state.views.size === 0)
    if (empty) return empty
  } else {
    const packed = available
      .filter(
        (state) =>
          !state.busy &&
          ![...state.views.values()].some((view) => isHeavy(view.pluginId)),
      )
      .sort((a, b) => b.views.size - a.views.size)[0]
    if (packed) return packed
  }
  if (hosts.size < threadCap) return openHost(wasmModule)
  const fallback = least()
  if (fallback) return fallback
  if ([...hosts].some((state) => state.ended || state.closing)) return undefined
  throw new SandboxError("limit", "No plugin host has a free guest slot")
}

function route(state: Host, text: string) {
  let message: WorkerMessage
  try {
    message = WorkerMessage.parse(JSON.parse(WireText.parse(text)))
  } catch {
    endHost(state, "crashed", "The plugin host sent a message nobody can read")
    return
  }
  if (message.type === "pong") {
    clearTimeout(state.pings.get(message.id))
    state.pings.delete(message.id)
    return
  }
  if (message.type === "ended" || message.type === "stopped")
    releaseSlot(state, message.guest)
  // A guest that ended may still have messages on the way. They go nowhere.
  const view = state.views.get(message.guest)
  if (!view) return
  void view.receive(message).catch(() =>
    view.finish({
      kind: "crashed",
      message: "The plugin's sandbox sent a message nobody can read",
    }),
  )
}

/** End all host threads for shutdown. Never rejects. */
export async function stopSandboxHost(): Promise<void> {
  generation++
  await Promise.all(
    [...hosts].map(async (state) => {
      for (const view of state.views.values())
        view.finish({ kind: "stopped", message: "Sandbox stopped" })
      await closeHost(state)
    }),
  )
}

/** For the checks: let a thread be stuck on purpose, and stick it. */
export const sandboxTestHooks = {
  enable() {
    testHooks = true
  },
  configure(options: Partial<typeof thresholds> & { cap?: number }) {
    if (!testHooks) throw new Error("Sandbox test hooks are off")
    if (options.cap !== undefined) threadCap = ThreadCap.parse(options.cap)
    const { cap: _cap, ...changes } = options
    Object.assign(thresholds, changes)
  },
  threads() {
    if (!testHooks) throw new Error("Sandbox test hooks are off")
    return [...hosts].map((state) => ({
      thread: state.id,
      share: state.share,
      closing: state.closing,
      guests: [...state.views].map(([guest, view]) => ({
        guest,
        pluginId: view.pluginId,
        share: view.share,
        heavy: isHeavy(view.pluginId),
      })),
    }))
  },
  /** Keep the thread busy as if `sandbox` were stuck in its own code. */
  spin(sandbox: Sandbox, ms: number) {
    if (!testHooks) throw new Error("Sandbox test hooks are off")
    const found = numbers.get(sandbox)?.()
    if (found) post(found.host, { type: "spin", guest: found.guest, ms })
  },
}

export function createSandbox(options: {
  pluginId: string
  code: string
  context: { plugin: object; server: object; config: object }
  limits?: Partial<SandboxLimits>
  hostCall: HostCall
  onCrowded?: () => void
}): Sandbox {
  const limits = Limits.parse({ ...DEFAULT_LIMITS, ...options.limits })
  const exit = Promise.withResolvers<SandboxExit>()
  const pending = new Map<number, Pending>()
  /** Calls the server gave up on whose handlers haven't ended yet. */
  const lingering = new Map<number, NodeJS.Timeout>()
  const hostCalls = new Map<number, AbortController>()
  let state: Host | undefined
  let guest = 0
  let ended = false
  let stopping = false
  let nextId = 0
  let active = 0
  let callBytes = 0
  let hostBytes = 0
  let handlers = new Set<string>()
  let starting: Promise<{ handlers: string[] }> | undefined
  let stoppingPromise: Promise<void> | undefined

  function finish(
    result: SandboxExit,
    errorKind: SandboxError["kind"] = "crashed",
  ) {
    if (ended) return
    if (
      result.kind === "limit" &&
      /CPU|synchronous|without a pause|kept the thread/i.test(result.message)
    )
      markHeavy(options.pluginId)
    ended = true
    // The exit first, then the calls it ends: whoever waits on both hears
    // why the sandbox went before hearing that its call failed, so a
    // sandbox that only lost its host is never taken for one that crashed.
    exit.resolve(result)
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.cleanup()
      item.reject(new SandboxError(errorKind, result.message))
    }
    pending.clear()
    for (const timer of lingering.values()) clearTimeout(timer)
    lingering.clear()
    for (const controller of hostCalls.values()) controller.abort()
    hostCalls.clear()
    if (state) leave(state, guest)
  }
  function send(message: MainMessage) {
    if (state) post(state, message)
  }
  function drain() {
    if (ended) return
    for (const item of pending.values()) {
      if (active >= 16) break
      if (
        item.active ||
        item.path === "@start" ||
        (stopping && item.path !== "dispose")
      )
        continue
      item.active = true
      active++
      send({
        type: "call",
        guest,
        id: item.id,
        path: item.path,
        json: item.json,
      })
      // Sent: the arguments needn't be held here as well.
      item.json = ""
    }
  }
  function remove(item: Pending) {
    pending.delete(item.id)
    clearTimeout(item.timer)
    item.cleanup()
    callBytes -= item.size
    if (item.active) active--
    drain()
  }
  function request(
    path: string,
    json: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (ended || (stopping && path !== "dispose"))
      return Promise.reject(new SandboxError("crashed", "Sandbox has exited"))
    if (signal?.aborted)
      return Promise.reject(new SandboxError("timeout", "Sandbox call aborted"))
    const size = Buffer.byteLength(json)
    if (callBytes + size > BUDGET_BYTES)
      return Promise.reject(
        new SandboxError(
          "limit",
          "Too much data is waiting in calls to this plugin",
        ),
      )
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const expire = () => {
        const item = pending.get(id)
        if (!item) return
        if (item.active && !path.startsWith("@") && !stopping) {
          // The handler is told to stop but may not listen. Its place
          // stays taken until the guest says it ended.
          pending.delete(id)
          clearTimeout(item.timer)
          item.cleanup()
          callBytes -= item.size
          lingering.set(
            id,
            setTimeout(() => {
              send({ type: "stop", guest })
              finish(
                {
                  kind: "limit",
                  message: `A handler kept running for ${Math.round(limits.settleMs / 1000)} seconds after its call was cancelled`,
                },
                "limit",
              )
            }, limits.settleMs).unref(),
          )
        } else remove(item)
        reject(
          new SandboxError(
            "timeout",
            signal?.aborted ? "Sandbox call aborted" : "Sandbox call timed out",
          ),
        )
        send({ type: "cancel", guest, id })
        if (state) pingHost(state)
      }
      const item: Pending = {
        id,
        path,
        json,
        size,
        resolve,
        reject,
        active: false,
        timer: setTimeout(expire, timeoutMs),
        cleanup: () => signal?.removeEventListener("abort", expire),
      }
      pending.set(id, item)
      callBytes += size
      signal?.addEventListener("abort", expire, { once: true })
      try {
        if (path === "@start") {
          send({
            type: "start",
            guest,
            slot: state!.slots.get(guest)!,
            id,
            code: options.code,
            context: JSON.stringify(options.context),
            limits,
          })
        } else drain()
      } catch {
        if (pending.delete(id)) {
          clearTimeout(item.timer)
          item.cleanup()
          callBytes -= size
          if (item.active) active--
        }
        reject(
          new SandboxError(
            "protocol",
            "Sandbox input must be JSON of at most 8 MB",
          ),
        )
      }
    })
  }
  async function receive(message: GuestMessage) {
    if (ended) return
    switch (message.type) {
      case "ended":
        finish(
          { kind: message.kind, message: message.message },
          message.kind === "limit" ? "limit" : "crashed",
        )
        break
      case "stopped":
        finish({ kind: "stopped", message: "Sandbox stopped" })
        break
      case "reply": {
        const item = pending.get(message.id)
        if (!item) {
          // A cancelled call's handler has ended. Its place is free.
          const timer = lingering.get(message.id)
          if (!timer) return
          clearTimeout(timer)
          lingering.delete(message.id)
          active--
          drain()
          return
        }
        const envelope = Envelope.parse(
          JSON.parse(WireText.parse(message.json)),
        )
        if (envelope.ok) {
          const result = JSON.parse(envelope.json)
          remove(item)
          item.resolve(result)
        } else {
          remove(item)
          item.reject(
            new SandboxError(
              "guest",
              envelope.error.message,
              envelope.error.name,
              envelope.error.status,
            ),
          )
        }
        break
      }
      case "host": {
        // Validate the envelope before parsing the opaque JSON arguments. The manager
        // validates each host operation's own schema and permission separately.
        WireText.parse(message.json)
        const size = Buffer.byteLength(message.json)
        let json: string
        let ok = true
        if (hostBytes + size > BUDGET_BYTES) {
          send({
            type: "answer",
            guest,
            id: message.id,
            json: JSON.stringify({
              message: "Too much data is waiting in this plugin's host calls",
            }),
            ok: false,
          })
          return
        }
        hostBytes += size
        const controller = new AbortController()
        hostCalls.set(message.id, controller)
        try {
          const result = await options.hostCall(
            message.name,
            JSON.parse(message.json),
            controller.signal,
          )
          json = JSON.stringify(result ?? null)
          encodeMessage({ type: "answer", guest, id: message.id, json, ok })
        } catch (cause) {
          ok = false
          const parsed = HostError.safeParse(cause)
          json = JSON.stringify({
            message: (parsed.data?.message ?? "Host call failed").slice(
              0,
              2000,
            ),
          })
        } finally {
          hostBytes -= size
          hostCalls.delete(message.id)
        }
        if (!ended) send({ type: "answer", guest, id: message.id, json, ok })
      }
    }
  }
  const sandbox: Sandbox = {
    get thread() {
      return state?.id
    },
    exited: exit.promise,
    start() {
      if (ended || stopping)
        return Promise.reject(new SandboxError("crashed", "Sandbox has exited"))
      if (starting) return starting
      starting = (async (): Promise<{ handlers: string[] }> => {
        const epoch = generation
        // The shared watch header stores signed 32-bit guest ids. Never wrap it.
        if (nextGuest >= 0x7fffffff)
          throw new SandboxError(
            "limit",
            "Plugin guest ids are exhausted; restart the server",
          )
        guest = ++nextGuest
        const wasmModule = await compiledQuickJS()
        if (epoch !== generation || ended || stopping)
          throw new SandboxError("crashed", "Sandbox has exited")
        let opened = place(options.pluginId, wasmModule)
        // Closing threads count against the cap until they actually exit.
        while (!opened) {
          await Promise.race(
            [...hosts]
              .filter((host) => host.ended || host.closing)
              .map((host) => host.exited),
          )
          if (epoch !== generation || ended || stopping)
            throw new SandboxError("crashed", "Sandbox has exited")
          opened = place(options.pluginId, wasmModule)
        }
        state = opened
        const slot = opened.free.pop()!
        opened.slots.set(guest, slot)
        opened.views.set(guest, {
          pluginId: options.pluginId,
          slot,
          total: 0,
          share: 0,
          samples: [{ at: performance.now(), total: 0 }],
          crowdedAt: -Infinity,
          onCrowded: options.onCrowded,
          cpuMs: limits.cpuMs,
          receive,
          finish,
        })
        clearTimeout(opened.idle)
        opened.idle = undefined
        opened.worker.ref()
        return request("@start", "[]", limits.startMs).then((value) => {
          const result = Handlers.parse(value)
          handlers = new Set(result.handlers)
          return result
        })
      })()
      return starting
    },
    call(path, args, callOptions) {
      if (ended || stopping)
        return Promise.reject(new SandboxError("crashed", "Sandbox has exited"))
      if (!handlers.has(path))
        return Promise.reject(
          new SandboxError("protocol", `Unknown sandbox handler: ${path}`),
        )
      try {
        const json = JSON.stringify(args)
        encodeMessage({ type: "call", guest, id: nextId + 1, path, json })
        return request(
          path,
          json,
          callOptions?.timeoutMs ?? limits.callMs,
          callOptions?.signal,
        )
      } catch {
        return Promise.reject(
          new SandboxError(
            "protocol",
            "Sandbox arguments must be JSON of at most 8 MB",
          ),
        )
      }
    },
    diagnostics() {
      return request("@diagnostics", "[]", 2000)
    },
    stop() {
      if (stoppingPromise) return stoppingPromise
      stopping = true
      stoppingPromise = (async () => {
        for (const item of pending.values()) {
          // Handlers still at work hear of it before `dispose` runs.
          if (item.active) send({ type: "cancel", guest, id: item.id })
          remove(item)
          item.reject(new SandboxError("crashed", "Sandbox is stopping"))
        }
        if (!ended && handlers.has("dispose")) {
          try {
            await request("dispose", "[]", 2000)
          } catch {
            /* Disposal is best effort. */
          }
        }
        if (!ended && state && guest) {
          send({ type: "stop", guest })
          // The thread may be busy with another plugin. This sandbox is
          // over either way, and the thread drops it when it gets there.
          const hardStop = setTimeout(
            () => finish({ kind: "stopped", message: "Sandbox stopped" }),
            250,
          )
          await exit.promise
          clearTimeout(hardStop)
        } else finish({ kind: "stopped", message: "Sandbox stopped" })
      })()
      return stoppingPromise
    },
  }
  numbers.set(sandbox, () =>
    state && guest ? { host: state, guest } : undefined,
  )
  return sandbox
}
