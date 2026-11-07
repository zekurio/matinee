import type { ScheduledTask, TaskId, TaskResult } from "@matinee/contracts"
import { scheduledTask } from "@matinee/db"

import { db } from "../db"
import { log } from "../log"

/*
 * Scheduled tasks, the way Jellyfin's task manager runs them: each task
 * runs at startup, every so often, or when an admin starts it, never two
 * runs at once. Most of them only find work and hand it to the job
 * queues, then wait for those jobs. The last run is stored, so an
 * interval counts across restarts.
 */

// A task due while the server was down waits this long after a start.
const OVERDUE_DELAY_MS = 60_000
// Node's timers can't wait longer than about 24.8 days.
const MAX_TIMER_MS = 2 ** 31 - 1

export type TaskContext = {
  /** Aborts when an admin cancels the run or the server shuts down. */
  signal: AbortSignal
  /** How far the run is, from 0 to 1. */
  progress: (fraction: number) => void
}

export type TaskDefinition = {
  id: TaskId
  name: string
  description: string
  /** Run this long after the server starts. Null for not at startup. */
  startupDelayMs: number | null
  /** Run again this long after a run ends. Null for only by hand. */
  intervalMs: number | null
  run: (context: TaskContext) => Promise<void>
}

type LastRun = {
  startedAt: Date
  endedAt: Date
  result: TaskResult
  error: string | null
}

type Task = {
  definition: TaskDefinition
  last: LastRun | null
  running: {
    controller: AbortController
    startedAt: Date
    progress: number | null
    done: Promise<void>
  } | null
  nextRunAt: Date | null
  timer: NodeJS.Timeout | null
}

const tasks = new Map<TaskId, Task>()
let started = false
let stopped = false

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function arm(task: Task): void {
  if (task.timer) clearTimeout(task.timer)
  task.timer = null
  if (stopped || !task.nextRunAt) return
  const wait = Math.max(0, task.nextRunAt.getTime() - Date.now())
  task.timer = setTimeout(
    () => {
      task.timer = null
      // A long wait comes in pieces.
      if (task.nextRunAt && task.nextRunAt.getTime() > Date.now()) arm(task)
      else void runTask(task.definition.id)
    },
    Math.min(wait, MAX_TIMER_MS),
  )
  task.timer.unref()
}

/** Store the run, so the next start knows when the task is due. */
async function record(id: TaskId, run: LastRun): Promise<void> {
  await db
    .insert(scheduledTask)
    .values({ id, ...run })
    .onConflictDoUpdate({ target: scheduledTask.id, set: run })
}

/**
 * Start the task now, unless it's running already. Resolves when the run
 * that was going on, or the new one, ends. Never rejects.
 */
export function runTask(id: TaskId): Promise<void> {
  const task = tasks.get(id)
  if (!task || stopped) return Promise.resolve()
  if (task.running) return task.running.done
  if (task.timer) clearTimeout(task.timer)
  task.timer = null
  task.nextRunAt = null

  const controller = new AbortController()
  const startedAt = new Date()
  const run: NonNullable<Task["running"]> = {
    controller,
    startedAt,
    progress: null,
    done: Promise.resolve(),
  }
  const progress = (fraction: number) => {
    run.progress = Math.max(0, Math.min(1, fraction))
  }
  run.done = (async () => {
    let result: TaskResult = "completed"
    let error: string | null = null
    try {
      await task.definition.run({ signal: controller.signal, progress })
      if (controller.signal.aborted) result = "cancelled"
    } catch (cause) {
      if (controller.signal.aborted) result = "cancelled"
      else {
        result = "failed"
        error = messageOf(cause)
        log.error(`Task ${task.definition.name} failed`, cause)
      }
    }
    const last = { startedAt, endedAt: new Date(), result, error }
    task.last = last
    task.running = null
    const { intervalMs } = task.definition
    task.nextRunAt = intervalMs
      ? new Date(last.endedAt.getTime() + intervalMs)
      : null
    arm(task)
    await record(id, last).catch((cause: unknown) =>
      log.warn(`Couldn't store the run of task ${task.definition.name}`, cause),
    )
  })()
  task.running = run
  return run.done
}

/** Stop the task's run. Its jobs that haven't finished stop with it. */
export function cancelTask(id: TaskId): void {
  tasks.get(id)?.running?.controller.abort()
}

/** Register the tasks and schedule them from their last runs. */
export async function startTasks(definitions: TaskDefinition[]): Promise<void> {
  if (started) return
  started = true
  const rows = await db.select().from(scheduledTask)
  const now = Date.now()
  for (const definition of definitions) {
    const row = rows.find((candidate) => candidate.id === definition.id)
    const last: LastRun | null = row
      ? {
          startedAt: row.startedAt,
          endedAt: row.endedAt,
          result: row.result,
          error: row.error,
        }
      : null
    const due: number[] = []
    if (definition.startupDelayMs !== null) {
      due.push(now + definition.startupDelayMs)
    }
    if (definition.intervalMs !== null) {
      const next = last ? last.endedAt.getTime() + definition.intervalMs : now
      due.push(Math.max(next, now + OVERDUE_DELAY_MS))
    }
    const task: Task = {
      definition,
      last,
      running: null,
      nextRunAt: due.length > 0 ? new Date(Math.min(...due)) : null,
      timer: null,
    }
    tasks.set(definition.id, task)
    arm(task)
  }
}

/** Stop the timers and the runs, and wait for the runs to end. */
export async function stopTasks(): Promise<void> {
  stopped = true
  const runs: Promise<void>[] = []
  for (const task of tasks.values()) {
    if (task.timer) clearTimeout(task.timer)
    task.timer = null
    if (task.running) {
      task.running.controller.abort()
      runs.push(task.running.done)
    }
  }
  await Promise.all(runs)
}

function toStatus(task: Task): ScheduledTask {
  const { definition, running } = task
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    startupDelaySeconds:
      definition.startupDelayMs === null
        ? null
        : definition.startupDelayMs / 1000,
    intervalSeconds:
      definition.intervalMs === null ? null : definition.intervalMs / 1000,
    startedAt: running?.startedAt ?? null,
    progress: running?.progress ?? null,
    lastRun: task.last,
    nextRunAt: task.nextRunAt,
  }
}

export function taskStatus(id: TaskId): ScheduledTask | null {
  const task = tasks.get(id)
  return task ? toStatus(task) : null
}

/** Every task, in the order they were registered. */
export function allTasks(): ScheduledTask[] {
  return [...tasks.values()].map(toStatus)
}
