import {
  JOB_QUEUE_IDS,
  type JobQueueId,
  type JobQueueStatus,
} from "@matinee/contracts"

import { log } from "../log"

/*
 * Background work, the way Immich runs it: named queues with a number of
 * workers each, which admins can change, pause, and clear. A job has a
 * key, and asking for a key that is already waiting joins that job, so
 * the same file is never probed or the same image fetched twice at once.
 * Callers either wait for the result (`run`) or leave it to the queue
 * (`push`). Unlike Immich's Redis queues these live in memory: what they
 * work on is derived from the database, so the scheduled tasks find it
 * again after a restart.
 */

export type Priority = "high" | "normal" | "low"
const LANES: readonly Priority[] = ["high", "normal", "low"]
const RANK = new Map<Priority, number>(LANES.map((lane, i) => [lane, i]))

const RECENT_FAILURES = 5

export type JobContext = {
  /** Aborts when the job is cancelled or the server shuts down. */
  signal: AbortSignal
}

/** A failure that stops more of the same: the waiting jobs `drop` matches. */
export type Fatal<P> = { message: string; drop: (payload: P) => boolean }

export type QueueDefinition<P, R> = {
  id: JobQueueId
  name: string
  description: string
  /** Jobs that run at once, unless an admin changed it. */
  concurrency: number
  /**
   * Lets admins change the concurrency up to `max`. `note` tells them what
   * the number counts and when to raise it. Without it the concurrency is
   * fixed. Only queues that build up a real backlog need it.
   */
  tuning?: { max: number; note: string }
  run: (payload: P, context: JobContext) => Promise<R>
  /** Jobs with the same key are one job. */
  key: (payload: P) => string
  /** Names the job in failures, like a file's path. */
  label: (payload: P) => string
  /** Groups jobs, such as by library, for `busy`. */
  group?: (payload: P) => string
  /** Folds a request into the waiting job with its key. Keeps the waiting one by default. */
  merge?: (waiting: P, incoming: P) => P
  /**
   * Whether a request shares the result of the running job with its key.
   * Otherwise it runs again once that one ends, as a scan must when files
   * changed during it. Always by default.
   */
  joinsRunning?: (running: P, incoming: P) => boolean
  /**
   * How long a key that failed keeps failing without running again.
   * Infinity keeps it failing until the server restarts.
   */
  retryAfterMs?: number
  /** The log message for a failure. Without it, the job logs its own. */
  failure?: (payload: P) => string
  /** Recognises failures that make the waiting jobs pointless. */
  fatal?: (cause: unknown, payload: P) => Fatal<P> | null
  /** Logged when the queue runs dry after a batch, if it returns a line. */
  summary?: (batch: {
    completed: number
    failed: number
    ms: number
  }) => string | null
}

type Entry<P, R> = {
  key: string
  payload: P
  priority: Priority
  state: "waiting" | "active" | "settled"
  /** Set when it starts running. */
  startedAt: Date | null
  done: PromiseWithResolvers<R>
  controller: AbortController
}

type Remembered = { at: number; cause: unknown }

/** First in, first out, without `shift` copying a long queue every time. */
class Lane<T> {
  private items: T[] = []
  private head = 0

  push(item: T): void {
    this.items.push(item)
  }

  take(): T | undefined {
    if (this.head >= this.items.length) return undefined
    const item = this.items[this.head++]
    if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head)
      this.head = 0
    }
    return item
  }
}

function abortError(): DOMException {
  return new DOMException("Cancelled", "AbortError")
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Null for Infinity, which a number in the contract (and JSON) can't be. */
function retryAfterSeconds(ms: number): number | null {
  return Number.isFinite(ms) ? ms / 1000 : null
}

/** What the admin endpoints and shutdown need of any queue. */
export type QueueControl = {
  id: JobQueueId
  defaultConcurrency: number
  /** The highest concurrency an admin may set; null when it's fixed. */
  maxConcurrency: number | null
  status: () => JobQueueStatus
  pause: () => void
  resume: () => void
  clear: () => void
  setConcurrency: (concurrency: number) => void
  stop: () => Promise<void>
}

const registry = new Map<JobQueueId, QueueControl>()

/** Every queue, in the contract's order. */
export function allQueues(): QueueControl[] {
  return JOB_QUEUE_IDS.flatMap((id) => {
    const queue = registry.get(id)
    return queue ? [queue] : []
  })
}

export function queueById(id: JobQueueId): QueueControl | undefined {
  return registry.get(id)
}

export class Queue<P, R> implements QueueControl {
  readonly id: JobQueueId
  readonly defaultConcurrency: number
  readonly maxConcurrency: number | null
  private concurrency: number
  private paused = false
  private stopped = false
  private readonly lanes = new Map<Priority, Lane<Entry<P, R>>>(
    LANES.map((lane) => [lane, new Lane()]),
  )
  private readonly waiting = new Map<string, Entry<P, R>>()
  /** Requests that run again after the active job with their key. */
  private readonly after = new Map<string, Entry<P, R>>()
  private readonly active = new Map<string, Entry<P, R>>()
  private readonly failedKeys = new Map<string, Remembered>()
  private readonly failures: { label: string; message: string; at: Date }[] = []
  private completed = 0
  private failed = 0
  private batch: { started: number; completed: number; failed: number } | null =
    null

  constructor(private readonly definition: QueueDefinition<P, R>) {
    this.id = definition.id
    this.defaultConcurrency = definition.concurrency
    this.concurrency = definition.concurrency
    this.maxConcurrency = definition.tuning?.max ?? null
  }

  /** Queue a job and wait for its result. Rejects with its error. */
  run(payload: P, options: { priority?: Priority } = {}): Promise<R> {
    if (this.stopped) return Promise.reject(abortError())
    const priority = options.priority ?? "normal"
    const key = this.definition.key(payload)
    const remembered = this.failedKeys.get(key)
    if (remembered) {
      const retryAfter = this.definition.retryAfterMs ?? 0
      if (Date.now() - remembered.at < retryAfter) {
        return Promise.reject(remembered.cause)
      }
      this.failedKeys.delete(key)
    }

    const running = this.active.get(key)
    if (running) {
      const joins = this.definition.joinsRunning?.(running.payload, payload)
      if (joins ?? true) return running.done.promise
      const next = this.after.get(key)
      if (next) {
        this.fold(next, payload, priority)
        return next.done.promise
      }
      const entry = this.entry(key, payload, priority)
      this.after.set(key, entry)
      return entry.done.promise
    }

    const queued = this.waiting.get(key)
    if (queued) {
      this.fold(queued, payload, priority)
      return queued.done.promise
    }
    const entry = this.entry(key, payload, priority)
    this.enqueue(entry)
    this.pump()
    return entry.done.promise
  }

  /** Queue a job and leave it to the queue, which logs its failure. */
  push(payload: P, options: { priority?: Priority } = {}): void {
    this.run(payload, options).catch(() => {
      // Logged by the queue, or cancelled.
    })
  }

  /** Whether a job with the key waits or runs. */
  has(key: string): boolean {
    return this.waiting.has(key) || this.active.has(key) || this.after.has(key)
  }

  /** Whether any job of the group waits or runs. */
  busy(group: string): boolean {
    const of = this.definition.group
    if (!of) return false
    for (const map of [this.active, this.waiting, this.after]) {
      for (const entry of map.values()) {
        if (of(entry.payload) === group) return true
      }
    }
    return false
  }

  /** Whether the key failed lately, so `run` would fail at once. */
  hasFailed(key: string): boolean {
    const remembered = this.failedKeys.get(key)
    return (
      remembered !== undefined &&
      Date.now() - remembered.at < (this.definition.retryAfterMs ?? 0)
    )
  }

  /** Drop the waiting job with the key and stop the running one. */
  cancel(key: string): void {
    for (const map of [this.waiting, this.after]) {
      const entry = map.get(key)
      if (entry) this.drop(entry, abortError())
    }
    this.active.get(key)?.controller.abort()
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    this.pump()
  }

  /** Drop every waiting job. Running ones finish. */
  clear(): void {
    for (const entry of [...this.waiting.values(), ...this.after.values()]) {
      this.drop(entry, abortError())
    }
  }

  /**
   * Run up to `concurrency` jobs at once, within the queue's tuning. More
   * start at once; with fewer, running jobs finish and the rest wait.
   */
  setConcurrency(concurrency: number): void {
    if (this.maxConcurrency === null) return
    this.concurrency = Math.max(
      1,
      Math.min(this.maxConcurrency, Math.round(concurrency)),
    )
    this.pump()
  }

  /** For shutdown: drop what waits, stop what runs, and wait for it. */
  async stop(): Promise<void> {
    this.stopped = true
    this.clear()
    const running = [...this.active.values()]
    for (const entry of running) entry.controller.abort()
    await Promise.allSettled(running.map((entry) => entry.done.promise))
  }

  status(): JobQueueStatus {
    return {
      id: this.id,
      name: this.definition.name,
      description: this.definition.description,
      concurrency: this.concurrency,
      defaultConcurrency: this.defaultConcurrency,
      maxConcurrency: this.maxConcurrency ?? this.defaultConcurrency,
      concurrencyNote: this.definition.tuning?.note ?? null,
      active: this.active.size,
      waiting: this.waiting.size + this.after.size,
      completed: this.completed,
      failed: this.failed,
      paused: this.paused,
      // Map keeps insertion order, so the oldest run comes first.
      running: [...this.active.values()].map((entry) => ({
        label: this.definition.label(entry.payload),
        startedAt: entry.startedAt ?? new Date(),
      })),
      failures: [...this.failures],
      retryAfterSeconds: retryAfterSeconds(this.definition.retryAfterMs ?? 0),
    }
  }

  private entry(key: string, payload: P, priority: Priority): Entry<P, R> {
    return {
      key,
      payload,
      priority,
      state: "waiting",
      startedAt: null,
      done: Promise.withResolvers<R>(),
      controller: new AbortController(),
    }
  }

  private enqueue(entry: Entry<P, R>): void {
    this.waiting.set(entry.key, entry)
    this.lanes.get(entry.priority)?.push(entry)
    this.batch ??= { started: Date.now(), completed: 0, failed: 0 }
  }

  /** Merge a request into a waiting job, moving it up if it's more urgent. */
  private fold(entry: Entry<P, R>, payload: P, priority: Priority): void {
    const merge = this.definition.merge
    if (merge) entry.payload = merge(entry.payload, payload)
    if ((RANK.get(priority) ?? 1) < (RANK.get(entry.priority) ?? 1)) {
      entry.priority = priority
      // The old place in the slower lane is skipped when it comes up.
      if (this.waiting.get(entry.key) === entry) {
        this.lanes.get(priority)?.push(entry)
      }
    }
  }

  private drop(entry: Entry<P, R>, cause: unknown): void {
    if (entry.state !== "waiting") return
    entry.state = "settled"
    if (this.waiting.get(entry.key) === entry) this.waiting.delete(entry.key)
    if (this.after.get(entry.key) === entry) this.after.delete(entry.key)
    entry.done.reject(cause)
    // Nobody may be waiting on it.
    entry.done.promise.catch(() => {})
    this.settleBatch()
  }

  private next(): Entry<P, R> | undefined {
    for (const lane of LANES) {
      const list = this.lanes.get(lane)
      if (!list) continue
      for (let entry = list.take(); entry; entry = list.take()) {
        if (
          entry.state === "waiting" &&
          entry.priority === lane &&
          this.waiting.get(entry.key) === entry
        ) {
          return entry
        }
      }
    }
    return undefined
  }

  private pump(): void {
    while (
      !this.paused &&
      !this.stopped &&
      this.active.size < this.concurrency
    ) {
      const entry = this.next()
      if (!entry) break
      this.start(entry)
    }
    this.settleBatch()
  }

  private start(entry: Entry<P, R>): void {
    entry.state = "active"
    entry.startedAt = new Date()
    this.waiting.delete(entry.key)
    this.active.set(entry.key, entry)
    const { signal } = entry.controller
    // A job that throws before its first await still counts as a failure.
    void Promise.resolve()
      .then(() => this.definition.run(entry.payload, { signal }))
      .then(
        (result) => {
          this.completed++
          if (this.batch) this.batch.completed++
          entry.done.resolve(result)
        },
        (cause: unknown) => this.fail(entry, cause),
      )
      .finally(() => {
        entry.state = "settled"
        this.active.delete(entry.key)
        const next = this.after.get(entry.key)
        if (next) {
          this.after.delete(entry.key)
          this.enqueue(next)
        }
        this.pump()
      })
  }

  private fail(entry: Entry<P, R>, cause: unknown): void {
    entry.done.reject(cause)
    entry.done.promise.catch(() => {})
    if (entry.controller.signal.aborted) return
    this.failed++
    if (this.batch) this.batch.failed++
    const label = this.definition.label(entry.payload)
    this.failures.unshift({ label, message: messageOf(cause), at: new Date() })
    this.failures.splice(RECENT_FAILURES)
    if (this.definition.retryAfterMs) {
      this.failedKeys.set(entry.key, { at: Date.now(), cause })
    }
    const fatal = this.definition.fatal?.(cause, entry.payload)
    if (fatal) {
      let dropped = 0
      for (const waiting of [
        ...this.waiting.values(),
        ...this.after.values(),
      ]) {
        if (!fatal.drop(waiting.payload)) continue
        this.drop(waiting, cause)
        dropped++
      }
      log.warn(
        dropped > 0
          ? `${fatal.message} Dropped ${dropped} waiting ${dropped === 1 ? "job" : "jobs"}.`
          : fatal.message,
      )
      return
    }
    const failure = this.definition.failure
    if (failure) log.warn(failure(entry.payload), cause)
  }

  /** Log the batch once nothing waits or runs any more. */
  private settleBatch(): void {
    const batch = this.batch
    if (!batch || this.pending()) return
    this.batch = null
    const line = this.definition.summary?.({
      completed: batch.completed,
      failed: batch.failed,
      ms: Date.now() - batch.started,
    })
    if (line) log.info(line)
  }

  private pending(): boolean {
    return this.active.size + this.waiting.size + this.after.size > 0
  }
}

/** Create a queue and list it for the admin endpoints. */
export function defineQueue<P, R>(
  definition: QueueDefinition<P, R>,
): Queue<P, R> {
  const queue = new Queue(definition)
  registry.set(definition.id, queue)
  return queue
}

/** Stop every queue, for shutdown. */
export async function stopQueues(): Promise<void> {
  await Promise.all(allQueues().map((queue) => queue.stop()))
}
