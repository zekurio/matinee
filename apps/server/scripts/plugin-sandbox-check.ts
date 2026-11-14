import assert from "node:assert/strict"
import { monitorEventLoopDelay } from "node:perf_hooks"

import { t } from "@matinee/contracts/schema"

import * as source from "../src/plugins/sandbox/index"
import type {
  HostCall,
  Sandbox,
  SandboxLimits,
} from "../src/plugins/sandbox/index"

// The bundled entry is built from this same typed API, without booting the server.
const bundleUrl = new URL("../dist/server/plugin-sandbox.mjs", import.meta.url)
// SAFETY: build.mjs emits this module from sandbox/index.ts without changing exports.
const api: typeof source = process.argv.includes("--bundle")
  ? await import(bundleUrl.href)
  : source
const { createSandbox, sandboxTestHooks, stopSandboxHost } = api
// Read when the host thread starts, so before the first sandbox.
sandboxTestHooks.enable()
sandboxTestHooks.configure({ cap: 1 })
const live = new Set<Sandbox>()
const logs: string[] = []
const storage = new Map<string, string>()
const StorageKey = t.object({ key: t.string(), value: t.string().optional() })
const FetchInput = t.object({
  url: t.string(),
  method: t.string(),
  headers: t.array(t.array(t.string())),
  body: t.string().nullable(),
})
const hostCall: HostCall = async (name, args) => {
  switch (name) {
    case "log":
      logs.push(t.object({ message: t.string() }).parse(args).message)
      return null
    case "storage.set": {
      const input = StorageKey.parse(args)
      storage.set(input.key, input.value ?? "")
      return null
    }
    case "storage.get":
      return { value: storage.get(StorageKey.parse(args).key) ?? null }
    case "storage.delete":
      storage.delete(StorageKey.parse(args).key)
      return null
    case "storage.keys":
      return { keys: [...storage.keys()] }
    case "http.fetch": {
      const input = FetchInput.parse(args)
      if (input.url.endsWith("/error")) throw new Error("network denied")
      if (input.url.endsWith("/wait"))
        await new Promise((resolve) => setTimeout(resolve, 2))
      return {
        status: 200,
        statusText: "OK",
        url: input.url,
        headers: [
          ["Content-Type", "application/json"],
          ["X-Method", input.method],
        ],
        body: input.url.endsWith("/large")
          ? Buffer.alloc(5 * 1024 * 1024, 120).toString("base64")
          : (input.body ?? Buffer.from('{"answer":42}').toString("base64")),
      }
    }
    default:
      throw new Error(`Unexpected host operation ${name}`)
  }
}
function fixture(setup: string): string {
  return `export default Object.freeze({ matineePlugin: 1, setup(ctx) { ${setup} } })`
}
function sandbox(
  code: string,
  limits?: Partial<SandboxLimits>,
  own: {
    config?: object
    hostCall?: HostCall
    pluginId?: string
    onCrowded?: () => void
  } = {},
): Sandbox {
  const value = createSandbox({
    pluginId: own.pluginId ?? "check",
    code,
    context: {
      plugin: { id: "check", version: "1.0.0" },
      server: { api: 1, version: "1", publicUrl: "https://example.com" },
      config: own.config ?? { secret: "secret" },
    },
    hostCall: own.hostCall ?? hostCall,
    onCrowded: own.onCrowded,
    limits,
  })
  live.add(value)
  return value
}
let failed = 0
async function check(name: string, action: () => Promise<void>) {
  try {
    await action()
    process.stdout.write(`ok ${name}\n`)
  } catch (cause) {
    failed++
    process.stderr.write(
      `FAIL ${name}: ${cause instanceof Error ? cause.stack : String(cause)}\n`,
    )
  }
}
async function rejectsKind(action: Promise<unknown>, kind: string) {
  await assert.rejects(
    action,
    (cause: Error) => "kind" in cause && cause.kind === kind,
  )
}
const ordinary = sandbox(
  fixture(`
  return {
    metadata: { test: {
      search(query) { return [{ id: query, name: "Title", kind: "movie" }] },
      noop() { return null },
      async overlap(n) { await fetch("https://example.com/wait"); return n * 2 },
      never() { return new Promise(() => {}) },
      error() { const error = new Error("bad provider"); error.name = "ProviderError"; error.status = 429; throw error },
      thrown() { throw 123 },
      thrownObject() { throw {name:"NotAnError", message:"not an error"} },
      large() { return "x".repeat(9 * 1024 * 1024) },
      timers() { for (let n = 0; n < 1000; n++) setTimeout(() => {}, 60000) },
      async globals() {
        const assert = (condition, message) => { if (!condition) throw new Error(message) };
        assert(Object.isFrozen(ctx.config), "frozen config");
        assert(ctx.plugin.id === "check" && ctx.server.api === 1, "context");
        const url = new URL("../café?a=1", "https://example.com/a/b");
        url.searchParams.set("hello", "世界");
        assert(url.pathname === "/caf%C3%A9" && url.searchParams.get("hello") === "世界", "URL");
        assert(new URLSearchParams("x=1&x=2").getAll("x").join() === "1,2", "URLSearchParams");
        const text = "Hello 🌎 é 漢字";
        assert(new TextDecoder().decode(new TextEncoder().encode(text)) === text, "UTF-8");
        assert(new TextDecoder().decode(new TextEncoder().encode(text).buffer) === text, "ArrayBuffer UTF-8");
        assert(atob(btoa("a\\x00\\xff")) === "a\\x00\\xff", "base64");
        assert(/^[0-9a-f-]{36}$/.test(crypto.randomUUID()), "UUID");
        const random = new Uint8Array(32); assert(crypto.getRandomValues(random) === random && random.some(x => x !== 0), "random values");
        assert(ctx.crypto.randomBytes(10).length === 10, "random bytes");
        const order = []; const cancel = setTimeout(() => order.push("wrong"), 0); clearTimeout(cancel);
        await new Promise(resolve => { setTimeout(() => order.push(1), 0); setTimeout(() => { order.push(2); resolve() }, 5) });
        assert(order.join() === "1,2", "timer order");
        await ctx.storage.set("foo", "bar"); assert(await ctx.storage.get("foo") === "bar", "storage get");
        assert((await ctx.storage.keys()).includes("foo"), "storage keys"); await ctx.storage.delete("foo");
        assert(await ctx.storage.get("foo") === null, "storage delete");
        const response = await fetch("https://example.com/json", {method:"POST", headers:{"x-test":"yes"}, body: JSON.stringify({hello:text})});
        assert(response.ok && response.status === 200 && response.statusText === "OK" && response.url.endsWith("/json"), "response fields");
        assert(response.headers.get("X-METHOD") === "POST" && [...response.headers.entries()].length === 2, "headers");
        assert((await response.json()).hello === text && (await response.text()).includes(text), "fetch JSON and text");
        const binary = await fetch("https://example.com/binary", { headers:[["x-test", "yes"]], body:new Uint8Array([0, 1, 255]) });
        assert([...new Uint8Array(await binary.arrayBuffer())].join() === "0,1,255", "binary fetch");
        return {hash:[...await ctx.crypto.sha256("abc")], hmac:[...await ctx.crypto.hmacSha256("key", "The quick brown fox jumps over the lazy dog")]};
      },
      async escapes() {
        const assert = (condition, message) => { if (!condition) throw new Error(message) };
        assert(typeof process === "undefined" && typeof require === "undefined" && typeof globalThis.__host === "undefined" && typeof globalThis.__bridge === "undefined", "hidden host");
        assert(Function("return this")() === globalThis, "guest global");
        try { ({}).constructor.constructor("return process")(); throw new Error("escaped") } catch (error) { assert(error.name === "ReferenceError", "constructor escape") }
        try { await import("node:fs"); throw new Error("escaped") } catch (error) { assert(/disabled/.test(error.message), "dynamic import") }
        Object.prototype.polluted = 1;
        const data = await (await fetch("https://example.com/json")).json();
        assert(Object.getPrototypeOf(data) === Object.prototype, "guest result prototype");
        try { await fetch("https://example.com/error"); throw new Error("no error") } catch (error) { assert(error instanceof Error && error.message === "network denied", "guest error prototype") }
        delete Object.prototype.polluted;
        return true;
      },
      async decodeLargeBinary() { const begin = Date.now(); const response = await fetch("https://example.com/large"); const bytes = new Uint8Array(await response.arrayBuffer()); return {length:bytes.length, ms:Date.now()-begin, first:bytes[0], last:bytes[bytes.length-1]} },
      async decodeLarge() { const begin = Date.now(); const response = await fetch("https://example.com/large"); const text = await response.text(); return {length:text.length, ms:Date.now()-begin} }
    } },
    events: { "playback.stopped": () => ctx.log.info("event") },
    dispose() { ctx.log.info("disposed") }
  };
`),
)
await check("stop during cold compilation leaves no worker", async () => {
  const value = sandbox(fixture("return {}"))
  const starting = rejectsKind(value.start(), "crashed")
  await value.stop()
  await starting
  assert.equal((await value.exited).kind, "stopped")
})
await check("start and handler discovery", async () => {
  const before = performance.now()
  const rssBefore = process.memoryUsage().rss
  const result = await ordinary.start()
  assert(result.handlers.includes("events.playback.stopped"))
  assert(result.handlers.includes("metadata.test.search"))
  assert(result.handlers.includes("dispose"))
  process.stdout.write(
    `  start ${Math.round(performance.now() - before)} ms; first sandbox RSS delta ${((process.memoryUsage().rss - rssBefore) / 1024 / 1024).toFixed(1)} MB\n`,
  )
})
await check("JSON call, event, no-op timing", async () => {
  assert.deepEqual(await ordinary.call("metadata.test.search", ["42"]), [
    { id: "42", name: "Title", kind: "movie" },
  ])
  await ordinary.call("events.playback.stopped", [{}])
  assert(logs.includes("event"))
  const before = performance.now()
  for (let n = 0; n < 20; n++) await ordinary.call("metadata.test.noop", [])
  process.stdout.write(
    `  no-op ${((performance.now() - before) / 20).toFixed(2)} ms\n`,
  )
})
await check("all prelude globals and host calls", async () => {
  const result = t
    .object({ hash: t.array(t.number()), hmac: t.array(t.number()) })
    .parse(await ordinary.call("metadata.test.globals", []))
  assert.equal(
    Buffer.from(result.hash).toString("hex"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  )
  assert.equal(
    Buffer.from(result.hmac).toString("hex"),
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
  )
})
await check("escapes and host prototypes", async () => {
  assert.equal(await ordinary.call("metadata.test.escapes", []), true)
  assert.equal(Object.hasOwn(Object.prototype, "polluted"), false)
})
await check("5 MB body decoding", async () => {
  const result = t
    .object({ length: t.number(), ms: t.number() })
    .parse(await ordinary.call("metadata.test.decodeLarge", []))
  assert.equal(result.length, 5 * 1024 * 1024)
  process.stdout.write(`  5 MB fetch and decode ${result.ms} ms\n`)
})
await check("5 MB binary body decoding", async () => {
  const result = t
    .object({
      length: t.number(),
      ms: t.number(),
      first: t.number(),
      last: t.number(),
    })
    .parse(await ordinary.call("metadata.test.decodeLargeBinary", []))
  assert.equal(result.length, 5 * 1024 * 1024)
  assert.equal(result.first, 120)
  assert.equal(result.last, 120)
  assert(result.ms < 1500, `Binary decoding took ${result.ms} ms`)
  process.stdout.write(`  5 MB fetch and binary decode ${result.ms} ms\n`)
})
await check("16 overlapping calls and queued overflow", async () => {
  const results = await Promise.all(
    Array.from({ length: 24 }, (_, i) =>
      ordinary.call("metadata.test.overlap", [i]),
    ),
  )
  assert.deepEqual(
    results,
    Array.from({ length: 24 }, (_, i) => i * 2),
  )
})
await check("never-settling call times out; sandbox survives", async () => {
  await rejectsKind(
    ordinary.call("metadata.test.never", [], { timeoutMs: 30 }),
    "timeout",
  )
  assert.equal(await ordinary.call("metadata.test.noop", []), null)
  await rejectsKind(ordinary.call("unknown", []), "protocol")
})
await check(
  "errors preserve name, message, status and non-errors",
  async () => {
    await assert.rejects(
      ordinary.call("metadata.test.error", []),
      (cause: Error) =>
        cause.name === "ProviderError" &&
        cause.message === "bad provider" &&
        "status" in cause &&
        cause.status === 429,
    )
    await assert.rejects(ordinary.call("metadata.test.thrown", []), {
      name: "Error",
      message: "123",
    })
    await assert.rejects(ordinary.call("metadata.test.thrownObject", []), {
      name: "Error",
      message: "[object Object]",
    })
  },
)
await check("8 MB result cap and timer cap", async () => {
  await assert.rejects(ordinary.call("metadata.test.large", []), /8 MB/)
  await assert.rejects(
    ordinary.call("metadata.test.timers", []),
    /100 pending timers/,
  )
})
for (const [name, code] of [
  ["bad default export", "export default {}"],
  ["throwing setup", fixture('throw new Error("setup failed")')],
  ["static import", 'import fs from "node:fs"; export default fs'],
]) {
  await check(name!, async () => {
    const value = sandbox(code!)
    await assert.rejects(
      value.start(),
      /definePlugin|setup failed|imports are disabled/,
    )
    await value.stop()
  })
}
for (const [name, setup, top] of [
  ["CPU loop", "return {metadata:{test:{run(){while(true){}}}}}", false],
  ["module CPU loop", "while(true){}", true],
  ["setup CPU loop", "while(true){}", false],
  [
    "timer-job CPU loop",
    "return {metadata:{test:{run(){return new Promise(resolve => setTimeout(() => {while(true){}}, 0))}}}}",
    false,
  ],
  [
    "promise-job CPU loop",
    'return {metadata:{test:{async run(){await fetch("https://example.com/json"); while(true){}}}}}',
    false,
  ],
  [
    "memory bomb",
    'return {metadata:{test:{run(){let a = ["x"]; while(true) a = a.concat(a)}}}}',
    false,
  ],
] as const) {
  await check(name, async () => {
    const delay = monitorEventLoopDelay({ resolution: 5 })
    delay.enable()
    const value = sandbox(
      top ? `${setup}; ${fixture("return {}")}` : fixture(setup),
      { cpuMs: 120, memoryBytes: 24 * 1024 * 1024 },
    )
    if (top || name === "setup CPU loop")
      await rejectsKind(value.start(), "limit")
    else {
      await value.start()
      await rejectsKind(value.call("metadata.test.run", []), "limit")
    }
    assert.equal((await value.exited).kind, "limit")
    delay.disable()
    const ms = delay.max / 1e6
    assert(ms < 100, `Main-thread delay ${ms} ms`)
    process.stdout.write(`  main-thread max delay ${ms.toFixed(1)} ms\n`)
    assert.equal(await ordinary.call("metadata.test.noop", []), null)
  })
}
await check("deep recursion", async () => {
  const value = sandbox(
    fixture(
      "return {metadata:{test:{run(){function f(){return f()+1}; return f()}}}}",
    ),
  )
  await value.start()
  await assert.rejects(value.call("metadata.test.run", []), /stack|recursion/i)
  await value.stop()
})
await check("top-level await", async () => {
  const value = sandbox(
    `await new Promise(resolve => setTimeout(resolve, 1)); ${fixture("return {}")}`,
  )
  assert.deepEqual(await value.start(), { handlers: [] })
  await value.stop()
})
await check("dispose is bounded to 2 seconds", async () => {
  const value = sandbox(
    fixture("return {dispose(){return new Promise(() => {})}}"),
  )
  await value.start()
  const before = performance.now()
  await value.stop()
  assert(performance.now() - before < 2500)
  assert.equal((await value.exited).kind, "stopped")
})

/*
 * Every sandbox above shared one host thread. From here on the cases are
 * about that: what two guests can and can't do to each other.
 */
const Diagnostics = t.object({
  rss: t.number(),
  guests: t.number(),
  heap: t.object({ used_heap_size: t.number() }),
})
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const NOOP = fixture("return {metadata:{test:{noop(){return null}}}}")

await check(
  "two guests keep their globals, config, and host calls",
  async () => {
    const seen = { a: new Set<string>(), b: new Set<string>() }
    const echo =
      (who: "a" | "b"): HostCall =>
      async (name, args) => {
        if (name !== "http.fetch")
          return hostCall(name, args, AbortSignal.any([]))
        const { url } = FetchInput.parse(args)
        seen[who].add(new URL(url).pathname.split("/")[1] ?? "")
        // Answers come back out of order, later requests first.
        await wait(Math.random() * 8)
        return {
          status: 200,
          statusText: "OK",
          url,
          headers: [],
          body: Buffer.from(JSON.stringify({ who, url })).toString("base64"),
        }
      }
    const code = fixture(`
    globalThis.mark = ctx.config.who;
    return {metadata:{test:{
      mark() { return [globalThis.mark, ctx.config.who, typeof globalThis.other] },
      leave() { globalThis.other = "from " + ctx.config.who; Object.prototype.leak = ctx.config.who; return null },
      async talk(n) {
        const answers = await Promise.all(Array.from({length: n}, (_, i) =>
          fetch("https://example.com/" + ctx.config.who + "/" + i).then(r => r.json())));
        return answers.every((answer, i) => answer.who === ctx.config.who && answer.url.endsWith("/" + i));
      },
    }}}`)
    const a = sandbox(code, undefined, {
      config: { who: "a" },
      hostCall: echo("a"),
    })
    const b = sandbox(code, undefined, {
      config: { who: "b" },
      hostCall: echo("b"),
    })
    await Promise.all([a.start(), b.start()])
    await a.call("metadata.test.leave", [])
    assert.deepEqual(await b.call("metadata.test.mark", []), [
      "b",
      "b",
      "undefined",
    ])
    assert.deepEqual(await a.call("metadata.test.mark", []), [
      "a",
      "a",
      "string",
    ])
    const talks = await Promise.all([
      ...Array.from({ length: 8 }, () => a.call("metadata.test.talk", [12])),
      ...Array.from({ length: 8 }, () => b.call("metadata.test.talk", [12])),
    ])
    assert(talks.every((ok) => ok === true))
    assert.deepEqual([...seen.a], ["a"])
    assert.deepEqual([...seen.b], ["b"])
    assert.equal(Object.hasOwn(Object.prototype, "leak"), false)
    await Promise.all([a.stop(), b.stop()])
  },
)
await check(
  "a spinning guest ends alone, and the one waiting answers",
  async () => {
    const spinner = sandbox(
      fixture("return {metadata:{test:{run(){while(true){}}}}}"),
      { cpuMs: 300 },
    )
    const waiter = sandbox(NOOP)
    await Promise.all([spinner.start(), waiter.start()])
    const spinning = rejectsKind(spinner.call("metadata.test.run", []), "limit")
    await wait(20)
    const before = performance.now()
    assert.equal(await waiter.call("metadata.test.noop", []), null)
    const waited = performance.now() - before
    await spinning
    assert.equal((await spinner.exited).kind, "limit")
    assert(waited < 1500, `The other guest waited ${waited} ms`)
    process.stdout.write(`  the other guest waited ${Math.round(waited)} ms\n`)
    assert.equal(await waiter.call("metadata.test.noop", []), null)
    await waiter.stop()
  },
)
await check(
  "a guest out of memory ends alone, and limits stay per guest",
  async () => {
    const bomb =
      'return {metadata:{test:{noop(){return null},run(){let a = ["x"]; while(true) a = a.concat(a)}}}}'
    const first = sandbox(fixture(bomb), { memoryBytes: 24 * 1024 * 1024 })
    const second = sandbox(fixture(bomb), { memoryBytes: 24 * 1024 * 1024 })
    await Promise.all([first.start(), second.start()])
    await rejectsKind(first.call("metadata.test.run", []), "limit")
    assert.equal((await first.exited).kind, "limit")
    assert.equal(await second.call("metadata.test.noop", []), null)
    await rejectsKind(second.call("metadata.test.run", []), "limit")
    assert.equal((await second.exited).kind, "limit")
    assert.equal(await ordinary.call("metadata.test.noop", []), null)
  },
)
await check("one guest can't fill the host with data in flight", async () => {
  let open: () => void = () => {}
  const gate = new Promise<void>((resolve) => (open = resolve))
  const holding: HostCall = async (name, args) => {
    if (name === "storage.set") await gate
    return name === "storage.set"
      ? null
      : hostCall(name, args, AbortSignal.any([]))
  }
  const hoarder = sandbox(
    fixture(`return {metadata:{test:{
      async hoard() {
        const big = "x".repeat(7 * 1024 * 1024);
        const results = await Promise.allSettled(Array.from({length: 6}, (_, i) => ctx.storage.set("k" + i, big)));
        return results.map(r => r.status === "rejected" ? String(r.reason.message) : "ok");
      },
      async hold(text) { await ctx.storage.set("held", "x"); return text.length },
    }}}`),
    undefined,
    { hostCall: holding },
  )
  const other = sandbox(NOOP)
  await Promise.all([hoarder.start(), other.start()])
  const hoarding = hoarder.call("metadata.test.hoard", [])
  await wait(300)
  assert.equal(await other.call("metadata.test.noop", []), null)
  // Arguments of calls that wait count too: the fifth of 7 MB is one too many.
  const big = "y".repeat(7 * 1024 * 1024)
  const held = Array.from({ length: 4 }, () =>
    hoarder.call("metadata.test.hold", [big]),
  )
  await rejectsKind(hoarder.call("metadata.test.hold", [big]), "limit")
  open()
  const outcomes = t.array(t.string()).parse(await hoarding)
  assert.equal(outcomes.filter((outcome) => outcome === "ok").length, 4)
  assert(
    outcomes.filter((outcome) => /Too much data/.test(outcome)).length === 2,
    outcomes.join(" | "),
  )
  assert.deepEqual(await Promise.all(held), Array(4).fill(big.length))
  await Promise.all([hoarder.stop(), other.stop()])
})
await check("a stopped guest's timers never fire", async () => {
  const value = sandbox(
    fixture('setTimeout(() => ctx.log.info("late timer"), 150); return {}'),
  )
  await value.start()
  await value.stop()
  await wait(350)
  assert(!logs.includes("late timer"))
})
await check("30 guests awake at once", async () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    sandbox(fixture(`return {metadata:{test:{who(){return ${i}}}}}`)),
  )
  await Promise.all(many.map((value) => value.start()))
  const answers = await Promise.all(
    many.map((value) => value.call("metadata.test.who", [])),
  )
  assert.deepEqual(
    answers,
    Array.from({ length: 30 }, (_, i) => i),
  )
  const { guests } = Diagnostics.parse(await ordinary.diagnostics())
  assert(guests >= 31, `The host reports ${guests} guests`)
  await Promise.all(many.map((value) => value.stop()))
})
await check("300 guests come and go and the memory levels off", async () => {
  const sample = async () => {
    await wait(200)
    globalThis.gc?.()
    const inside = Diagnostics.parse(await ordinary.diagnostics())
    return {
      rss: process.memoryUsage().rss / 1048576,
      heap: inside.heap.used_heap_size / 1048576,
      guests: inside.guests,
    }
  }
  const cycle = async (count: number) => {
    for (let n = 0; n < count; n++) {
      const value = createSandbox({
        pluginId: "cycle",
        code: NOOP,
        context: { plugin: {}, server: {}, config: {} },
        hostCall,
      })
      await value.start()
      await value.call("metadata.test.noop", [])
      await value.stop()
    }
  }
  await cycle(100)
  const early = await sample()
  await cycle(200)
  const late = await sample()
  process.stdout.write(
    `  after 100: process ${early.rss.toFixed(0)} MB, host heap ${early.heap.toFixed(1)} MB; after 300: process ${late.rss.toFixed(0)} MB, host heap ${late.heap.toFixed(1)} MB\n`,
  )
  assert.equal(late.guests, early.guests)
  assert(
    late.heap - early.heap < 8,
    `The host's heap grew ${late.heap - early.heap} MB over 200 guests`,
  )
  assert(
    late.rss - early.rss < 40,
    `The process grew ${late.rss - early.rss} MB over 200 guests`,
  )
})
await check("dispose and call after stop", async () => {
  await ordinary.stop()
  assert(logs.includes("disposed"))
  assert.equal((await ordinary.exited).kind, "stopped")
  await rejectsKind(ordinary.call("metadata.test.noop", []), "crashed")
})
await check(
  "a stuck thread: its guest is ended, the others only lose the host",
  async () => {
    const stuck = sandbox(NOOP)
    const bystander = sandbox(NOOP)
    await Promise.all([stuck.start(), bystander.start()])
    const inFlight = bystander.call("metadata.test.noop", [])
    await inFlight
    const before = performance.now()
    sandboxTestHooks.spin(stuck, 20_000)
    const waiting = rejectsKind(
      bystander.call("metadata.test.noop", []),
      "crashed",
    )
    assert.equal((await stuck.exited).kind, "limit")
    assert.equal((await bystander.exited).kind, "host")
    await waiting
    process.stdout.write(
      `  noticed after ${((performance.now() - before) / 1000).toFixed(1)} s\n`,
    )
    // A new host serves whoever comes next.
    const next = sandbox(NOOP)
    await next.start()
    assert.equal(await next.call("metadata.test.noop", []), null)
    await next.stop()
  },
)
await check(
  "a guest looping where no interrupt reaches is ended in time",
  async () => {
    // QuickJS asks its interrupt handler once in ten thousand loop turns.
    // With a turn that takes a millisecond, that is ten seconds.
    const looping = sandbox(
      fixture(
        'return {metadata:{test:{run(){const o = Array.from({length: 2e5}, (_, i) => ({i, s: "x".repeat(20)})); for (;;) JSON.parse(JSON.stringify(o))}}}}',
      ),
      { cpuMs: 300 },
    )
    const bystander = sandbox(NOOP)
    await Promise.all([looping.start(), bystander.start()])
    const before = performance.now()
    await rejectsKind(looping.call("metadata.test.run", []), "limit")
    const took = performance.now() - before
    assert.equal((await looping.exited).kind, "limit")
    // The interrupt may win on a fast machine; only a killed host displaces it.
    try {
      assert.equal(await bystander.call("metadata.test.noop", []), null)
    } catch {
      assert.equal((await bystander.exited).kind, "host")
    }
    await bystander.stop()
    assert(took < 3000, `It ran for ${took} ms`)
    process.stdout.write(`  ended after ${Math.round(took)} ms\n`)
    const next = sandbox(NOOP)
    await next.start()
    assert.equal(await next.call("metadata.test.noop", []), null)
    await next.stop()
  },
)
for (const value of live) await value.stop()
await stopSandboxHost()

for (const cap of [2, 1]) {
  await check(`cap ${cap}: a guest starting during a spin`, async () => {
    sandboxTestHooks.configure({ cap })
    const spinner = sandbox(NOOP, undefined, { pluginId: `spinner-${cap}` })
    assert.equal(spinner.thread, undefined)
    await spinner.start()
    sandboxTestHooks.spin(spinner, 1700)
    await wait(650)
    const other = sandbox(NOOP, undefined, { pluginId: `other-${cap}` })
    const before = performance.now()
    await other.start()
    assert.equal(await other.call("metadata.test.noop", []), null)
    const elapsed = performance.now() - before
    if (cap === 2) {
      assert.notEqual(other.thread, spinner.thread)
      assert(elapsed < 800, `Second thread answered after ${elapsed} ms`)
    } else {
      assert.equal(other.thread, spinner.thread)
      assert(elapsed > 700, `One thread waited only ${elapsed} ms`)
    }
    process.stdout.write(
      `  cap ${cap}: ${Math.round(elapsed)} ms to wake and answer\n`,
    )
    await wait(1100)
    await Promise.all([spinner.stop(), other.stop()])
    await stopSandboxHost()
  })
}
await check(
  "a stuck thread leaves the other thread's guests and state alone",
  async () => {
    sandboxTestHooks.configure({ cap: 2 })
    const stuck = sandbox(NOOP, { cpuMs: 200 }, { pluginId: "pool-stuck" })
    const bystander = sandbox(NOOP, undefined, { pluginId: "pool-bystander" })
    await stuck.start()
    await bystander.start()
    assert.equal(stuck.thread, bystander.thread)
    sandboxTestHooks.spin(stuck, 20_000)
    await wait(650)
    const other = sandbox(
      fixture("let n = 0; return {metadata:{test:{next(){return ++n}}}}"),
      undefined,
      { pluginId: "pool-counter" },
    )
    await other.start()
    assert.notEqual(other.thread, stuck.thread)
    assert.equal(await other.call("metadata.test.next", []), 1)
    const waiting = rejectsKind(
      bystander.call("metadata.test.noop", []),
      "crashed",
    )
    assert.equal((await stuck.exited).kind, "limit")
    assert.equal((await bystander.exited).kind, "host")
    await waiting
    assert.equal(await other.call("metadata.test.next", []), 2)
    await other.stop()
    await stopSandboxHost()
  },
)
await check(
  "CPU failures get their own thread and light guests avoid it",
  async () => {
    sandboxTestHooks.configure({ cap: 2 })
    const light = sandbox(NOOP, undefined, { pluginId: "heavy-neighbor" })
    await light.start()
    const cpu = sandbox(
      fixture("return {metadata:{test:{run(){while(true){}}}}}"),
      { cpuMs: 80 },
      { pluginId: "known-heavy" },
    )
    await cpu.start()
    await rejectsKind(cpu.call("metadata.test.run", []), "limit")
    const back = sandbox(NOOP, undefined, { pluginId: "known-heavy" })
    await back.start()
    assert.notEqual(back.thread, light.thread)
    const newcomer = sandbox(NOOP, undefined, { pluginId: "new-light" })
    await newcomer.start()
    assert.equal(newcomer.thread, light.thread)
    await Promise.all([light.stop(), back.stop(), newcomer.stop()])
    await stopSandboxHost()
  },
)
await check(
  "hot guests mark heavy and notify only their neighbors once per window",
  async () => {
    sandboxTestHooks.configure({ cap: 2, windowMs: 1000 })
    let crowded = 0
    const hot = sandbox(NOOP, undefined, { pluginId: "crowd-hot" })
    const light = sandbox(NOOP, undefined, {
      pluginId: "crowd-light",
      onCrowded: () => {
        crowded++
      },
    })
    await hot.start()
    await light.start()
    assert.equal(hot.thread, light.thread)
    sandboxTestHooks.spin(hot, 1200)
    await wait(1100)
    assert.equal(crowded, 1)
    const thread = sandboxTestHooks
      .threads()
      .find((item) => item.thread === hot.thread)
    assert(thread?.guests.find((item) => item.pluginId === "crowd-hot")?.heavy)
    assert((thread?.share ?? 0) >= 0.5)
    await wait(200)
    await Promise.all([hot.stop(), light.stop()])
    await stopSandboxHost()
  },
)
await check(
  "light guests pack and spare threads end, but the last thread stays",
  async () => {
    sandboxTestHooks.configure({
      cap: 2,
      busy: 0,
      windowMs: 5000,
      spareMs: 100,
      idleMs: 1000,
    })
    const a = sandbox(NOOP, undefined, { pluginId: "pack-a" })
    const b = sandbox(NOOP, undefined, { pluginId: "pack-b" })
    await a.start()
    await b.start()
    assert.notEqual(a.thread, b.thread)
    sandboxTestHooks.configure({ busy: 0.25 })
    const c = sandbox(NOOP, undefined, { pluginId: "pack-c" })
    await c.start()
    assert.equal(c.thread, a.thread)
    await b.stop()
    await wait(300)
    assert.equal(sandboxTestHooks.threads().length, 1)
    await Promise.all([a.stop(), c.stop()])
    await wait(300)
    assert.equal(sandboxTestHooks.threads().length, 1)
    sandboxTestHooks.configure({ busy: 0 })
    const replacement = sandbox(NOOP, undefined, {
      pluginId: "pack-replacement",
    })
    await replacement.start()
    assert.notEqual(replacement.thread, a.thread)
    await wait(300)
    assert.equal(
      sandboxTestHooks.threads().length,
      1,
      "the former last thread now ends as a spare",
    )
    await stopSandboxHost()
  },
)
await check(
  "30 guests respect the thread cap; 300 guests across threads release their memory",
  async () => {
    sandboxTestHooks.configure({
      cap: 3,
      busy: 0,
      spareMs: 30_000,
      idleMs: 600_000,
    })
    const many = Array.from({ length: 30 }, (_, n) =>
      sandbox(NOOP, undefined, { pluginId: `cap-${n}` }),
    )
    await Promise.all(many.map((value) => value.start()))
    assert.equal(sandboxTestHooks.threads().length, 3)
    assert.equal(new Set(many.map((value) => value.thread)).size, 3)
    await Promise.all(many.map((value) => value.call("metadata.test.noop", [])))
    const keep = [
      ...new Map(many.map((value) => [value.thread, value])).values(),
    ]
    await Promise.all(
      many
        .filter((value) => !keep.includes(value))
        .map((value) => value.stop()),
    )
    const sample = async () => {
      await wait(300)
      globalThis.gc?.()
      const diagnostics = await Promise.all(
        keep.map(async (value) => Diagnostics.parse(await value.diagnostics())),
      )
      return {
        rss: process.memoryUsage().rss / 1048576,
        heap: diagnostics.reduce(
          (sum, value) => sum + value.heap.used_heap_size / 1048576,
          0,
        ),
      }
    }
    const cycle = async (count: number) => {
      for (let n = 0; n < count; n += 3) {
        const batch = Array.from({ length: 3 }, () =>
          sandbox(NOOP, undefined, { pluginId: "pool-cycle" }),
        )
        await Promise.all(batch.map((value) => value.start()))
        await Promise.all(batch.map((value) => value.stop()))
        for (const value of batch) live.delete(value)
      }
    }
    await cycle(99)
    const early = await sample()
    await cycle(201)
    const late = await sample()
    process.stdout.write(
      `  pool after 99/300: RSS ${early.rss.toFixed(1)}/${late.rss.toFixed(1)} MiB; heaps ${early.heap.toFixed(1)}/${late.heap.toFixed(1)} MiB\n`,
    )
    assert(late.rss - early.rss < 50)
    assert(late.heap - early.heap < 12)
    assert.equal(
      sandboxTestHooks.threads().flatMap((thread) => thread.guests).length,
      3,
    )
    const before = performance.now()
    await stopSandboxHost()
    process.stdout.write(
      `  shutdown with three awake guests: ${Math.round(performance.now() - before)} ms\n`,
    )
    assert(performance.now() - before < 500)
  },
)
for (const value of live) await value.stop()
await stopSandboxHost()
if (failed) process.exitCode = 1
// Both builds export their own SandboxError constructor. Check the source API too.
assert.equal(new source.SandboxError("guest", "message").kind, "guest")
