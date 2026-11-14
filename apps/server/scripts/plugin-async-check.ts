import assert from "node:assert/strict"

import { t } from "@matinee/contracts/schema"
import type { JsonValue } from "@matinee/db"

import * as source from "../src/plugins/sandbox/index"
import type { HostCall, Sandbox } from "../src/plugins/sandbox/index"
import { Json } from "../src/plugins/schema"

const bundleUrl = new URL("../dist/server/plugin-sandbox.mjs", import.meta.url)
// SAFETY: The check bundle exports sandbox/index.ts unchanged.
const api: typeof source = process.argv.includes("--bundle")
  ? await import(bundleUrl.href)
  : source
const live = new Set<Sandbox>()
const Token = t.object({ token: t.number(), url: t.string().optional() })
const Stored = t.object({ key: t.string(), value: Json.optional() })
const requests = new Map<number, () => void>()
const stored = new Map<string, JsonValue>()
const Logged = t.object({ message: t.string() })
const logged: string[] = []
let aborted = 0
const hostCall: HostCall = async (name, args, signal) => {
  if (name === "log") {
    logged.push(Logged.parse(args).message)
    return null
  }
  if (name.startsWith("storage.")) {
    const input = Stored.parse(args)
    // Slow enough that writes not taking turns would overlap.
    await new Promise((resolve) => setTimeout(resolve, 2))
    if (name === "storage.get") return { value: stored.get(input.key) ?? null }
    stored.set(input.key, input.value ?? null)
    return null
  }
  const input = Token.parse(args)
  if (name === "http.abort") {
    requests.get(input.token)?.()
    return null
  }
  if (name !== "http.fetch") throw new Error(`Unexpected ${name}`)
  if (!input.url?.endsWith("/ready")) {
    await new Promise<void>((resolve) => {
      const finish = () => {
        aborted++
        requests.delete(input.token)
        resolve()
      }
      requests.set(input.token, finish)
      signal.addEventListener("abort", finish, { once: true })
    })
  }
  return {
    status: 200,
    statusText: "OK",
    url: input.url ?? "",
    headers: [],
    body: "",
  }
}
async function sandbox(
  methods: string,
  cpuMs = 2000,
  before = "",
  more: { settleMs?: number; extra?: string } = {},
) {
  const value = api.createSandbox({
    pluginId: "async-check",
    code: `export default { matineePlugin: 1, setup(ctx) { let state = 0; ${before} return { metadata: { test: { ${methods} } }, ${more.extra ?? ""} } } }`,
    context: {
      plugin: { id: "async-check", version: "1" },
      server: { api: 1, version: "1", publicUrl: "https://example.com" },
      config: {},
    },
    hostCall,
    limits: { cpuMs, ...(more.settleMs && { settleMs: more.settleMs }) },
  })
  live.add(value)
  await value.start()
  return value
}
try {
  const basics = await sandbox(`async run() {
    const order = []; const c = new AbortController(); const removed = () => order.push("wrong");
    c.signal.addEventListener("abort", () => { order.push(1); throw new Error("listener") });
    c.signal.addEventListener("abort", removed); c.signal.removeEventListener("abort", removed);
    c.signal.addEventListener("abort", () => order.push(2), {once:true}); c.signal.onabort = () => order.push(3);
    const any = AbortSignal.any([c.signal]); c.abort(); c.abort("wrong");
    if (order.join() !== "1,2,3" || !any.aborted || any.reason.name !== "AbortError") throw new Error("abort basics");
    try { c.signal.throwIfAborted(); throw new Error("missing throw") } catch (e) { if(e.name !== "AbortError") throw e }
    if (AbortSignal.abort("reason").reason !== "reason") throw new Error("static abort");
    const timed = AbortSignal.timeout(2); await new Promise(resolve => timed.addEventListener("abort", resolve));
    if (timed.reason.name !== "TimeoutError") throw new Error("timeout");
    await new Promise(resolve => queueMicrotask(resolve)); return true;
  }`)
  assert.equal(await basics.call("metadata.test.run", []), true)
  process.stdout.write(
    "ok controller, any, timeout, listeners and microtasks\n",
  )
  const fetcher = await sandbox(`async run() {
    const c = new AbortController();
    const pending = Array.from({length:8}, () => fetch("https://example.com/hang", {signal:c.signal}).catch(e => e.name));
    await new Promise(resolve => setTimeout(resolve, 10)); c.abort();
    const names = await Promise.all(pending);
    if (names.some(name => name !== "AbortError")) throw new Error("fetch reason");
    return (await fetch("https://example.com/ready")).status;
  }`)
  assert.equal(await fetcher.call("metadata.test.run", []), 200)
  assert.equal(aborted, 8)
  process.stdout.write(
    "ok guest abort reaches host, eight requests end and ninth succeeds\n",
  )
  const timed = await sandbox(`async run(call) {
    call.signal.addEventListener("abort", () => state++);
    try { await fetch("https://example.com/hang", {signal:call.signal}) } catch { state++ }
  }, read() { return state }, async late(call) { await new Promise(resolve => setTimeout(resolve, 80)); state++; return "late" }, async overlap(n, call) { await new Promise(resolve => setTimeout(resolve, 20)); return n }`)
  await assert.rejects(timed.call("metadata.test.run", [], { timeoutMs: 40 }))
  assert.equal(await timed.call("metadata.test.read", []), 2)
  assert.equal(aborted, 9)
  await assert.rejects(timed.call("metadata.test.late", [], { timeoutMs: 20 }))
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(await timed.call("metadata.test.read", []), 3)
  process.stdout.write(
    "ok call timeout aborts signal and fetch; late result is dropped\n",
  )
  const calls = Array.from({ length: 16 }, (_, n) =>
    timed.call("metadata.test.overlap", [n]),
  )
  const extra = timed.call("metadata.test.overlap", [16]).then(
    () => "accepted",
    () => "refused",
  )
  assert.deepEqual(
    await Promise.all(calls),
    Array.from({ length: 16 }, (_, n) => n),
  )
  assert.ok(["accepted", "refused"].includes(await extra))
  process.stdout.write(
    "ok sixteen calls interleave and seventeenth is bounded\n",
  )
  const timers = await sandbox(`async run() {
    const order = [];
    const done = new Promise(resolve => setTimeout(() => { order.push("c"); resolve() }, 60));
    setTimeout(() => order.push("a"), 10);
    setTimeout(() => { throw new Error("a timer that throws") }, 20);
    setTimeout(() => order.push("b"), 30);
    clearTimeout(setTimeout(() => order.push("cleared"), 15));
    // Far more than a plugin's 100 timers, on one timer of the host's.
    const signals = Array.from({length: 300}, () => AbortSignal.timeout(40));
    let full = "";
    const held = [];
    try { for (let n = 0; n < 100; n++) held.push(setTimeout(() => {}, 50000)) } catch (e) { full = e.name }
    held.forEach(clearTimeout);
    // The signals' timers are ids 6 to 305. A plugin can't clear them.
    for (let id = 6; id <= 305; id++) clearTimeout(id);
    await done;
    if (order.join() !== "a,b,c") throw new Error("order " + order.join());
    if (!signals.every(signal => signal.aborted && signal.reason.name === "TimeoutError")) throw new Error("timeouts");
    return full;
  }`)
  assert.equal(await timers.call("metadata.test.run", []), "RangeError")
  process.stdout.write(
    "ok timers fire in order on one host timer, with the limit of 100\n",
  )
  const storage = await sandbox(
    `async run() {
      await Promise.all(Array.from({length: 20}, () => store.update("n", n => (n ?? 0) + 1)));
      const set = store.update("n", async n => { await new Promise(resolve => setTimeout(resolve, 20)); return n + 100 });
      const direct = store.set("n", 7);
      const failed = await store.update("n", () => { throw new Error("no") }).catch(e => e.message);
      await Promise.all([set, direct]);
      return [await store.get("n"), failed, await store.update("m", m => m === null ? "new" : "old")];
    }`,
    2000,
    "const store = ctx.storage;",
  )
  // 20 updates, then +100, then the set that waited for its turn.
  assert.deepEqual(await storage.call("metadata.test.run", []), [
    7,
    "no",
    "new",
  ])
  assert.equal(stored.get("n"), 7)
  process.stdout.write("ok storage writes to one key take turns\n")
  const deaf = await sandbox(
    `async deaf() { await new Promise(resolve => setTimeout(resolve, 300)) },
     obey(call) { return new Promise((_, reject) => call.signal.addEventListener("abort", () => reject(call.signal.reason))) },
     read() { return 1 }`,
  )
  const giveUpOn = async (path: string) => {
    await Promise.all(
      Array.from({ length: 16 }, () =>
        assert.rejects(deaf.call(path, [], { timeoutMs: 30 })),
      ),
    )
    const before = performance.now()
    assert.equal(await deaf.call("metadata.test.read", []), 1)
    return performance.now() - before
  }
  // Sixteen handlers that stop when told free their places at once.
  const obeyed = await giveUpOn("metadata.test.obey")
  assert(
    obeyed < 150,
    `A call waited ${obeyed} ms behind handlers that had stopped`,
  )
  // Sixteen that go on keep them until they end, about 270 ms later.
  const ignored = await giveUpOn("metadata.test.deaf")
  assert(ignored > 150, `A call got a place after ${ignored} ms`)
  process.stdout.write("ok a cancelled handler keeps its place until it ends\n")
  const endless = await sandbox(
    "never() { return new Promise(() => {}) }",
    2000,
    "",
    { settleMs: 150 },
  )
  await assert.rejects(
    endless.call("metadata.test.never", [], { timeoutMs: 30 }),
  )
  const ended = await endless.exited
  assert.equal(ended.kind, "limit")
  assert.match(ended.message, /after its call was cancelled/)
  process.stdout.write("ok a handler that never ends gets the sandbox ended\n")
  const stopping = await sandbox(
    `wait(call) { return new Promise((_, reject) => call.signal.addEventListener("abort", () => { state = "told"; reject(call.signal.reason) })) }`,
    2000,
    "",
    { extra: 'dispose() { ctx.log.info("at dispose: " + state) }' },
  )
  const waiting = assert.rejects(stopping.call("metadata.test.wait", []))
  await new Promise((resolve) => setTimeout(resolve, 30))
  await stopping.stop()
  await waiting
  assert(logged.includes("at dispose: told"), logged.join("; "))
  process.stdout.write("ok stopping tells handlers before dispose runs\n")
  const spinner = await sandbox(
    `run(call) { call.signal.addEventListener("abort", () => { while(true) {} }); return new Promise(() => {}) }, read() { return 1 }`,
    60,
  )
  await assert.rejects(spinner.call("metadata.test.run", [], { timeoutMs: 40 }))
  await new Promise((resolve) => setTimeout(resolve, 200))
  await assert.rejects(spinner.call("metadata.test.read", []))
  process.stdout.write("ok abort listener obeys CPU limit\n")
} finally {
  await Promise.all([...live].map((value) => value.stop()))
  api.stopSandboxHost()
}
