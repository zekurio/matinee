import assert from "node:assert/strict"

import {
  SandboxError,
  type Sandbox,
  type SandboxExit,
} from "../src/plugins/sandbox"
import {
  SandboxLease,
  SandboxPool,
  type Clock,
} from "../src/plugins/sandbox-lease"

class FakeClock implements Clock {
  time = 0
  timers = new Map<() => void, number>()
  now() {
    return this.time
  }
  later(run: () => void, ms: number) {
    this.timers.set(run, this.time + ms)
    return () => {
      this.timers.delete(run)
    }
  }
  tick(ms: number) {
    this.time += ms
    for (const [run, at] of this.timers)
      if (at <= this.time) {
        this.timers.delete(run)
        run()
      }
  }
}
class FakeSandbox implements Sandbox {
  thread = undefined
  crowded = () => {}
  exit = Promise.withResolvers<SandboxExit>()
  exited = this.exit.promise
  starts = 0
  stops = 0
  startGate = Promise.resolve()
  stopGate = Promise.resolve()
  async start() {
    this.starts++
    await this.startGate
    return { handlers: [] }
  }
  async call() {
    return null
  }
  async diagnostics() {
    return null
  }
  async stop() {
    this.stops++
    await this.stopGate
    this.exit.resolve({ kind: "stopped", message: "stopped" })
  }
  crash() {
    this.exit.resolve({ kind: "limit", message: "CPU limit" })
  }
  /** The shared host went away because of another plugin. */
  displace() {
    this.exit.resolve({ kind: "host", message: "The plugin host restarted" })
  }
}
async function flush() {
  for (let n = 0; n < 40; n++) await Promise.resolve()
}
export async function leaseChecks() {
  const clock = new FakeClock()
  const pool = new SandboxPool(2, 100, clock)
  const created: FakeSandbox[] = []
  const failures: boolean[] = []
  function lease(factory = async () => new FakeSandbox()) {
    return new SandboxLease(
      pool,
      async (onCrowded) => {
        const sandbox = await factory()
        sandbox.crowded = onCrowded
        created.push(sandbox)
        return sandbox
      },
      (event, _detail, terminal) => {
        if (event === "crashed") failures.push(terminal)
      },
      async () => {},
    )
  }
  const gate = Promise.withResolvers<void>()
  const a = lease(async () => {
    const s = new FakeSandbox()
    s.startGate = gate.promise
    return s
  })
  const calls = Array.from({ length: 20 }, () => a.run(async () => 42))
  await flush()
  assert.equal(created.length, 1, "twenty callers share one wake")
  assert.equal(created[0]?.starts, 1)
  clock.tick(1000)
  assert.equal(created[0]?.stops, 0, "idle timer cannot stop a wake")
  gate.resolve()
  assert.deepEqual(await Promise.all(calls), Array(20).fill(42))
  const stop = Promise.withResolvers<void>()
  created[0]!.stopGate = stop.promise
  clock.tick(100)
  await flush()
  const duringDispose = a.run(async () => 43)
  await flush()
  assert.equal(created.length, 1, "wake waits for disposal")
  stop.resolve()
  assert.equal(await duringDispose, 43)
  assert.equal(created.length, 2)
  assert.equal(created[0]?.stops, 1)
  const b = lease()
  await b.run(async () => {})
  clock.time++
  const c = lease()
  await c.run(async () => {})
  assert(!a.awake, "cap evicts oldest idle lease")
  assert(b.awake && c.awake)
  const busy = Promise.withResolvers<void>()
  const bp = b.run(() => busy.promise)
  const cp = c.run(() => busy.promise)
  await flush()
  await a.run(async () => {})
  assert(b.awake && c.awake, "busy leases exceed cap rather than wait")
  busy.resolve()
  await Promise.all([bp, cp])
  await flush()
  assert([...pool.entries].filter((entry) => entry.awake).length <= 2)
  await Promise.all([a.close(), b.close(), c.close()])

  const waking = Promise.withResolvers<void>()
  const d = lease(async () => {
    await waking.promise
    return new FakeSandbox()
  })
  const dp = assert.rejects(
    d.run(async () => 0),
    /running/,
  )
  await flush()
  const closed = d.close()
  waking.resolve()
  await Promise.all([closed, dp])
  assert(!d.awake, "disable/shutdown during factory wake leaves no worker")
  assert.equal(created.at(-1)?.stops, 1)
  await assert.rejects(
    d.run(async () => 0),
    /running/,
  )

  const e = lease()
  const longCall = Promise.withResolvers<void>()
  const ep = e.run(() => longCall.promise)
  await flush()
  await e.close()
  assert.equal(
    created.at(-1)?.stops,
    1,
    "configure/remove interrupts an active sandbox",
  )
  longCall.resolve()
  await ep

  const f = lease()
  for (const delay of [1000, 5000, 30000, 300000, 300000]) {
    await f.run(async () => {})
    created.at(-1)!.crash()
    await flush()
    await assert.rejects(
      f.run(async () => {}),
      (cause: Error) =>
        cause instanceof SandboxError && cause.kind === "crashed",
    )
    clock.tick(delay)
  }
  assert.equal(failures.length, 5, "one failure per exit")
  assert.equal(failures.at(-1), true)
  await assert.rejects(
    f.run(async () => {}),
    /running/,
  )
  await f.close()

  const g = lease(async () => {
    throw new SandboxError("guest", "bad setup")
  })
  await assert.rejects(
    g.run(async () => {}),
    /bad setup/,
  )
  await assert.rejects(
    g.run(async () => {}),
    /restarting/,
  )
  await g.close()

  // An exit during setup and the resulting start rejection are one failure.
  const h = lease(async () => {
    const sandbox = new FakeSandbox()
    sandbox.start = async () => {
      sandbox.crash()
      throw new SandboxError("limit", "CPU limit during setup")
    }
    return sandbox
  })
  const beforeFailures = failures.length
  await Promise.all(
    Array.from({ length: 20 }, () =>
      assert.rejects(
        h.run(async () => {}),
        /CPU limit/,
      ),
    ),
  )
  assert.equal(failures.length, beforeFailures + 1)
  await h.close()

  // Losing the shared host to another plugin is no failure of this one:
  // no backoff, nothing counted, and the next call wakes it at once.
  const k = lease()
  const beforeDisplaced = failures.length
  for (let n = 0; n < 8; n++) {
    await k.run(async () => {})
    created.at(-1)!.displace()
    await flush()
    assert(!k.awake, "a displaced lease sleeps")
  }
  assert.equal(await k.run(async () => 44), 44)
  assert.equal(failures.length, beforeDisplaced, "displacement isn't counted")
  await k.close()

  const moved = lease()
  const beforeMove = failures.length
  for (let n = 0; n < 8; n++) {
    await moved.run(async () => {})
    created.at(-1)!.crowded()
    await flush()
    assert(!moved.awake, "an idle crowded lease sleeps")
  }
  assert.equal(failures.length, beforeMove, "moving has no failure or backoff")
  const moveCall = Promise.withResolvers<void>()
  const moving = moved.run(() => moveCall.promise)
  await flush()
  const busySandbox = created.at(-1)!
  busySandbox.crowded()
  await flush()
  assert(moved.awake, "a crowded lease with a call in flight stays awake")
  assert.equal(busySandbox.stops, 0)
  moveCall.resolve()
  await moving
  await moved.close()

  // Failure history expires, rather than eventually failing a healthy plugin.
  const i = lease()
  await i.run(async () => {})
  created.at(-1)!.crash()
  await flush()
  clock.tick(600_001)
  await i.run(async () => {})
  created.at(-1)!.crash()
  await flush()
  clock.tick(1000)
  await i.run(async () => {})
  await i.close()

  const neverSleep = new SandboxPool(1, 0, clock)
  const kept = new SandboxLease(
    neverSleep,
    async () => new FakeSandbox(),
    () => {},
    async () => {},
  )
  await kept.run(async () => {})
  clock.tick(1_000_000)
  assert(kept.awake, "zero idle seconds disables sleeping")
  await kept.close()
  process.stdout.write(
    "PASS shared wake, idle disposal race, oldest-idle cap, all-busy cap, close during wake/call, backoff and failure latch\n",
  )
}
