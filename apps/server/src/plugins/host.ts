import type { PluginConfigValues, PluginManifest } from "@matinee/contracts"
import { t, type SchemaBoundaryInput } from "@matinee/contracts/schema"
import { pluginStorage } from "@matinee/db"
import { and, eq, like, sql } from "drizzle-orm"

import { db } from "../db"
import {
  guardedFetch,
  GuardedFetchError,
  ruleForAddress,
  type HostRule,
} from "../net/guarded-fetch"
import { errorText } from "./files"
import { pluginLog } from "./logs"
import type { HostCall } from "./sandbox"
import { Json } from "./schema"

const Key = t.string().min(1).max(128)
const Get = t.object({ key: Key })
const SetValue = t.strictObject({ key: Key, value: Json })
const Keys = t.strictObject({ prefix: t.string().max(128).nullable() })
const Log = t.strictObject({
  level: t.enum(["debug", "info", "warn", "error"]),
  message: t.string().max(100000),
  detail: t.string().max(2000).nullable(),
})
const Token = t.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const Abort = t.strictObject({ token: Token })
const Fetch = t.strictObject({
  token: Token,
  url: t.string().max(10000),
  method: t.string().min(1).max(32),
  headers: t
    .array(
      t.custom<[string, string]>(
        (value) =>
          t.array(t.string().max(10000)).min(2).max(2).safeParse(value).success,
      ),
    )
    .max(100),
  body: t
    .string()
    .max(1_398_104)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .nullable(),
})
const Totals = t.object({ bytes: t.coerce.number(), count: t.coerce.number() })
const Size = t.object({ bytes: t.coerce.number() })
const storageUsage = new Map<string, { bytes: number; count: number }>()
/** Call after storage is removed, after draining the old worker's writes. */
export function forgetHostStorage(id: string): void {
  storageUsage.delete(id)
}
/**
 * The largest response a plugin can read. It crosses to the sandbox as
 * base64 in one message of 8 MB at most, which is what 5 MB becomes with
 * room for the headers.
 */
const RESPONSE_BYTES = 5 * 1024 * 1024
const storageWrites = new Map<string, Promise<void>>()
/** A worker can exit while its last database write is still completing. */
export async function drainHostStorage(id: string): Promise<void> {
  await storageWrites.get(id)
}

export function networkRules(
  manifest: PluginManifest,
  saved: PluginConfigValues,
): HostRule[] {
  const rules: HostRule[] = manifest.permissions.network.map((pattern) => ({
    pattern,
    port: 443,
  }))
  for (const field of manifest.config) {
    if (field.type !== "url" || !field.network) continue
    const value = t.string().safeParse(saved[field.key])
    const rule = value.success ? ruleForAddress(value.data) : undefined
    if (rule) rules.push(rule)
  }
  return rules
}

export async function createHost(
  manifest: PluginManifest,
  rules: HostRule[],
): Promise<HostCall> {
  const id = manifest.id
  let usage = storageUsage.get(id)
  if (!usage) {
    const [total] = await db
      .select({
        bytes: sql`coalesce(sum(octet_length(${pluginStorage.value}::text)), 0)`,
        count: sql`count(*)`,
      })
      .from(pluginStorage)
      .where(eq(pluginStorage.pluginId, id))
    usage = Totals.parse(total)
    storageUsage.set(id, usage)
  }
  const totals = usage
  let storageTail = Promise.resolve()
  let active = 0
  const waiting: (() => void)[] = []
  const requests = new Map<number, AbortController>()
  async function http(args: SchemaBoundaryInput, signal: AbortSignal) {
    const { token } = Fetch.parse(args)
    if (requests.has(token)) throw new Error("Duplicate HTTP request token")
    if (requests.size >= 128)
      throw new Error("At most 128 pending HTTP requests")
    const controller = new AbortController()
    requests.set(token, controller)
    try {
      return await performHttp(
        args,
        AbortSignal.any([signal, controller.signal]),
      )
    } finally {
      requests.delete(token)
    }
  }
  async function performHttp(args: SchemaBoundaryInput, signal: AbortSignal) {
    const request = Fetch.parse(args)
    const body =
      request.body === null ? null : Buffer.from(request.body, "base64")
    if (body && body.byteLength > 1024 * 1024)
      throw new Error("HTTP request bodies must be at most 1 MB")
    if (active >= 8) await new Promise<void>((resolve) => waiting.push(resolve))
    else active++
    try {
      signal.throwIfAborted()
      const headers = Object.fromEntries(
        request.headers.map(([key, value]) => [key.toLowerCase(), value]),
      )
      const result = await guardedFetch(request.url, {
        method: request.method,
        headers,
        body,
        allow: rules,
        userAgent: headers["user-agent"] ?? `Matinee-Plugin/${id}`,
        maxBytes: RESPONSE_BYTES,
        timeoutMs: 20000,
        signal,
      })
      return { ...result, body: Buffer.from(result.body).toString("base64") }
    } catch (cause) {
      if (cause instanceof GuardedFetchError) {
        const host = URL.parse(request.url)?.host ?? "that address"
        if (cause.code === "blocked")
          throw new Error(
            `The request to ${host} wasn't allowed: ${cause.message}. A plugin reaches only the hosts in its network permission and the addresses in its settings.`,
          )
        if (cause.code === "too-large")
          throw new Error(
            `The answer from ${host} was larger than 5 MB, the most a plugin can read.`,
          )
        if (cause.code === "timeout")
          throw new Error(`The request to ${host} took longer than 20 seconds.`)
        throw new Error(
          `Couldn't reach ${host}: ${cause.message.replace(/^Request failed: /, "")}`,
        )
      }
      throw cause
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
  async function storage(
    name: string,
    args: SchemaBoundaryInput,
    signal: AbortSignal,
  ) {
    if (!manifest.permissions.storage)
      throw new Error("This plugin doesn't have the storage permission")
    const ready = storageTail
    const done = Promise.withResolvers<void>()
    storageTail = done.promise
    storageWrites.set(id, done.promise)
    await ready
    try {
      signal.throwIfAborted()
      if (name === "storage.keys") {
        const { prefix } = Keys.parse(args)
        const escaped = (prefix ?? "").replace(/[\\%_]/g, "\\$&")
        const keys = await db
          .select({ key: pluginStorage.key })
          .from(pluginStorage)
          .where(
            and(
              eq(pluginStorage.pluginId, id),
              like(pluginStorage.key, `${escaped}%`),
            ),
          )
          .orderBy(pluginStorage.key)
          .limit(1000)
        return { keys: keys.map((row) => row.key) }
      }
      const { key } = Get.parse(args)
      const filter = and(
        eq(pluginStorage.pluginId, id),
        eq(pluginStorage.key, key),
      )
      if (name === "storage.get") {
        const [row] = await db
          .select({ value: pluginStorage.value })
          .from(pluginStorage)
          .where(filter)
        return { value: Json.parse(row?.value ?? null) }
      }
      const [old] = await db
        .select({ bytes: sql`octet_length(${pluginStorage.value}::text)` })
        .from(pluginStorage)
        .where(filter)
      const before = old ? Size.parse(old).bytes : 0
      if (name === "storage.delete") {
        await db.delete(pluginStorage).where(filter)
        totals.bytes -= before
        if (old) totals.count--
        return null
      }
      if (name !== "storage.set")
        throw new Error(`Unknown storage call: ${name}`)
      const { value } = SetValue.parse(args)
      const json = JSON.stringify(value)
      if (Buffer.byteLength(json) > 65536)
        throw new Error("Storage values must be at most 64 KB of JSON")
      const result = await db.execute(
        sql`select octet_length(${json}::jsonb::text) as bytes`,
      )
      const size = result.rows[0]
      const bytes = Size.parse(size).bytes
      if (bytes > 65536)
        throw new Error("Storage values must be at most 64 KB of JSON")
      if (!old && totals.count >= 1000)
        throw new Error(
          "This plugin has reached its storage limit of 1000 keys. Delete a key first.",
        )
      if (totals.bytes - before + bytes > 5 * 1024 * 1024)
        throw new Error(
          "This plugin has reached its storage limit of 5 MB. Delete some values first.",
        )
      await db
        .insert(pluginStorage)
        .values({ pluginId: id, key, value })
        .onConflictDoUpdate({
          target: [pluginStorage.pluginId, pluginStorage.key],
          set: { value, updatedAt: new Date() },
        })
      totals.bytes += bytes - before
      if (!old) totals.count++
      return null
    } finally {
      done.resolve()
      if (storageWrites.get(id) === done.promise) storageWrites.delete(id)
    }
  }
  return async (name, args, signal) => {
    try {
      if (name === "log") {
        const line = Log.parse(args)
        pluginLog(
          id,
          line.level,
          `${line.message}${line.detail ? ` ${line.detail}` : ""}`,
          true,
        )
        return null
      }
      if (name === "http.abort") {
        requests.get(Abort.parse(args).token)?.abort()
        return null
      }
      if (name === "http.fetch") return await http(args, signal)
      if (name.startsWith("storage.")) return await storage(name, args, signal)
      throw new Error(`Unknown host call: ${name}`)
    } catch (cause) {
      // The plugin's promise rejects with this message, and the log keeps
      // it for the admin, since a plugin may swallow the failure.
      const message = errorText(cause)
      pluginLog(id, "warn", `${name}: ${message}`, true)
      throw new Error(message, { cause })
    }
  }
}
