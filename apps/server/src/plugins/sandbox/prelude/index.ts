// Timers must call guest callbacks from a promise continuation.
/* oxlint-disable promise/no-callback-in-promise */
// This code runs only inside QuickJS. Runtime checks here cannot use host schemas.
/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type */
import URL from "core-js-pure/actual/url"
import URLSearchParams from "core-js-pure/actual/url-search-params"

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type RawHost = (name: string, json: string) => string | Promise<string>
declare const __host: RawHost
const raw = __host
Reflect.deleteProperty(globalThis, "__host")
const stringify = JSON.stringify
const parse = JSON.parse
const byteChars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
function btoaGuest(input: string): string {
  const text = String(input)
  let out = ""
  for (let i = 0; i < text.length; i += 3) {
    const a = text.charCodeAt(i),
      b = text.charCodeAt(i + 1),
      c = text.charCodeAt(i + 2)
    if (a > 255 || b > 255 || c > 255)
      throw new TypeError("btoa requires Latin-1 text")
    out +=
      byteChars.charAt(a >> 2) +
      byteChars.charAt(((a & 3) << 4) | (b >> 4)) +
      (i + 1 < text.length
        ? byteChars.charAt(((b & 15) << 2) | (c >> 6))
        : "=") +
      (i + 2 < text.length ? byteChars.charAt(c & 63) : "=")
  }
  return out
}
function atobGuest(input: string): string {
  let text = String(input).replace(/[\t\n\f\r ]/g, "")
  if (text.length % 4 === 0) text = text.replace(/={1,2}$/, "")
  if (text.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(text))
    throw new TypeError("Invalid base64")
  const chunks: string[] = []
  let chunk = "",
    bits = 0,
    value = 0
  for (let i = 0; i < text.length; i++) {
    value = (value << 6) | byteChars.indexOf(text.charAt(i))
    bits += 6
    if (bits >= 8) {
      bits -= 8
      chunk += String.fromCharCode((value >> bits) & 255)
      if (chunk.length === 8192) {
        chunks.push(chunk)
        chunk = ""
      }
    }
  }
  return chunks.join("") + chunk
}
function fromBase64(text: string): Uint8Array {
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4) - padding)
  let output = 0
  // Keep each numeric JSON array below the bridge cap and the guest memory
  // limit. QuickJS parses and copies these in native code, without a JS loop
  // for every byte of a large response.
  for (let offset = 0; offset < text.length; offset += 699048) {
    // SAFETY: The worker's local decoder returns only an array of byte numbers.
    const chunk = local("base64.decode", {
      body: text.slice(offset, offset + 699048),
    }) as number[]
    bytes.set(chunk, output)
    output += chunk.length
  }
  return bytes
}
function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)))
  return btoaGuest(chunks.join(""))
}
function local(name: string, args: Json): Json {
  // SAFETY: Worker-local operations return synchronously, never a promise.
  return parse(raw(name, stringify(args)) as string)
}
async function host(name: string, args: Json): Promise<Json> {
  return parse(await raw(name, stringify(args)))
}
class Encoder {
  readonly encoding = "utf-8"
  encode(text = "") {
    return fromBase64(String(local("utf8.encode", { text: String(text) })))
  }
}
class Decoder {
  readonly encoding = "utf-8"
  readonly fatal: boolean
  readonly ignoreBOM: boolean
  constructor(
    label = "utf-8",
    options: { fatal?: boolean; ignoreBOM?: boolean } = {},
  ) {
    if (!["utf-8", "utf8", "unicode-1-1-utf-8"].includes(label.toLowerCase()))
      throw new RangeError("Only UTF-8 is supported")
    this.fatal = options.fatal ?? false
    this.ignoreBOM = options.ignoreBOM ?? false
  }
  decode(input: ArrayBuffer | ArrayBufferView = new Uint8Array()) {
    const view = ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : new Uint8Array(input)
    return String(
      local("utf8.decode", {
        body: toBase64(view),
        fatal: this.fatal,
        ignoreBOM: this.ignoreBOM,
      }),
    )
  }
}
/**
 * Timers live here and share one timer of the host's, set for the earliest
 * of them. A plugin can then hold many, such as an `AbortSignal.timeout`
 * for each request, for the cost of one.
 */
type Pending = { run: () => void; counted: boolean }
let timerId = 0
let counted = 0
const timers = new Map<number, Pending>()
/** Ids by the time they are due, earliest first. A cleared id stays until its turn. */
const due: { at: number; id: number }[] = []
let armed: { id: number; at: number } | undefined
let hostTimer = 0
function arm() {
  while (due[0] && !timers.has(due[0].id)) due.shift()
  const next = due[0]
  if (!next) {
    if (armed) local("timer.clear", { id: armed.id })
    armed = undefined
    return
  }
  if (armed && armed.at <= next.at) return
  if (armed) local("timer.clear", { id: armed.id })
  const id = ++hostTimer
  armed = { id, at: next.at }
  const fire = () => {
    if (armed?.id !== id) return
    armed = undefined
    const now = Date.now()
    while (due[0] && due[0].at <= now) {
      // SAFETY: The loop condition has just read this entry.
      const entry = due.shift()!
      const timer = timers.get(entry.id)
      if (!timer) continue
      timers.delete(entry.id)
      if (timer.counted) counted--
      try {
        timer.run()
      } catch (cause) {
        log.error?.("A timer's callback threw", error(cause).message)
      }
    }
    arm()
  }
  void host("timer.wait", {
    id,
    delay: Math.max(0, next.at - Date.now()),
  }).then(fire, fire)
}
/** `counted` is false for timers the plugin can't see, which have their own limit. */
function later(run: () => void, delay: number, isCounted: boolean): number {
  const id = ++timerId
  const at = Date.now() + Math.min(60_000, Math.max(0, Number(delay) || 0))
  timers.set(id, { run, counted: isCounted })
  if (isCounted) counted++
  // Most timers are due after the ones before them, so look from the end.
  let index = due.length
  while (index > 0 && due[index - 1]!.at > at) index--
  due.splice(index, 0, { at, id })
  arm()
  return id
}
function timeout(
  callback: (...args: Json[]) => void,
  delay = 0,
  ...args: Json[]
): number {
  if (typeof callback !== "function")
    throw new TypeError("setTimeout requires a function")
  if (counted >= 100) throw new RangeError("At most 100 pending timers")
  return later(() => callback(...args), delay, true)
}
function clear(id: number) {
  const timer = timers.get(id)
  // A plugin clears only the timers it set.
  if (!timer?.counted) return
  timers.delete(id)
  counted--
  arm()
}
function randomBytes(length: number) {
  return fromBase64(String(local("crypto.randomBytes", { length })))
}
const cryptoGuest = Object.freeze({
  randomUUID: () => String(local("crypto.randomUUID", null)),
  getRandomValues<T extends ArrayBufferView>(array: T): T {
    if (
      !ArrayBuffer.isView(array) ||
      array instanceof DataView ||
      array instanceof Float32Array ||
      array instanceof Float64Array ||
      array.byteLength > 65536
    )
      throw new TypeError(
        "Expected an integer typed array of at most 65536 bytes",
      )
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(
      randomBytes(array.byteLength),
    )
    return array
  },
})
function bytes(data: string | Uint8Array) {
  return toBase64(typeof data === "string" ? new Encoder().encode(data) : data)
}
const cryptoContext = Object.freeze({
  randomUUID: cryptoGuest.randomUUID,
  randomBytes,
  async sha256(data: string | Uint8Array) {
    return fromBase64(String(local("crypto.sha256", { data: bytes(data) })))
  },
  async hmacSha256(key: string | Uint8Array, data: string | Uint8Array) {
    return fromBase64(
      String(
        local("crypto.hmacSha256", { key: bytes(key), data: bytes(data) }),
      ),
    )
  },
})
const log = Object.freeze(
  Object.fromEntries(
    ["debug", "info", "warn", "error", "log"].map((level) => [
      level,
      (message: string, detail?: Json) => {
        void host("log", {
          level: level === "log" ? "info" : level,
          message: String(message).slice(0, 2000),
          detail:
            detail === undefined ? null : stringify(detail).slice(0, 2000),
        }).catch(() => {})
      },
    ]),
  ),
)
function abortError(name = "AbortError") {
  const error = new Error(
    name === "TimeoutError"
      ? "The operation timed out"
      : "The operation was aborted",
  )
  error.name = name
  return error
}
type AbortListener = (event: { type: "abort"; target: Signal }) => void
class Signal {
  #aborted = false
  #reason: unknown
  #listeners = new Map<AbortListener, boolean>()
  #onabort: AbortListener | null = null
  #onabortListener: AbortListener = (event) => {
    this.#onabort?.(event)
  }
  get onabort() {
    return this.#onabort
  }
  set onabort(listener: AbortListener | null) {
    this.#onabort = listener
    if (listener) this.addEventListener("abort", this.#onabortListener)
    else this.removeEventListener("abort", this.#onabortListener)
  }
  get aborted() {
    return this.#aborted
  }
  get reason() {
    return this.#reason
  }
  throwIfAborted() {
    if (this.#aborted) throw this.#reason
  }
  addEventListener(
    type: string,
    listener: AbortListener,
    options?: { once?: boolean },
  ) {
    if (
      type === "abort" &&
      typeof listener === "function" &&
      !this.#listeners.has(listener)
    )
      this.#listeners.set(listener, options?.once ?? false)
  }
  removeEventListener(type: string, listener: AbortListener) {
    if (type === "abort") this.#listeners.delete(listener)
  }
  abort(reason: unknown = abortError()) {
    if (this.#aborted) return
    this.#aborted = true
    this.#reason = reason
    const event = { type: "abort", target: this } satisfies {
      type: "abort"
      target: Signal
    }
    for (const [listener, once] of Array.from(this.#listeners)) {
      if (!this.#listeners.has(listener)) continue
      if (once) this.#listeners.delete(listener)
      try {
        listener.call(this, event)
      } catch {
        /* One listener must not stop the others. */
      }
    }
  }
  static abort(reason?: unknown) {
    const signal = new Signal()
    signal.abort(reason)
    return signal
  }
  static timeout(ms: number) {
    if (!Number.isInteger(ms) || ms < 0 || ms > 60000)
      throw new RangeError("Timeout must be between 0 and 60000 milliseconds")
    // Not one of the plugin's 100 timers: a signal per request is the
    // ordinary way to use this, and nothing clears it early.
    if (timers.size - counted >= 10_000)
      throw new RangeError("At most 10000 pending timeout signals")
    const signal = new Signal()
    later(() => signal.abort(abortError("TimeoutError")), ms, false)
    return signal
  }
  static any(signals: Signal[]) {
    const result = new Signal()
    const listeners = new Map<Signal, AbortListener>()
    for (const signal of signals) {
      if (!(signal instanceof Signal))
        throw new TypeError("Expected AbortSignal")
      if (signal.aborted) {
        result.abort(signal.reason)
        return result
      }
    }
    const finish = (signal: Signal) => {
      for (const [source, listener] of listeners)
        source.removeEventListener("abort", listener)
      listeners.clear()
      result.abort(signal.reason)
    }
    for (const signal of signals) {
      if (listeners.has(signal)) continue
      const listener = () => finish(signal)
      listeners.set(signal, listener)
      signal.addEventListener("abort", listener, { once: true })
    }
    return result
  }
}
class Controller {
  readonly signal = new Signal()
  abort(reason?: unknown) {
    this.signal.abort(reason)
  }
}
function microtask(callback: () => void) {
  if (typeof callback !== "function")
    throw new TypeError("queueMicrotask requires a function")
  void Promise.resolve()
    .then(callback)
    .catch(() => {})
}
let requestToken = 0
type HeaderInput = { [key: string]: string } | [string, string][]
async function fetchGuest(
  url: string | { toString(): string },
  init: {
    method?: string
    headers?: HeaderInput
    body?: string | Uint8Array
    signal?: Signal
  } = {},
) {
  const headers = Array.isArray(init.headers)
    ? init.headers
    : Object.entries(init.headers ?? {})
  const body = init.body === undefined ? null : bytes(init.body)
  const signal = init.signal
  signal?.throwIfAborted()
  const token = ++requestToken
  let onAbort: AbortListener | undefined
  const pending = host("http.fetch", {
    token,
    url: String(url),
    method: init.method ?? "GET",
    headers,
    body,
  })
  const result = await new Promise<Json>((resolve, reject) => {
    onAbort = () => {
      reject(signal!.reason)
      void host("http.abort", { token }).catch(() => {})
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    void pending.then(resolve, reject)
  }).finally(() => {
    if (onAbort) signal?.removeEventListener("abort", onAbort)
  })
  // SAFETY: The host implements the documented http.fetch wire format. These
  // objects are JSON parsed inside the guest, with no reference to host objects.
  const response = result as {
    status: number
    statusText: string
    url: string
    headers: [string, string][]
    body: string
  }
  const entries = response.headers.map(([name, value]) => [
    name.toLowerCase(),
    value,
  ])
  const responseHeaders = Object.freeze({
    get(name: string) {
      const values = entries
        .filter(([key]) => key === name.toLowerCase())
        .map(([, value]) => value)
      return values.length ? values.join(", ") : null
    },
    entries() {
      return entries.map(([name, value]) => [name, value])[Symbol.iterator]()
    },
  })
  return Object.freeze({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    headers: responseHeaders,
    async text() {
      return String(
        local("utf8.decode", {
          body: response.body,
          fatal: false,
          ignoreBOM: false,
        }),
      )
    },
    async json() {
      return parse(
        String(
          local("utf8.decode", {
            body: response.body,
            fatal: false,
            ignoreBOM: false,
          }),
        ),
      )
    },
    async arrayBuffer() {
      return fromBase64(response.body).buffer
    },
  })
}
for (const [name, value] of Object.entries({
  AbortController: Controller,
  AbortSignal: Signal,
  queueMicrotask: microtask,
  URL,
  URLSearchParams,
  TextEncoder: Encoder,
  TextDecoder: Decoder,
  atob: atobGuest,
  btoa: btoaGuest,
  setTimeout: timeout,
  clearTimeout: clear,
  crypto: cryptoGuest,
  console: log,
  fetch: fetchGuest,
})) {
  if (typeof value === "function") {
    Object.freeze(value.prototype)
    Object.freeze(value)
  }
  Object.defineProperty(globalThis, name, {
    value,
    writable: false,
    configurable: false,
  })
}
function error(cause: unknown) {
  try {
    const object = cause instanceof Error ? cause : null
    // SAFETY: Optional fields on a thrown guest object are read only in the guest.
    const fields = object as {
      name?: unknown
      message?: unknown
      status?: unknown
    } | null
    return {
      name: (typeof fields?.name === "string" ? fields.name : "Error").slice(
        0,
        2000,
      ),
      message: String(fields?.message ?? cause).slice(0, 2000),
      status:
        typeof fields?.status === "number" && Number.isFinite(fields.status)
          ? fields.status
          : null,
    }
  } catch {
    return {
      name: "Error",
      message: "Could not serialize thrown value",
      status: null,
    }
  }
}
type Handler = (...args: unknown[]) => Json | void | Promise<Json | void>
type Handlers = {
  metadata?: { [id: string]: { [method: string]: Handler } }
  auth?: { [id: string]: { [method: string]: Handler } }
  events?: { [name: string]: Handler }
  dispose?: Handler
}
type PluginModule = {
  default?: {
    matineePlugin?: number
    setup?: (ctx: {
      plugin: Json
      server: Json
      config: Json
    }) => Handlers | Promise<Handlers>
  }
}
const table = new Map<string, { fn: Handler; owner: object }>()
async function settle(
  action: () => Promise<Json | void>,
  done: (json: string) => void,
) {
  let result: string
  try {
    result = stringify({ ok: true, json: stringify((await action()) ?? null) })
  } catch (cause) {
    result = stringify({ ok: false, error: error(cause) })
  }
  done(result)
}
const calls = new Map<number, Controller>()
function cancel(id: number) {
  calls.get(id)?.abort()
  calls.delete(id)
}
function call(
  id: number,
  path: string,
  args: string,
  done: (json: string) => void,
) {
  const controller = new Controller()
  calls.set(id, controller)
  void settle(async () => {
    try {
      const entry = table.get(path)
      if (!entry) throw new Error(`Unknown sandbox handler: ${path}`)
      const values = parse(args)
      if (path.startsWith("events."))
        values[1] = { ...values[1], signal: controller.signal }
      else values.push({ signal: controller.signal })
      return await entry.fn.apply(entry.owner, values)
    } finally {
      calls.delete(id)
    }
  }, done)
}
call.cancel = cancel
Reflect.deleteProperty(globalThis, "__core-js_shared__")
Object.defineProperty(globalThis, "__bridge", {
  configurable: true,
  value: {
    error: (cause: unknown) => stringify(error(cause)),
    start(
      module: PluginModule | Promise<PluginModule>,
      context: string,
      done: (json: string) => void,
    ) {
      void settle(async () => {
        const plugin = (await module).default
        if (
          !plugin ||
          plugin.matineePlugin !== 1 ||
          typeof plugin.setup !== "function" ||
          Object.keys(plugin).sort().join(",") !== "matineePlugin,setup"
        )
          throw new TypeError(
            "Default export must be definePlugin's { matineePlugin: 1, setup } object",
          )
        const ctx = parse(context)
        ctx.config = Object.freeze(ctx.config)
        ctx.log = log
        ctx.crypto = cryptoContext
        const read = async (key: string) => {
          const result = await host("storage.get", { key })
          return result && typeof result === "object" && !Array.isArray(result)
            ? (result.value ?? null)
            : null
        }
        // Writes to one key take turns, so an `update` reads and writes
        // with nothing in between. One plugin is one sandbox, so a turn
        // here is a turn everywhere.
        const turns = new Map<string, Promise<void>>()
        const inTurn = <T>(key: string, write: () => Promise<T>) => {
          const result = (turns.get(key) ?? Promise.resolve()).then(write)
          const done = result.then(
            () => {},
            () => {},
          )
          turns.set(key, done)
          void done.then(() => {
            if (turns.get(key) === done) turns.delete(key)
          })
          return result
        }
        ctx.storage = Object.freeze({
          get: read,
          set(key: string, value: Json) {
            return inTurn(key, async () => {
              await host("storage.set", { key, value })
            })
          },
          delete(key: string) {
            return inTurn(key, async () => {
              await host("storage.delete", { key })
            })
          },
          update(
            key: string,
            change: (current: Json | null) => Json | Promise<Json>,
          ) {
            if (typeof change !== "function")
              throw new TypeError("storage.update requires a function")
            return inTurn(key, async () => {
              const value = await change(await read(key))
              await host("storage.set", { key, value })
              return value
            })
          },
          async keys(prefix?: string) {
            const result = await host("storage.keys", {
              prefix: prefix ?? null,
            })
            return result &&
              typeof result === "object" &&
              !Array.isArray(result)
              ? result.keys
              : []
          },
        })
        const returned = await plugin.setup(ctx)
        for (const kind of ["metadata", "auth"] as const) {
          for (const [id, methods] of Object.entries(returned[kind] ?? {})) {
            if (
              !/^[a-z][a-z0-9-]{1,31}$/.test(id) ||
              !methods ||
              typeof methods !== "object"
            )
              continue
            for (const [name, fn] of Object.entries(methods))
              if (
                /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) &&
                typeof fn === "function"
              )
                table.set(`${kind}.${id}.${name}`, { fn, owner: methods })
          }
        }
        for (const [name, fn] of Object.entries(returned.events ?? {}))
          if (typeof fn === "function")
            table.set(`events.${name}`, { fn, owner: returned.events! })
        if (typeof returned.dispose === "function")
          table.set("dispose", { fn: returned.dispose, owner: returned })
        return { handlers: [...table.keys()] }
      }, done)
    },
    call,
  },
})
