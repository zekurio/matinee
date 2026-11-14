import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto"
import { clearTimeout, setImmediate, setTimeout } from "node:timers"
import { getHeapStatistics } from "node:v8"
import { parentPort, workerData } from "node:worker_threads"

import variant from "@jitl/quickjs-ng-wasmfile-release-sync"
import { t } from "@matinee/contracts/schema"
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  Scope,
} from "quickjs-emscripten-core"
import type {
  QuickJSContext,
  QuickJSDeferredPromise,
  QuickJSHandle,
  QuickJSRuntime,
} from "quickjs-emscripten-core"

import { PRELUDE } from "./prelude.gen"
import {
  encodeMessage,
  GuestError,
  MainMessage,
  MAX_MESSAGE_BYTES,
  WireText,
} from "./protocol"
import type { WorkerMessage } from "./protocol"

/*
 * The plugin host thread. It holds one guest per awake plugin: a
 * WebAssembly memory, a QuickJS instance in it, and the bridge around
 * that. Guests share this thread and nothing else, and run one at a time.
 *
 * Everything about a guest lives in its `Guest` object. Ending a guest is
 * forgetting the object, which lets its WebAssembly memory be collected,
 * so nothing outside may keep a reference to one: not a timer, not a map,
 * not a closure on the port.
 */

const port = parentPort
if (!port) throw new Error("The plugin host requires a parent port")
const data = t
  .object({
    wasmModule: t.custom<WebAssembly.Module>(
      (value) => value instanceof WebAssembly.Module,
    ),
    current: t.custom<SharedArrayBuffer>(
      (value) => value instanceof SharedArrayBuffer,
    ),
    testHooks: t.boolean().optional(),
  })
  .parse(workerData)
/**
 * What the main thread can read while this thread is busy: the number of
 * the guest whose code runs now, 0 for none, and a count that goes up with
 * every entry into guest code. A guest number that stays, with a count
 * that doesn't move, is one run that hasn't ended, however long QuickJS
 * goes without asking the interrupt handler.
 */
const current = new Int32Array(data.current, 0, 2)
const load = new BigInt64Array(data.current, 16)

const Timer = t.object({ id: t.number(), delay: t.number().optional() })
const Length = t.object({
  length: t
    .number()
    .int()
    .min(0)
    .max(Math.floor((MAX_MESSAGE_BYTES - 1024) / 4) * 3),
})
const Binary = t.object({ body: t.string().max(1024 * 1024) })
const Encode = t.object({ text: t.string() })
const Decode = t.object({
  body: t.string(),
  fatal: t.boolean(),
  ignoreBOM: t.boolean(),
})
const Hash = t.object({ data: t.string(), key: t.string().optional() })
const ErrorText = t.object({ message: t.string().max(2000) })
const HOST_CALLS = [
  "log",
  "http.fetch",
  "http.abort",
  "storage.get",
  "storage.set",
  "storage.delete",
  "storage.keys",
]
const OUT_OF_MEMORY =
  /out of memory|allocation failed|cannot enlarge memory|memory access out of bounds|abort\(|unreachable|call stack size exceeded/i

type Start = Extract<MainMessage, { type: "start" }>
type Call = Extract<MainMessage, { type: "call" }>

class GuestFault extends Error {
  constructor(readonly detail: t.infer<typeof GuestError>) {
    super(detail.message)
    this.name = detail.name
  }
}

function post(message: WorkerMessage) {
  port!.postMessage(encodeMessage(message), [])
}
function errorReply(guest: number, id: number, cause: unknown) {
  post({
    type: "reply",
    guest,
    id,
    json: JSON.stringify({
      ok: false,
      error:
        cause instanceof GuestFault
          ? cause.detail
          : {
              name: "Error",
              message: (cause instanceof Error
                ? cause.message
                : "Sandbox start failed"
              ).slice(0, 2000),
              status: null,
            },
    }),
  })
}

/** Calls that this thread answers itself and that touch no guest state. */
function pure(name: string, json: string): string | undefined {
  switch (name) {
    case "base64.decode":
      return JSON.stringify(
        Buffer.from(Binary.parse(JSON.parse(json)).body, "base64").toJSON()
          .data,
      )
    case "utf8.encode":
      return JSON.stringify(
        Buffer.from(Encode.parse(JSON.parse(json)).text, "utf8").toString(
          "base64",
        ),
      )
    case "utf8.decode": {
      const input = Decode.parse(JSON.parse(json))
      return JSON.stringify(
        new TextDecoder("utf-8", input).decode(
          Buffer.from(input.body, "base64"),
        ),
      )
    }
    case "crypto.randomUUID":
      return JSON.stringify(randomUUID())
    case "crypto.randomBytes":
      return JSON.stringify(
        randomBytes(Length.parse(JSON.parse(json)).length).toString("base64"),
      )
    case "crypto.sha256":
      return JSON.stringify(
        createHash("sha256")
          .update(Buffer.from(Hash.parse(JSON.parse(json)).data, "base64"))
          .digest("base64"),
      )
    case "crypto.hmacSha256": {
      const input = Hash.parse(JSON.parse(json))
      return JSON.stringify(
        createHmac("sha256", Buffer.from(input.key ?? "", "base64"))
          .update(Buffer.from(input.data, "base64"))
          .digest("base64"),
      )
    }
    default:
      return undefined
  }
}

class Guest {
  /** Set first when the guest ends, so nothing enters its runtime again. */
  dead = false
  private readonly scope = new Scope()
  private deadline = Infinity
  private interrupted = false
  private nextHost = 0
  private readonly deferred = new Map<number, QuickJSDeferredPromise>()
  private readonly promises = new Set<QuickJSDeferredPromise>()
  private readonly timers = new Map<
    number,
    { timer: NodeJS.Timeout; promise: QuickJSDeferredPromise }
  >()
  private readonly calls = new Set<number>()
  /** Calls the main thread gave up on, whose handlers still run. */
  private readonly cancelled = new Set<number>()
  private startFunction?: QuickJSHandle
  private callFunction?: QuickJSHandle
  private errorFunction?: QuickJSHandle
  private preludeMs = 0

  private constructor(
    readonly id: number,
    private readonly slot: number,
    private readonly cpuMs: number,
    private readonly memory: WebAssembly.Memory,
    private readonly runtime: QuickJSRuntime,
    private readonly context: QuickJSContext,
  ) {}

  /** A WebAssembly memory and QuickJS instance of its own, from the shared code. */
  static async create(
    id: number,
    slot: number,
    limits: Start["limits"],
  ): Promise<Guest> {
    const memory = new WebAssembly.Memory({
      // The shipped Wasm declares a 256-page minimum import.
      initial: 256,
      maximum: Math.min(
        32768,
        Math.max(
          256,
          Math.ceil((limits.memoryBytes + 32 * 1024 * 1024) / 65536),
        ),
      ),
    })
    const module = await newQuickJSWASMModuleFromVariant(
      newVariant(variant, {
        wasmMemory: memory,
        wasmModule: data.wasmModule,
      }),
    )
    const runtime = module.newRuntime()
    const guest = new Guest(
      id,
      slot,
      limits.cpuMs,
      memory,
      runtime,
      runtime.newContext(),
    )
    guest.scope.manage(runtime)
    guest.scope.manage(guest.context)
    runtime.setMemoryLimit(limits.memoryBytes)
    runtime.setMaxStackSize(limits.stackBytes)
    runtime.setInterruptHandler(() => {
      guest.interrupted ||= performance.now() > guest.deadline
      return guest.interrupted
    })
    runtime.setModuleLoader(() => ({
      error: new Error("Plugin imports are disabled"),
    }))
    return guest
  }

  /**
   * The one way into this guest's code: module evaluation, `setup`, a
   * handler, a host call's answer, a timer, pending jobs, and reading a
   * thrown error all go through here. It bounds the run, says whose code
   * runs, and ends the guest when the run passed a limit.
   */
  private enter<T>(action: () => T): T {
    if (this.dead) throw new Error("The plugin's sandbox has ended")
    const deadline = this.deadline
    const before = Atomics.load(current, 0)
    const started = performance.now()
    const outer = deadline === Infinity
    if (outer)
      this.writeLoad(() =>
        Atomics.store(
          load,
          this.slot * 4 + 1,
          BigInt(Math.round(started * 1000)),
        ),
      )
    this.deadline = Math.min(deadline, started + this.cpuMs)
    Atomics.store(current, 0, this.id)
    Atomics.add(current, 1, 1)
    try {
      const result = action()
      if (this.interrupted)
        throw new Error("Sandbox synchronous CPU limit exceeded")
      return result
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "QuickJS failed"
      // A trap or an abort inside the instance surfaces here as an
      // exception. Either way this instance isn't entered again.
      if (
        this.interrupted ||
        OUT_OF_MEMORY.test(message) ||
        cause instanceof WebAssembly.RuntimeError
      )
        this.fail(
          "limit",
          this.interrupted ? "Sandbox synchronous CPU limit exceeded" : message,
        )
      throw cause
    } finally {
      if (outer)
        this.writeLoad(() => {
          Atomics.add(
            load,
            this.slot * 4,
            BigInt(Math.round((performance.now() - started) * 1000)),
          )
          Atomics.store(load, this.slot * 4 + 1, 0n)
        })
      this.deadline = deadline
      Atomics.store(current, 0, before)
    }
  }

  private writeLoad(write: () => void) {
    // An odd sequence means the reader must wait for the next sample.
    Atomics.add(load, this.slot * 4 + 2, 1n)
    write()
    Atomics.add(load, this.slot * 4 + 2, 1n)
  }

  spin(ms: number) {
    this.enter(() => {
      const end = performance.now() + ms
      while (performance.now() < end);
    })
  }

  /** End the guest for a reason of its own making, and tell the main thread. */
  fail(kind: "limit" | "crashed", message: string) {
    if (this.dead) return
    this.dead = true
    guests.delete(this.id)
    // An interrupted or broken runtime is not disposed, only forgotten.
    this.forget()
    post({
      type: "ended",
      guest: this.id,
      kind,
      message: message.slice(0, 2000),
    })
  }

  /** End the guest because the main thread asked, disposing what can be. */
  stop() {
    if (this.dead) return
    this.dead = true
    guests.delete(this.id)
    try {
      for (const promise of this.promises) promise.dispose()
      // Throws when a handle leaked. The guest goes either way.
      this.scope.dispose()
    } catch {
      // Nothing to do: forgetting it releases its memory all the same.
    }
    this.forget()
  }

  private forget() {
    for (const entry of this.timers.values()) clearTimeout(entry.timer)
    this.timers.clear()
    this.deferred.clear()
    this.promises.clear()
    this.calls.clear()
  }

  private handles() {
    const { startFunction, callFunction, errorFunction } = this
    if (!startFunction || !callFunction || !errorFunction)
      throw new Error("The plugin's sandbox hasn't started")
    return { startFunction, callFunction, errorFunction }
  }

  private guestFailure(handle: QuickJSHandle): never {
    // Even error accessors are guest code, so this runs inside enter().
    using serialized = this.context.callFunction(
      this.handles().errorFunction,
      this.context.undefined,
      handle,
    )
    if (serialized.error)
      throw new Error("QuickJS out of memory while serializing an exception")
    const error = GuestError.parse(
      JSON.parse(this.context.getString(serialized.value)),
    )
    if (/out of memory|allocation failed/i.test(error.message))
      throw new Error(`QuickJS out of memory: ${error.message}`)
    throw new GuestFault(error)
  }

  private pump() {
    if (this.dead) return
    this.enter(() => {
      using result = this.runtime.executePendingJobs()
      if (result.error) this.guestFailure(result.error)
    })
  }

  private settle(promise: QuickJSDeferredPromise, json: string, ok: boolean) {
    if (this.dead) return
    this.enter(() => {
      if (ok) {
        using value = this.context.newString(json)
        promise.resolve(value)
      } else {
        const { message } = ErrorText.parse(JSON.parse(json))
        using error = this.context.newError({ name: "Error", message })
        promise.reject(error)
      }
      promise.dispose()
      this.promises.delete(promise)
    })
    this.pump()
  }

  /** Run something that enters the guest from this thread's own turn. */
  private guarded(action: () => void) {
    try {
      action()
    } catch (cause) {
      // A limit already ended it inside enter(). Anything else thrown out
      // of the guest's own turn is a failure of this guest alone.
      this.fail(
        "crashed",
        cause instanceof Error ? cause.message : "Sandbox failed",
      )
    }
  }

  private clearTimer(json: string) {
    const input = Timer.parse(JSON.parse(json))
    const entry = this.timers.get(input.id)
    if (!entry) return
    clearTimeout(entry.timer)
    this.timers.delete(input.id)
    // Settle in a later turn, never pump from inside a guest callback.
    setImmediate(() =>
      this.guarded(() => this.settle(entry.promise, "null", true)),
    )
  }

  private waitTimer(json: string): QuickJSHandle {
    const input = Timer.parse(JSON.parse(json))
    if (this.timers.size >= 100) throw new Error("At most 100 pending timers")
    const promise = this.context.newPromise()
    this.promises.add(promise)
    const timer = setTimeout(
      () => {
        this.timers.delete(input.id)
        this.guarded(() => this.settle(promise, "null", true))
      },
      Math.min(60_000, Math.max(0, input.delay ?? 0)),
    )
    // A guest's timer never keeps the thread, or the process, alive.
    timer.unref()
    this.timers.set(input.id, { timer, promise })
    return promise.handle.dup()
  }

  private installHost() {
    const { context } = this
    using host = context.newFunction("__host", (nameHandle, jsonHandle) => {
      try {
        // Code still running in a guest that just ended gets nothing more.
        if (this.dead) throw new Error("The plugin's sandbox has ended")
        const name = t.string().max(128).parse(context.getString(nameHandle))
        const json = WireText.parse(context.getString(jsonHandle))
        const value = pure(name, json)
        if (value !== undefined) {
          WireText.parse(value)
          return context.newString(value)
        }
        if (name === "timer.wait") return this.waitTimer(json)
        if (name === "timer.clear") {
          this.clearTimer(json)
          return context.newString("null")
        }
        // Nothing may reach the main thread by a name it doesn't know.
        if (!HOST_CALLS.includes(name))
          throw new Error(`Unknown host call: ${name}`)
        // Dropping a request must work when the plugin is at its limit
        // of calls, which is when it matters. It has a limit of its own.
        if (this.deferred.size >= (name === "http.abort" ? 256 : 128))
          throw new Error("At most 128 pending host calls")
        const id = ++this.nextHost
        const message = encodeMessage({
          type: "host",
          guest: this.id,
          id,
          name,
          json,
        })
        const promise = context.newPromise()
        this.promises.add(promise)
        this.deferred.set(id, promise)
        port!.postMessage(message, [])
        return promise.handle.dup()
      } catch (cause) {
        return {
          error: context.newError({
            name: "Error",
            message:
              cause instanceof Error ? cause.message : "Invalid host call",
          }),
        }
      }
    })
    context.setProp(context.global, "__host", host)
  }

  private completion(id: number): QuickJSHandle {
    const { context } = this
    this.calls.add(id)
    return context.newFunction("complete", (jsonHandle) => {
      if (!this.calls.delete(id) || this.dead) return context.undefined
      if (this.cancelled.delete(id)) {
        // Nobody waits for the result. The main thread only needs to know
        // the handler has ended, to give its place to the next call.
        post({
          type: "reply",
          guest: this.id,
          id,
          json: '{"ok":true,"json":"null"}',
        })
        return context.undefined
      }
      try {
        const json = WireText.parse(context.getString(jsonHandle))
        if (/out of memory|allocation failed/i.test(json)) {
          // Only error envelopes are examined, not successful user data.
          const parsed = t
            .object({ ok: t.literal(false), error: GuestError })
            .safeParse(JSON.parse(json))
          if (
            parsed.success &&
            /out of memory|allocation failed/i.test(parsed.data.error.message)
          ) {
            this.fail("limit", "QuickJS out of memory")
            return context.undefined
          }
        }
        post({ type: "reply", guest: this.id, id, json })
      } catch {
        post({
          type: "reply",
          guest: this.id,
          id,
          json: JSON.stringify({
            ok: false,
            error: {
              name: "RangeError",
              message: "Sandbox result exceeds 8 MB",
              status: null,
            },
          }),
        })
      }
      return context.undefined
    })
  }

  /** Install the globals, evaluate the plugin, and run its `setup`. */
  boot(message: Start) {
    const { context } = this
    this.enter(() => {
      this.installHost()
      const beforePrelude = performance.now()
      using prelude = context.evalCode(PRELUDE, "prelude.js")
      this.preludeMs = performance.now() - beforePrelude
      if (prelude.error)
        throw new Error(
          "QuickJS out of memory: could not load the sandbox's globals",
        )
      using bridge = context.getProp(context.global, "__bridge")
      this.startFunction = this.scope.manage(context.getProp(bridge, "start"))
      this.callFunction = this.scope.manage(context.getProp(bridge, "call"))
      this.errorFunction = this.scope.manage(context.getProp(bridge, "error"))
      using removed = context.evalCode("delete globalThis.__bridge")
      if (removed.error) this.guestFailure(removed.error)
      using evaluated = context.evalCode(message.code, "plugin.mjs", {
        type: "module",
      })
      if (evaluated.error) this.guestFailure(evaluated.error)
      using json = context.newString(message.context)
      using done = this.completion(message.id)
      using result = context.callFunction(
        this.handles().startFunction,
        context.undefined,
        evaluated.value,
        json,
        done,
      )
      if (result.error) this.guestFailure(result.error)
    })
    this.pump()
  }

  call(message: Call) {
    this.guarded(() => {
      const { context } = this
      this.enter(() => {
        using id = context.newNumber(message.id)
        using path = context.newString(message.path)
        using args = context.newString(message.json)
        using done = this.completion(message.id)
        using result = context.callFunction(
          this.handles().callFunction,
          context.undefined,
          id,
          path,
          args,
          done,
        )
        if (result.error) this.guestFailure(result.error)
      })
      this.pump()
    })
  }

  answer(id: number, json: string, ok: boolean) {
    const promise = this.deferred.get(id)
    if (!promise) return
    this.deferred.delete(id)
    this.guarded(() => this.settle(promise, json, ok))
  }

  cancel(id: number) {
    // Nothing to do for a call that has ended, or was never made.
    if (!this.calls.has(id)) return
    this.cancelled.add(id)
    this.guarded(() => {
      const { context } = this
      this.enter(() => {
        using cancel = context.getProp(this.handles().callFunction, "cancel")
        using argument = context.newNumber(id)
        using result = context.callFunction(cancel, context.undefined, argument)
        if (result.error) this.guestFailure(result.error)
      })
      this.pump()
    })
  }

  diagnostics(id: number) {
    this.guarded(() =>
      this.enter(() => {
        using usage = this.runtime.computeMemoryUsage()
        post({
          type: "reply",
          guest: this.id,
          id,
          json: JSON.stringify({
            ok: true,
            json: JSON.stringify({
              heap: getHeapStatistics(),
              rss: process.memoryUsage().rss,
              guests: guests.size,
              wasmBytes: this.memory.buffer.byteLength,
              quickjs: this.context.dump(usage),
              preludeMs: this.preludeMs,
              preludeBytes: Buffer.byteLength(PRELUDE),
            }),
          }),
        })
      }),
    )
  }
}

const guests = new Map<number, Guest>()
/** Guests whose instance is still being made, and whether to drop it. */
const starting = new Map<number, { cancelled: boolean }>()

async function start(message: Start) {
  if (guests.has(message.guest) || starting.has(message.guest)) return
  const token = { cancelled: false }
  // Only the worker resets a reused slot, after the old entry has returned.
  const offset = message.slot * 4
  Atomics.add(load, offset + 2, 1n)
  Atomics.store(load, offset, 0n)
  Atomics.store(load, offset + 1, 0n)
  Atomics.store(load, offset + 3, BigInt(message.guest))
  Atomics.add(load, offset + 2, 1n)
  starting.set(message.guest, token)
  let guest: Guest
  try {
    guest = await Guest.create(message.guest, message.slot, message.limits)
  } catch (cause) {
    if (!token.cancelled) errorReply(message.guest, message.id, cause)
    return
  } finally {
    starting.delete(message.guest)
  }
  if (token.cancelled) {
    guest.stop()
    return
  }
  guests.set(guest.id, guest)
  try {
    guest.boot(message)
  } catch (cause) {
    // A throwing `setup` or a bad export is an answer, not the end of the
    // guest: the main thread stops it. A limit ended it in enter() already.
    if (!guest.dead) errorReply(guest.id, message.id, cause)
  }
}

async function receive(text: string) {
  const message = MainMessage.parse(JSON.parse(WireText.parse(text)))
  switch (message.type) {
    case "start":
      await start(message)
      break
    case "call": {
      const guest = guests.get(message.guest)
      if (!guest) break
      if (message.path === "@diagnostics") guest.diagnostics(message.id)
      else guest.call(message)
      break
    }
    case "answer":
      guests
        .get(message.guest)
        ?.answer(message.id, WireText.parse(message.json), message.ok)
      break
    case "cancel":
      guests.get(message.guest)?.cancel(message.id)
      break
    case "stop": {
      const pending = starting.get(message.guest)
      if (pending) pending.cancelled = true
      guests.get(message.guest)?.stop()
      post({ type: "stopped", guest: message.guest })
      break
    }
    case "ping":
      post({ type: "pong", id: message.id })
      break
    case "spin": {
      if (!data.testHooks) break
      // What a guest stuck where no interrupt reaches looks like from the
      // main thread: this thread busy, with that guest named as running.
      guests.get(message.guest)?.spin(message.ms)
      break
    }
    case "close":
      close()
      break
  }
}
port.on("message", (text: string) => {
  void receive(text).catch((cause: Error) => {
    // A message this thread can't read is a bug of the host's own. End
    // the thread loudly rather than guess.
    throw cause
  })
})
function close() {
  // Deleting from a Map while iterating it is fine.
  for (const guest of guests.values()) guest.stop()
  for (const token of starting.values()) token.cancelled = true
  port!.close()
}
port.on("close", () => {
  // Deleting from a Map while iterating it is fine.
  for (const guest of guests.values()) guest.stop()
})
