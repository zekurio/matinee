import type {
  JobQueueStatus,
  JobsOverview,
  ScheduledTask,
} from "@matinee/contracts"
import { Badge } from "@matinee/ui/components/badge"
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
  CalendarClockIcon,
  EllipsisIcon,
  InfoIcon,
  ListXIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react"
import { useState } from "react"

import { formatCount, formatRelative, formatSpan } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { ConcurrencySection, tunableQueues } from "./jobs-concurrency"
import { QueueDetailsDialog } from "./queue-details-dialog"
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

function every(seconds: number): string {
  if (seconds === 86_400) return "Every day"
  if (seconds === 3600) return "Every hour"
  return `Every ${formatSpan(seconds)}`
}

/** When the task runs, in a sentence. */
function scheduleOf(task: ScheduledTask): string {
  const startup =
    task.startupDelaySeconds === null
      ? null
      : task.startupDelaySeconds === 0
        ? "at startup"
        : `${formatSpan(task.startupDelaySeconds)} after startup`
  if (task.intervalSeconds === null) {
    return startup ? `Runs ${startup}` : "Runs when you start it"
  }
  return startup
    ? `${every(task.intervalSeconds)} and ${startup}`
    : every(task.intervalSeconds)
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
      <SettingsSubsection
        id="queues"
        title="Queues"
        description="Pausing a queue lets its running jobs finish."
      >
        {jobs.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : jobs.isError ? (
          <LoadError error={jobs.error} retry={() => void jobs.refetch()} />
        ) : (
          <List>
            {jobs.data.queues.map((queue) => (
              <QueueRow key={queue.id} queue={queue} />
            ))}
          </List>
        )}
      </SettingsSubsection>

      <SettingsSubsection
        id="tasks"
        title="Scheduled tasks"
        description="Run on a schedule and queue the work they find."
      >
        {jobs.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : jobs.isError ? null : (
          <List>
            {jobs.data.tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </List>
        )}
      </SettingsSubsection>

      {jobs.data && <ConcurrencySection queues={tunableQueues(jobs.data)} />}
    </SettingsSections>
  )
}

function LoadError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <p className="text-muted-foreground text-sm">
        Couldn't load the jobs. {errorMessage(error)}
      </p>
      <Button variant="outline" onClick={retry}>
        <RefreshCwIcon />
        Try again
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
    parts.push(`${formatCount(queue.active)} of ${queue.concurrency} running`)
  }
  if (queue.waiting > 0) parts.push(`${formatCount(queue.waiting)} waiting`)
  if (parts.length === 0) parts.push("Idle")
  if (queue.completed > 0) parts.push(`${formatCount(queue.completed)} done`)
  return parts.join(" · ")
}

function failedText(queue: JobQueueStatus): string {
  return `${formatCount(queue.failed)} failed`
}

function QueueRow({ queue }: { queue: JobQueueStatus }) {
  const update = useJobsUpdate()
  const [details, setDetails] = useState(false)
  const onError = (what: string) => (cause: unknown) =>
    toast.error(`Couldn't ${what} ${queue.name}`, {
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

  return (
    <ListItem className="flex-wrap items-start gap-x-3 gap-y-2 py-3 pr-2">
      <div className="min-w-0 flex-1 basis-56">
        <h4 className="flex items-center gap-2 text-sm leading-5 font-medium">
          {queue.name}
          {queue.paused && <Badge variant="secondary">Paused</Badge>}
        </h4>
        <p className="text-muted-foreground text-[13px] leading-5">
          {queue.description}
        </p>
        <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-[13px] leading-5 tabular-nums">
          {queue.active > 0 && !queue.paused && (
            <Spinner className="size-3.5 shrink-0" />
          )}
          {/* One line, so the row keeps its height as counts change. The
              details dialog has the whole summary. */}
          <span className="min-w-0 truncate">
            {summary}
            {queue.failed > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  className="text-destructive focus-visible:ring-ring cursor-pointer rounded-sm underline-offset-3 outline-none hover:underline focus-visible:ring-2"
                  onClick={() => setDetails(true)}
                >
                  {failedText(queue)}
                </button>
              </>
            )}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground data-popup-open:text-foreground"
                aria-label={`${queue.name} actions`}
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="min-w-48">
            <DropdownMenuItem onClick={() => setDetails(true)}>
              <InfoIcon />
              Details
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pause.isPending}
              onClick={() => pause.mutate()}
            >
              {queue.paused ? <PlayIcon /> : <PauseIcon />}
              {queue.paused ? "Resume" : "Pause"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={queue.waiting === 0 || clear.isPending}
              onClick={() => clear.mutate()}
            >
              <ListXIcon />
              Clear waiting jobs
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <QueueDetailsDialog
        queue={queue}
        summary={
          queue.failed > 0 ? `${summary} · ${failedText(queue)}` : summary
        }
        open={details}
        onOpenChange={setDetails}
      />
    </ListItem>
  )
}

function lastRunText(task: ScheduledTask): string {
  const last = task.lastRun
  if (!last) return "Hasn't run yet"
  const took = formatSpan(
    (last.endedAt.getTime() - last.startedAt.getTime()) / 1000,
  )
  const when = formatRelative(last.endedAt)
  switch (last.result) {
    case "completed":
      return `Last ran ${when}, took ${took}`
    case "cancelled":
      return `Cancelled ${when}, after ${took}`
    case "failed":
      return `Failed ${when}${last.error ? `: ${last.error}` : ""}`
  }
}

function TaskRow({ task }: { task: ScheduledTask }) {
  const update = useJobsUpdate()
  const running = task.startedAt !== null
  const action = useMutation({
    mutationFn: () =>
      running
        ? client.admin.jobs.cancelTask({ task: task.id })
        : client.admin.jobs.runTask({ task: task.id }),
    onSuccess: () => update.refetch(),
    onError: (error) =>
      toast.error(
        running
          ? `Couldn't cancel ${task.name}`
          : `Couldn't start ${task.name}`,
        { description: errorMessage(error) },
      ),
  })
  const percent =
    task.progress === null ? null : Math.round(task.progress * 100)
  const last = lastRunText(task)
  const schedule = `${scheduleOf(task)}${
    task.nextRunAt && !running ? `, next ${formatRelative(task.nextRunAt)}` : ""
  }`

  // Every line below the description is one line long in every state, and
  // the button keeps its width, so starting or cancelling doesn't move rows.
  return (
    <ListItem className="flex-wrap items-start gap-x-3 gap-y-2 py-3 pr-2">
      <div className="min-w-0 flex-1 basis-56">
        <h4 className="text-sm leading-5 font-medium">{task.name}</h4>
        <p className="text-muted-foreground text-[13px] leading-5">
          {task.description}
        </p>
        {running ? (
          <div className="text-muted-foreground mt-1 flex h-5 items-center gap-1.5 text-[13px] leading-5 tabular-nums">
            <Spinner className="size-3.5 shrink-0" />
            <span className="shrink-0">
              Running{percent === null ? "…" : `, ${percent}%`}
            </span>
            {percent !== null && (
              <div
                role="progressbar"
                aria-label={`${task.name} progress`}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="bg-secondary ml-1 h-1 w-full max-w-40 min-w-8 overflow-hidden rounded-full"
              >
                <div
                  className="bg-primary h-full rounded-full transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <p
            title={last}
            className={cn(
              "mt-1 truncate text-[13px] leading-5",
              task.lastRun?.result === "failed"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {last}
          </p>
        )}
        <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[13px] leading-5">
          <CalendarClockIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate" title={schedule}>
            {schedule}
          </span>
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="min-w-24 shrink-0"
        disabled={action.isPending}
        onClick={() => action.mutate()}
      >
        {running ? <SquareIcon /> : <PlayIcon />}
        {running ? "Cancel" : "Run now"}
      </Button>
    </ListItem>
  )
}
