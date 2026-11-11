import type {
  JobQueueStatus,
  JobsOverview,
  ScheduledTask,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  EllipsisIcon,
  InfoIcon,
  ListXIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react"
import { type ReactNode, useState } from "react"

import { type MessageKey, tr, translateKnown } from "@/i18n"
import { formatRelative, formatSpan } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { ConcurrencySection, tunableQueues } from "./jobs-concurrency"
import {
  QueueDetailsDialog,
  queueDescription,
  queueName,
} from "./queue-details-dialog"
import { SettingsSections, SettingsSubsection } from "./settings-panel"

// Live while something runs, slow otherwise.
const BUSY_REFRESH_MS = 2000
const IDLE_REFRESH_MS = 10_000

function isBusy(overview: JobsOverview | undefined): boolean {
  if (!overview) return false
  return (
    overview.queues.some((queue) => queue.active + queue.waiting > 0) ||
    overview.tasks.some((task) => task.startedAt !== null)
  )
}

/** A task's name in the interface's language. */
function taskName(task: ScheduledTask): string {
  return tr(`jobs.task.${task.id}.name`)
}

/**
 * A task's description in the interface's language. Cleaning up encodes
 * names the server's cache limits, which only the server's own text has.
 */
function taskDescription(task: ScheduledTask): string {
  const id = task.id
  if (id === "clean-transcodes") return translateKnown(task.description)
  return tr(`jobs.task.${id}.description`)
}

/** Messages for a schedule, by its interval and how it starts. */
type ScheduleKeys = {
  plain: MessageKey
  atStartup: MessageKey
  afterStartup: MessageKey
}

const DAILY = {
  plain: "jobs.schedule.daily",
  atStartup: "jobs.schedule.daily.atStartup",
  afterStartup: "jobs.schedule.daily.afterStartup",
} satisfies ScheduleKeys
const HOURLY = {
  plain: "jobs.schedule.hourly",
  atStartup: "jobs.schedule.hourly.atStartup",
  afterStartup: "jobs.schedule.hourly.afterStartup",
} satisfies ScheduleKeys

/** When the task runs, in a sentence. */
function scheduleOf(task: ScheduledTask): string {
  const delay = task.startupDelaySeconds
  const interval = task.intervalSeconds
  if (interval === null) {
    if (delay === null) return tr("jobs.schedule.manual")
    if (delay === 0) return tr("jobs.schedule.atStartup")
    return tr("jobs.schedule.afterStartup", { delay: formatSpan(delay) })
  }
  const fixed = interval === 86_400 ? DAILY : interval === 3600 ? HOURLY : null
  if (fixed) {
    if (delay === null) return tr(fixed.plain)
    if (delay === 0) return tr(fixed.atStartup)
    return tr(fixed.afterStartup, { delay: formatSpan(delay) })
  }
  const every = formatSpan(interval)
  if (delay === null) return tr("jobs.schedule.every", { interval: every })
  if (delay === 0) {
    return tr("jobs.schedule.every.atStartup", { interval: every })
  }
  return tr("jobs.schedule.every.afterStartup", {
    interval: every,
    delay: formatSpan(delay),
  })
}

export function JobsPanel() {
  const jobs = useQuery(
    orpc.admin.jobs.get.queryOptions({
      refetchInterval: (query) =>
        isBusy(query.state.data) ? BUSY_REFRESH_MS : IDLE_REFRESH_MS,
    }),
  )

  return (
    <SettingsSections>
      <SettingsSubsection id="jobs" title={tr("jobs.queues")}>
        {jobs.isPending ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : jobs.isError ? (
          <LoadError error={jobs.error} retry={() => void jobs.refetch()} />
        ) : (
          <JobsList overview={jobs.data} />
        )}
      </SettingsSubsection>

      {jobs.data && <ConcurrencySection queues={tunableQueues(jobs.data)} />}
    </SettingsSections>
  )
}

/**
 * Every queue, each with the task that fills it on a schedule, then the
 * tasks that fill none and do their upkeep themselves.
 */
function JobsList({ overview }: { overview: JobsOverview }) {
  const upkeep = overview.tasks.filter((task) => task.queue === null)
  return (
    <List>
      {overview.queues.map((queue) => (
        <QueueRow
          key={queue.id}
          queue={queue}
          task={overview.tasks.find((task) => task.queue === queue.id) ?? null}
        />
      ))}
      {upkeep.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </List>
  )
}

function LoadError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <p className="text-muted-foreground text-sm">
        {tr("jobs.loadFailed", { error: errorMessage(error) })}
      </p>
      <Button variant="outline" onClick={retry}>
        <RefreshCwIcon />
        {tr("jobs.retry")}
      </Button>
    </div>
  )
}

/** Update the cached overview with a queue's or task's new state. */
function useJobsUpdate() {
  const queryClient = useQueryClient()
  const key = orpc.admin.jobs.get.queryKey()
  return {
    queue: (next: JobQueueStatus) =>
      queryClient.setQueryData<JobsOverview>(key, (old) =>
        old
          ? {
              ...old,
              queues: old.queues.map((queue) =>
                queue.id === next.id ? next : queue,
              ),
            }
          : old,
      ),
    refetch: () => queryClient.invalidateQueries({ queryKey: key }),
  }
}

/** Counts so far, without the failures, which the row links to. */
function queueSummary(queue: JobQueueStatus): string {
  const parts: string[] = []
  if (queue.active > 0) {
    parts.push(
      tr("jobs.queue.running", {
        active: queue.active,
        concurrency: queue.concurrency,
      }),
    )
  }
  if (queue.waiting > 0) {
    parts.push(tr("jobs.queue.waiting", { count: queue.waiting }))
  }
  if (parts.length === 0) parts.push(tr("jobs.queue.idle"))
  if (queue.completed > 0) {
    parts.push(tr("jobs.queue.done", { count: queue.completed }))
  }
  return parts.join(" · ")
}

function failedText(queue: JobQueueStatus): string {
  return tr("jobs.queue.failed", { count: queue.failed })
}

/**
 * A row's name and what it does, with its controls beside them, and what
 * it's doing below in labelled facts, so the description reads apart from
 * the state.
 */
function JobRow({
  name,
  description,
  controls,
  children,
}: {
  name: string
  description: string
  controls: ReactNode
  children: ReactNode
}) {
  return (
    <ListItem className="@container flex-col items-stretch gap-3 py-3.5 pr-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm leading-5 font-medium">{name}</h4>
          <p className="text-muted-foreground text-[13px] leading-5">
            {description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">{controls}</div>
      </div>
      <dl className="bg-foreground/[0.03] mr-2 grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg px-3 py-2.5 @lg:grid-cols-3">
        {children}
      </dl>
    </ListItem>
  )
}

/** A label over its value, with a line of detail under it if there is one. */
function Fact({
  label,
  children,
  detail,
  title,
  tone = "default",
}: {
  label: string
  children: ReactNode
  detail?: ReactNode
  /** The whole detail, for when it's cut short. */
  title?: string
  tone?: "default" | "muted" | "destructive"
}) {
  return (
    <div className="min-w-0">
      <dt className="text-foreground-faint text-xs leading-4">{label}</dt>
      <dd
        className={cn(
          "mt-1 flex h-5 min-w-0 items-center gap-1.5 text-[13px] leading-5 tabular-nums",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {children}
      </dd>
      {detail && (
        <dd
          title={title}
          className={cn(
            "truncate text-xs leading-4 tabular-nums",
            tone === "destructive"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {detail}
        </dd>
      )}
    </div>
  )
}

/** Running spins; otherwise a dot, amber when paused. */
function StatusMark({ state }: { state: "running" | "paused" | "idle" }) {
  if (state === "running") return <Spinner className="size-3.5 shrink-0" />
  return (
    <span
      aria-hidden
      className={cn(
        "mx-1 size-1.5 shrink-0 rounded-full",
        state === "paused" ? "bg-warning" : "bg-foreground-faint",
      )}
    />
  )
}

function QueueRow({
  queue,
  task,
}: {
  queue: JobQueueStatus
  /** The scheduled task that fills it, if one does. */
  task: ScheduledTask | null
}) {
  const update = useJobsUpdate()
  const [details, setDetails] = useState(false)
  const name = queueName(queue)
  const onError = (what: "pause" | "resume" | "clear") => (cause: unknown) =>
    toast.error(tr(`jobs.queue.${what}Failed`, { queue: name }), {
      description: errorMessage(cause),
    })
  const pause = useMutation({
    mutationFn: () =>
      queue.paused
        ? client.admin.jobs.resume({ queue: queue.id })
        : client.admin.jobs.pause({ queue: queue.id }),
    onSuccess: update.queue,
    onError: onError(queue.paused ? "resume" : "pause"),
  })
  const clear = useMutation({
    mutationFn: () => client.admin.jobs.clear({ queue: queue.id }),
    onSuccess: update.queue,
    onError: onError("clear"),
  })
  const summary = queueSummary(queue)

  const running = tr("jobs.queue.running", {
    active: queue.active,
    concurrency: queue.concurrency,
  })
  const state = queue.paused ? "paused" : queue.active > 0 ? "running" : "idle"
  // A paused queue still finishes what it started, so say so under it.
  const counts: string[] = []
  if (queue.paused && queue.active > 0) counts.push(running)
  if (queue.waiting > 0) {
    counts.push(tr("jobs.queue.waiting", { count: queue.waiting }))
  }
  if (queue.completed > 0) {
    counts.push(tr("jobs.queue.done", { count: queue.completed }))
  }
  const hasCounts = counts.length > 0 || queue.failed > 0

  return (
    <JobRow
      name={name}
      description={queueDescription(queue)}
      controls={
        <>
          {task && <TaskButton task={task} />}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground data-popup-open:text-foreground"
                  aria-label={tr("jobs.queue.actions", { queue: name })}
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="min-w-48"
            >
              <DropdownMenuItem onClick={() => setDetails(true)}>
                <InfoIcon />
                {tr("jobs.queue.details")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pause.isPending}
                onClick={() => pause.mutate()}
              >
                {queue.paused ? <PlayIcon /> : <PauseIcon />}
                {queue.paused
                  ? tr("jobs.queue.resume")
                  : tr("jobs.queue.pause")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={queue.waiting === 0 || clear.isPending}
                onClick={() => clear.mutate()}
              >
                <ListXIcon />
                {tr("jobs.queue.clear")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <QueueDetailsDialog
            queue={queue}
            summary={
              queue.failed > 0 ? `${summary} · ${failedText(queue)}` : summary
            }
            open={details}
            onOpenChange={setDetails}
          />
        </>
      }
    >
      <Fact
        label={tr("jobs.fact.status")}
        detail={
          hasCounts && (
            <>
              {counts.join(" · ")}
              {queue.failed > 0 && (
                <>
                  {counts.length > 0 && " · "}
                  <button
                    type="button"
                    className="text-destructive focus-visible:ring-ring cursor-pointer rounded-sm underline-offset-3 outline-none hover:underline focus-visible:ring-2"
                    onClick={() => setDetails(true)}
                  >
                    {failedText(queue)}
                  </button>
                </>
              )}
            </>
          )
        }
      >
        <StatusMark state={state} />
        <span className="truncate">
          {state === "paused"
            ? tr("jobs.queue.paused")
            : state === "running"
              ? running
              : tr("jobs.queue.idle")}
        </span>
      </Fact>
      {task && <TaskFacts task={task} />}
    </JobRow>
  )
}

/** The detail under a finished run: how long it took, or why it stopped. */
function lastRunDetail(
  last: NonNullable<ScheduledTask["lastRun"]>,
): string | undefined {
  const took = formatSpan(
    (last.endedAt.getTime() - last.startedAt.getTime()) / 1000,
  )
  switch (last.result) {
    case "completed":
      return tr("jobs.task.took", { took })
    case "cancelled":
      return tr("jobs.task.cancelledAfter", { took })
    case "failed":
      return last.error
        ? tr("jobs.task.failedWith", { error: translateKnown(last.error) })
        : tr("jobs.task.failed")
  }
}

/** Starts the task, or cancels the run going on. */
function useTaskAction(task: ScheduledTask) {
  const update = useJobsUpdate()
  const running = task.startedAt !== null
  const name = taskName(task)
  const action = useMutation({
    mutationFn: () =>
      running
        ? client.admin.jobs.cancelTask({ task: task.id })
        : client.admin.jobs.runTask({ task: task.id }),
    onSuccess: () => update.refetch(),
    onError: (error) =>
      toast.error(
        running
          ? tr("jobs.task.cancelFailed", { task: name })
          : tr("jobs.task.startFailed", { task: name }),
        { description: errorMessage(error) },
      ),
  })
  return { running, action }
}

/** Run now, or cancel; the same width either way, so rows don't move. */
function TaskButton({ task }: { task: ScheduledTask }) {
  const { running, action } = useTaskAction(task)
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-w-24 shrink-0"
      disabled={action.isPending}
      onClick={() => action.mutate()}
    >
      {running ? <SquareIcon /> : <PlayIcon />}
      {running ? tr("jobs.task.cancel") : tr("jobs.task.run")}
    </Button>
  )
}

/**
 * The run going on, with its progress, or how the last one went; then when
 * the next one starts and the schedule behind it.
 */
function TaskFacts({ task }: { task: ScheduledTask }) {
  const name = taskName(task)
  const schedule = scheduleOf(task)
  const last = task.lastRun
  const lastDetail = last ? lastRunDetail(last) : undefined
  const percent =
    task.progress === null ? null : Math.round(task.progress * 100)

  return (
    <>
      {task.startedAt !== null ? (
        <Fact
          label={tr("jobs.fact.currentRun")}
          detail={
            percent !== null && (
              <span className="flex items-center gap-2">
                <span
                  role="progressbar"
                  aria-label={tr("jobs.task.progress", { task: name })}
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="bg-secondary h-1 w-full max-w-32 overflow-hidden rounded-full"
                >
                  <span
                    className="bg-primary block h-full rounded-full transition-[width]"
                    style={{ width: `${percent}%` }}
                  />
                </span>
                {tr("jobs.task.percent", { percent })}
              </span>
            )
          }
        >
          <span className="truncate">
            {tr("jobs.task.started", { when: formatRelative(task.startedAt) })}
          </span>
        </Fact>
      ) : (
        <Fact
          label={tr("jobs.fact.lastRun")}
          tone={
            !last
              ? "muted"
              : last.result === "failed"
                ? "destructive"
                : "default"
          }
          detail={lastDetail}
          title={lastDetail}
        >
          <span className="truncate">
            {last ? formatRelative(last.endedAt) : tr("jobs.task.neverRan")}
          </span>
        </Fact>
      )}
      <Fact
        label={tr("jobs.fact.nextRun")}
        tone={task.nextRunAt || task.startedAt ? "default" : "muted"}
        detail={schedule}
        title={schedule}
      >
        <span className="truncate">
          {task.startedAt !== null
            ? tr("jobs.schedule.afterThisRun")
            : task.nextRunAt
              ? formatRelative(task.nextRunAt)
              : tr("jobs.schedule.notScheduled")}
        </span>
      </Fact>
    </>
  )
}

/** A task that fills no queue: its name, what it does, and its runs. */
function TaskRow({ task }: { task: ScheduledTask }) {
  const running = task.startedAt !== null
  return (
    <JobRow
      name={taskName(task)}
      description={taskDescription(task)}
      controls={<TaskButton task={task} />}
    >
      <Fact label={tr("jobs.fact.status")}>
        <StatusMark state={running ? "running" : "idle"} />
        <span className="truncate">
          {running ? tr("jobs.task.running") : tr("jobs.queue.idle")}
        </span>
      </Fact>
      <TaskFacts task={task} />
    </JobRow>
  )
}
