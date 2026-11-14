import { SandboxError, type Sandbox } from "./sandbox"

export type Clock = {
  now(): number
  later(run: () => void, ms: number): () => void
}
const systemClock: Clock = {
  now: Date.now,
  later(run, ms) {
    const timer = setTimeout(run, ms).unref()
    return () => clearTimeout(timer)
  },
}
export type StopReason =
  | "idle"
  | "the cap"
  | "turned off"
  | "failed"
  | "the plugin host restarted"
  | "moved off a busy thread"

/** Owns only sandboxes, not plugin eligibility or database state. */
export class SandboxPool {
  readonly entries = new Set<SandboxLease>()
  constructor(
    readonly max: number,
    readonly idleMs: number,
    readonly clock: Clock = systemClock,
  ) {}
  trim(reserve = 0): Promise<void> {
    const stops: Promise<void>[] = []
    while (
      [...this.entries].filter((entry) => entry.awake).length + reserve >
      this.max
    ) {
      const oldest = [...this.entries]
        .filter((entry) => entry.evictable)
        .sort((a, b) => a.idleAt - b.idleAt)[0]
      if (!oldest) break
      // sleep detaches synchronously. A later reservation waits for disposal.
      stops.push(oldest.sleep("the cap"))
    }
    return Promise.all(stops).then(() => {})
  }
}

/**
 * sleeping -> waking -> awake -> disposing -> sleeping; close is terminal.
 * Reservations increment before any await, including while waking/disposing.
 * Only awake + zero reservations can sleep or be evicted. Disposal detaches
 * synchronously, so a reservation arriving during it waits then starts anew.
 * close invalidates a wake and stops its result before it can serve a call.
 * Unexpected exits detach once per sandbox, impose backoff, and latch failure
 * on the fifth exit in ten minutes. A new lease is an admin reset.
 */
export class SandboxLease {
  private sandbox?: Sandbox
  private waking?: Promise<Sandbox>
  private disposing: Promise<void> = Promise.resolve()
  private closed = false
  private cancelIdle?: () => void
  private failures: number[] = []
  private retryAt = 0
  private failed = false
  private active = 0
  idleAt = 0
  constructor(
    private readonly pool: SandboxPool,
    private readonly create: (onCrowded: () => void) => Promise<Sandbox>,
    private readonly notify: (
      event: "started" | "stopped" | "crashed",
      detail: string,
      terminal: boolean,
    ) => void,
    private readonly drain: () => Promise<void>,
  ) {
    pool.entries.add(this)
  }
  get awake(): boolean {
    return !!this.sandbox || !!this.waking
  }
  get evictable(): boolean {
    return !!this.sandbox && !this.waking && this.active === 0 && !this.closed
  }
  private crash(sandbox: Sandbox | undefined, message: string) {
    if (this.closed || (sandbox && this.sandbox !== sandbox)) return
    this.sandbox = undefined
    const now = this.pool.clock.now()
    this.failures = this.failures.filter((at) => now - at < 600_000)
    this.failures.push(now)
    this.failed = this.failures.length >= 5
    this.retryAt =
      now + ([1000, 5000, 30000, 300000][this.failures.length - 1] ?? 300000)
    this.notify("crashed", message, this.failed)
    // A new sandbox must not load storage totals before the old writes finish.
    this.disposing = this.disposing.then(this.drain)
  }
  /**
   * This sandbox's host went away because of another plugin.
   * This one did nothing wrong: no backoff, nothing counted, and the next
   * call wakes it in a new host.
   */
  private displaced(sandbox: Sandbox) {
    if (this.closed || this.sandbox !== sandbox) return
    this.sandbox = undefined
    this.notify("stopped", "the plugin host restarted", false)
    this.disposing = this.disposing.then(this.drain)
  }
  private async wake(): Promise<Sandbox> {
    if (this.closed || this.failed)
      throw new SandboxError("crashed", "Plugin isn't running")
    if (this.pool.clock.now() < this.retryAt)
      throw new SandboxError(
        "crashed",
        "Plugin is restarting; try again after the backoff",
      )
    if (this.waking) return this.waking
    if (this.sandbox) return this.sandbox
    const start = async () => {
      await this.disposing
      await this.pool.trim()
      if (this.closed) throw new SandboxError("crashed", "Plugin isn't running")
      let sandbox: Sandbox | undefined
      try {
        sandbox = await this.create(() => {
          if (this.sandbox === sandbox)
            void this.sleep("moved off a busy thread")
        })
        if (this.closed)
          throw new SandboxError("crashed", "Plugin isn't running")
        this.sandbox = sandbox
        const current = sandbox
        void sandbox.exited.then((exit) => {
          if (exit.kind === "host") this.displaced(current)
          else if (exit.kind !== "stopped") this.crash(current, exit.message)
        })
        await sandbox.start()
        if (this.closed || this.sandbox !== sandbox)
          throw new SandboxError("crashed", "Plugin stopped while waking")
        this.notify("started", "", false)
        return sandbox
      } catch (cause) {
        // Exits have already detached and counted this instance. Setup errors
        // and factory failures have no exit notification and count here.
        if (!sandbox || this.sandbox === sandbox)
          this.crash(
            sandbox,
            cause instanceof Error ? cause.message : "Sandbox start failed",
          )
        if (sandbox) await sandbox.stop()
        await this.drain()
        throw cause
      }
    }
    // Defer the work so even a synchronous factory failure shares this promise.
    this.waking = Promise.resolve().then(start)
    try {
      return await this.waking
    } finally {
      this.waking = undefined
    }
  }
  async run<T>(action: (sandbox: Sandbox) => Promise<T>): Promise<T> {
    this.active++
    this.cancelIdle?.()
    try {
      const sandbox = await this.wake()
      if (this.closed) throw new SandboxError("crashed", "Plugin isn't running")
      return await action(sandbox)
    } finally {
      this.active--
      if (this.active === 0 && !this.closed) {
        this.idleAt = this.pool.clock.now()
        if (this.pool.idleMs > 0)
          this.cancelIdle = this.pool.clock.later(() => {
            void this.sleep("idle")
          }, this.pool.idleMs)
        void this.pool.trim()
      }
    }
  }
  sleep(reason: StopReason): Promise<void> {
    if (!this.evictable && reason !== "turned off") return this.disposing
    this.cancelIdle?.()
    const sandbox = this.sandbox
    this.sandbox = undefined
    this.disposing = this.disposing
      .then(async () => {
        if (!sandbox) return
        await sandbox.stop()
        await this.drain()
        this.notify("stopped", reason, false)
      })
      .catch(() => {})
    return this.disposing
  }
  async close(): Promise<void> {
    this.closed = true
    this.cancelIdle?.()
    this.pool.entries.delete(this)
    await this.sleep("turned off")
    await this.waking?.catch(() => {})
    await this.disposing
  }
}
