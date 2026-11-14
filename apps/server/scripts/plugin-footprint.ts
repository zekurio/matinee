// What plugin sandboxes cost in memory and time. Run it from apps/server:
//   node --expose-gc --import tsx scripts/plugin-footprint.ts
//   node build.mjs --checks && node --expose-gc --import tsx scripts/plugin-footprint.ts --bundle
// The bundle is what ships, and tsx inflates the numbers. Each sample is a
// fresh process, since a process keeps some of what it once used.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { setTimeout as wait } from "node:timers/promises"
import { fileURLToPath } from "node:url"

import { t } from "@matinee/contracts/schema"

import * as source from "../src/plugins/sandbox/index"
import type { Sandbox } from "../src/plugins/sandbox/index"

const bundle = new URL("../dist/server/plugin-sandbox.mjs", import.meta.url)
// SAFETY: build.mjs builds the same sandbox API as a standalone check entry.
const api: typeof source = process.argv.includes("--bundle")
  ? await import(bundle.href)
  : source
const { createSandbox, sandboxTestHooks, stopSandboxHost } = api
sandboxTestHooks.enable()
sandboxTestHooks.configure({ cap: 3, spareMs: 1000 })
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0
const samples = new Map<string, number[]>()
function record(name: string, value: number) {
  const values = samples.get(name) ?? []
  values.push(value)
  samples.set(name, values)
}
/** Resident memory, and the part of it that is the process's own data. */
async function memory() {
  await wait(250)
  globalThis.gc?.()
  await wait(50)
  const anonymous = /^Anonymous:\s+(\d+) kB/m.exec(
    readFileSync("/proc/self/smaps_rollup", "utf8"),
  )
  return {
    rss: process.memoryUsage().rss / 1024 / 1024,
    anonymous: Number(anonymous?.[1] ?? 0) / 1024,
  }
}
function fixture() {
  return createSandbox({
    pluginId: "footprint",
    code: "export default Object.freeze({matineePlugin:1, setup(){return {metadata:{demo:{search(){return []}}}}}})",
    context: { plugin: {}, server: {}, config: {} },
    hostCall: async () => null,
  })
}
if (!process.argv.includes("--round")) {
  process.stdout.write(
    `${process.argv.includes("--bundle") ? "bundle" : "tsx"}; GC ${globalThis.gc ? "enabled" : "disabled"}; medians of three fresh processes\n`,
  )
  const Result = t.object({
    metrics: t.record(t.string(), t.number()),
    accounting: t.string(),
  })
  for (let round = 0; round < 3; round++) {
    const output = execFileSync(
      process.execPath,
      [
        ...process.execArgv,
        fileURLToPath(import.meta.url),
        ...process.argv.slice(2),
        "--round",
      ],
      { encoding: "utf8" },
    )
    const result = Result.parse(JSON.parse(output))
    if (round === 0)
      process.stdout.write(`worker accounting ${result.accounting}\n`)
    for (const [name, value] of Object.entries(result.metrics))
      record(name, value)
  }
  for (const [name, values] of samples)
    process.stdout.write(
      `${name}: ${median(values).toFixed(3)} [${values.map((v) => v.toFixed(2)).join(", ")}]\n`,
    )
} else {
  const live: Sandbox[] = []
  let accounting = ""
  const base = await memory()
  record("nothing loaded, RSS MiB", base.rss)
  try {
    for (let n = 0; n < 8; n++) {
      const sandbox = fixture()
      live.push(sandbox)
      const before = performance.now()
      await sandbox.start()
      const elapsed = performance.now() - before
      if (n === 0) record("first start, with the host thread, ms", elapsed)
      else record("a later start ms", elapsed)
      const calls: number[] = []
      for (let c = 0; c < 20; c++) {
        const begin = performance.now()
        await sandbox.call("metadata.demo.search", [])
        calls.push(performance.now() - begin)
      }
      record("call ms", median(calls))
      if (n === 0) {
        const one = await memory()
        record("one awake, RSS MiB", one.rss)
        record("the first awake sandbox adds MiB", one.rss - base.rss)
        accounting = JSON.stringify(await sandbox.diagnostics())
      }
    }
    const eight = await memory()
    const one = samples.get("one awake, RSS MiB")?.[0] ?? base.rss
    record("eight awake, RSS MiB", eight.rss)
    record("each further awake sandbox adds MiB", (eight.rss - one) / 7)
    sandboxTestHooks.configure({ busy: 0 })
    let previous = eight
    const extra: Sandbox[] = []
    for (const n of [2, 3]) {
      const sandbox = fixture()
      live.push(sandbox)
      extra.push(sandbox)
      const before = performance.now()
      await sandbox.start()
      record(`thread ${n} wake ms`, performance.now() - before)
      assert.equal(sandboxTestHooks.threads().length, n)
      const current = await memory()
      record(
        `thread ${n} and its guest add RSS MiB`,
        current.rss - previous.rss,
      )
      record(
        `thread ${n} and its guest add anonymous MiB`,
        current.anonymous - previous.anonymous,
      )
      previous = current
    }
    await Promise.all(extra.map((sandbox) => sandbox.stop()))
    await wait(12_000)
    assert.equal(sandboxTestHooks.threads().length, 1)
    const spareEnded = await memory()
    record(
      "spares ended, eight still awake: RSS over one-thread eight MiB",
      spareEnded.rss - eight.rss,
    )
    record(
      "spares ended, eight still awake: anonymous over one-thread eight MiB",
      spareEnded.anonymous - eight.anonymous,
    )
    sandboxTestHooks.configure({ busy: 0.25 })
  } finally {
    await Promise.all(live.map((sandbox) => sandbox.stop()))
  }
  // The thread stays for the next sandbox. V8 gives pages back after a while.
  await wait(12_000)
  const asleep = await memory()
  record("all asleep, host kept: RSS MiB", asleep.rss)
  record(
    "all asleep, host kept: kept over the start MiB",
    asleep.anonymous - base.anonymous,
  )
  await stopSandboxHost()
  await wait(12_000)
  const ended = await memory()
  record("host ended: RSS MiB", ended.rss)
  record(
    "host ended: kept over the start MiB",
    ended.anonymous - base.anonymous,
  )
  process.stdout.write(
    JSON.stringify({
      metrics: Object.fromEntries(
        [...samples].map(([name, values]) => [name, median(values)]),
      ),
      accounting,
    }),
  )
}
