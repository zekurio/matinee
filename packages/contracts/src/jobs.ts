import { t } from "./schema"

/*
 * Background work, as admins see it under Settings → Jobs: queues that
 * run a few jobs at a time each, as in Immich, and scheduled tasks that
 * fill them, as in Jellyfin. Clients show a task with the queue it
 * fills, and the tasks that fill none on their own.
 */

export const JOB_QUEUE_IDS = [
  "library-scan",
  "media-probe",
  "metadata",
  "thumbnails",
  "subtitle-prepare",
  "trickplay",
  "artwork",
  "subtitles",
  "subtitle-fonts",
  "avatars",
  "downloads",
  "download-copies",
] as const
export const JobQueueId = t.enum(JOB_QUEUE_IDS)
export type JobQueueId = t.infer<typeof JobQueueId>

export const JobFailure = t.object({
  /** What the job worked on, like a file's path. */
  label: t.string(),
  message: t.string(),
  at: t.date(),
})
export type JobFailure = t.infer<typeof JobFailure>

export const RunningJob = t.object({
  /** What the job works on, like a file's path. */
  label: t.string(),
  startedAt: t.date(),
})
export type RunningJob = t.infer<typeof RunningJob>

export const JobQueueStatus = t.object({
  id: JobQueueId,
  name: t.string(),
  description: t.string(),
  /** Jobs that run at once. */
  concurrency: t.number().int().min(1),
  defaultConcurrency: t.number().int().min(1),
  /** The most an admin may set. The default when it can't be changed. */
  maxConcurrency: t.number().int().min(1),
  /**
   * What the setting counts and when to raise it. Null when the queue's
   * concurrency can't be changed.
   */
  concurrencyNote: t.string().nullable(),
  active: t.number().int().min(0),
  waiting: t.number().int().min(0),
  /** Since the server started. */
  completed: t.number().int().min(0),
  failed: t.number().int().min(0),
  /** Running jobs finish, waiting ones wait. */
  paused: t.boolean(),
  /** The jobs running now, oldest first. */
  running: t.array(RunningJob),
  /** The latest failures, newest first, at most five. */
  failures: t.array(JobFailure),
  /**
   * How long a failed job keeps failing without running again. 0 when
   * the next request for it runs it again, null when only a restart does.
   */
  retryAfterSeconds: t.number().min(0).nullable(),
})
export type JobQueueStatus = t.infer<typeof JobQueueStatus>

export const TASK_IDS = [
  "scan-libraries",
  "refresh-metadata",
  "probe-media",
  "prefetch-artwork",
  "prepare-subtitles",
  "make-trickplay",
  "clean-transcodes",
  "clean-sessions",
  "sync-oidc-accounts",
] as const
export const TaskId = t.enum(TASK_IDS)
export type TaskId = t.infer<typeof TaskId>

export const TASK_RESULTS = ["completed", "failed", "cancelled"] as const
export const TaskResult = t.enum(TASK_RESULTS)
export type TaskResult = t.infer<typeof TaskResult>

export const TaskRun = t.object({
  startedAt: t.date(),
  endedAt: t.date(),
  result: TaskResult,
  /** Why it failed. */
  error: t.string().nullable(),
})
export type TaskRun = t.infer<typeof TaskRun>

export const ScheduledTask = t.object({
  id: TaskId,
  name: t.string(),
  description: t.string(),
  /** The queue its runs fill. Null for upkeep the task does itself. */
  queue: JobQueueId.nullable(),
  /** Runs this long after the server starts. Null when it doesn't. */
  startupDelaySeconds: t.number().min(0).nullable(),
  /** Runs again this long after a run ends. Null when only by hand. */
  intervalSeconds: t.number().min(0).nullable(),
  /** When the run going on now started. Null when it isn't running. */
  startedAt: t.date().nullable(),
  /** How far the run going on now is, 0 to 1, when the task can tell. */
  progress: t.number().min(0).max(1).nullable(),
  lastRun: TaskRun.nullable(),
  nextRunAt: t.date().nullable(),
})
export type ScheduledTask = t.infer<typeof ScheduledTask>

export const JobsOverview = t.object({
  queues: t.array(JobQueueStatus),
  tasks: t.array(ScheduledTask),
})
export type JobsOverview = t.infer<typeof JobsOverview>

export const QueueInput = t.object({ queue: JobQueueId })
/** Jobs at once per queue. Queues left out keep theirs. */
export const ConcurrencyInput = t.object({
  concurrency: t.partialRecord(JobQueueId, t.number().int().min(1).max(64)),
})
export type ConcurrencyInput = t.infer<typeof ConcurrencyInput>
export const TaskInput = t.object({ task: TaskId })
