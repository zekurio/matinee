import type {
  JobQueueStatus,
  JobsOverview,
  ScheduledTask,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  QueryObserver,
  type QueryObserverResult,
  useMutation,
  useQueryClient,
} from "@tanstack/solid-query"
import { Ellipsis, Info, ListX, Pause, Play, RefreshCw, Square } from "lucide"
import {
  createMemo,
  createSignal,
  For,
  from,
  Match,
  Show,
  Switch,
} from "solid-js"

import { knownMessage, type MessageKey, tr, translateKnown } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { List, ListItem } from "@/kit/list"
import { Skeleton } from "@/kit/skeleton"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import {
  formatRelative,
  formatSpan,
  formatUpcoming,
  type SpanUnit,
  spanParts,
} from "@/lib/format"
import { client, errorMessage, liveQuery, orpc } from "@/lib/rpc"

import { ConcurrencySection, tunableQueues } from "./jobs-concurrency"
import {
  QueueDetailsDialog,
  queueDescription,
  queueName,
} from "./queue-details-dialog"
import { SettingsSections, SettingsSubsection } from "./settings-panel"

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

/** "Every 5 minutes", by the interval's unit, so one reads "Every minute". */
const EVERY = {
  seconds: "jobs.schedule.everySeconds",
  minutes: "jobs.schedule.everyMinutes",
  hours: "jobs.schedule.everyHours",
  days: "jobs.schedule.everyDays",
} as const satisfies Record<SpanUnit, MessageKey>

/** When the task runs, in a sentence. */
function scheduleOf(task: ScheduledTask): string {
  const delay = task.startupDelaySeconds
  const interval = task.intervalSeconds
  if (interval === null) {
    if (delay === null) return tr("jobs.schedule.manual")
    if (delay === 0) return tr("jobs.schedule.atStartup")
    return tr("jobs.schedule.afterStartup", { delay: formatSpan(delay) })
  }
  const { unit, count } = spanParts(interval)
  const every = tr(EVERY[unit], { count })
  if (delay === null) return every
  if (delay === 0) return tr("jobs.schedule.every.atStartup", { every })
  return tr("jobs.schedule.every.afterStartup", {
    every,
    delay: formatSpan(delay),
  })
}

const rowMenuButton = cn(
  buttonVariants({ variant: "ghost", size: "icon" }),
  "text-muted-foreground hover:text-foreground data-open:text-foreground",
)

/**
 * The queues and tasks as the server streams them: how they stand, and
 * again on each change, so a reconnect loses nothing.
 */
export function JobsPanel() {
  const jobs = useJobsStream()
  const overview = () => jobs()?.data

  return (
    <SettingsSections>
      <SettingsSubsection id="jobs" title={tr("jobs.queues")}>
        <Switch>
          <Match when={jobs()?.isError}>
            <LoadError
              error={jobs()?.error ?? null}
              retry={() => void jobs()?.refetch()}
            />
          </Match>
          <Match when={overview()}>
            {(current) => <JobsList overview={current()} />}
          </Match>
          <Match when={true}>
            <Skeleton class="h-96 rounded-xl" />
          </Match>
        </Switch>
      </SettingsSubsection>

      <Show when={overview()}>
        {(current) => <ConcurrencySection queues={tunableQueues(current())} />}
      </Show>
    </SettingsSections>
  )
}

/**
 * The stream, read from an observer of its own. Solid Query holds a
 * query's new data until its fetch settles, and a stream's fetch lasts
 * until the stream ends, so `useQuery` would show its first answer alone.
 */
function useJobsStream() {
  const queryClient = useQueryClient()
  return createMemo(() =>
    from<QueryObserverResult<JobsOverview>>((next) => {
      const observer = new QueryObserver(queryClient, {
        ...orpc.admin.jobs.live.experimental_liveOptions(),
        ...liveQuery,
      })
      const unsubscribe = observer.subscribe(next)
      next(observer.getCurrentResult())
      return unsubscribe
    }),
  )
}

/**
 * Every queue, each with the task that fills it on a schedule, then the
 * tasks that fill none and do their upkeep themselves.
 */
function JobsList(props: { overview: JobsOverview }) {
  const upkeep = () =>
    props.overview.tasks.filter((task) => task.queue === null)
  // Keyed by id: the stream sends every row anew, and a row keeps its menu
  // and dialog open through that.
  return (
    <List>
      <For each={props.overview.queues} keyed={(queue) => queue.id}>
        {(queue) => (
          <QueueRow
            queue={queue()}
            task={
              props.overview.tasks.find((task) => task.queue === queue().id) ??
              null
            }
          />
        )}
      </For>
      <For each={upkeep()} keyed={(task) => task.id}>
        {(task) => <TaskRow task={task()} />}
      </For>
    </List>
  )
}

function LoadError(props: { error: Error | null; retry: () => void }) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <p class="text-muted-foreground text-sm">
        {tr("jobs.loadFailed", { error: errorMessage(props.error) })}
      </p>
      <Button variant="outline" onClick={() => props.retry()}>
        <Icon icon={RefreshCw} />
        {tr("jobs.retry")}
      </Button>
    </div>
  )
}

/**
 * Show a queue's or task's new state as its action answered it, ahead of
 * the stream, which sends the same a moment later.
 */
function useJobsUpdate() {
  const queryClient = useQueryClient()
  const key = orpc.admin.jobs.live.experimental_liveKey()
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
    task: (next: ScheduledTask) =>
      queryClient.setQueryData<JobsOverview>(key, (old) =>
        old
          ? {
              ...old,
              tasks: old.tasks.map((task) =>
                task.id === next.id ? next : task,
              ),
            }
          : old,
      ),
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
function JobRow(props: {
  name: string
  description: string
  controls: JSX.Element
  children: JSX.Element
}) {
  return (
    <ListItem class="@container flex-col items-stretch gap-3 py-3.5 pr-2">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h4 class="text-sm leading-5 font-medium">{props.name}</h4>
          <p class="text-muted-foreground text-13px leading-5">
            {props.description}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-1">{props.controls}</div>
      </div>
      <dl class="bg-foreground/[0.03] mr-2 grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg px-3 py-2.5 @lg:grid-cols-3">
        {props.children}
      </dl>
    </ListItem>
  )
}

/** A label over its value, with a line of detail under it if there is one. */
function Fact(props: {
  label: string
  children: JSX.Element
  detail?: JSX.Element
  /** The whole detail, for when it's cut short. */
  title?: string
  tone?: "default" | "muted" | "destructive"
}) {
  return (
    <div class="min-w-0">
      <dt class="text-foreground-faint text-xs leading-4">{props.label}</dt>
      <dd
        class={cn(
          "mt-1 flex h-5 min-w-0 items-center gap-1.5 text-13px leading-5 tabular-nums",
          props.tone === "muted" && "text-muted-foreground",
        )}
      >
        {props.children}
      </dd>
      <Show when={props.detail}>
        <dd
          title={props.title}
          class={cn(
            "truncate text-xs leading-4 tabular-nums",
            props.tone === "destructive"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {props.detail}
        </dd>
      </Show>
    </div>
  )
}

/** Running spins; otherwise a dot, amber when paused. */
function StatusMark(props: { state: "running" | "paused" | "idle" }) {
  return (
    <Show
      when={props.state !== "running"}
      fallback={<Spinner class="size-3.5 shrink-0" />}
    >
      <span
        aria-hidden="true"
        class={cn(
          "mx-1 size-1.5 shrink-0 rounded-full",
          props.state === "paused" ? "bg-warning" : "bg-foreground-faint",
        )}
      />
    </Show>
  )
}

function QueueRow(props: {
  queue: JobQueueStatus
  /** The scheduled task that fills it, if one does. */
  task: ScheduledTask | null
}) {
  const update = useJobsUpdate()
  const [details, setDetails] = createSignal(false)
  const name = () => queueName(props.queue)
  const failed = (
    what: "pause" | "resume" | "clear",
    queue: string,
    cause: Error,
  ) =>
    toast.error(tr(`jobs.queue.${what}Failed`, { queue }), {
      description: errorMessage(cause),
    })
  // The callbacks run outside tracking, so the options read the queue. A
  // pause takes whether the queue was paused, so a failure names the ask.
  const pause = useMutation(() => {
    const queue = props.queue.id
    const shown = name()
    return {
      mutationFn: (paused: boolean) =>
        paused
          ? client.admin.jobs.resume({ queue })
          : client.admin.jobs.pause({ queue }),
      onSuccess: update.queue,
      onError: (error: Error, paused: boolean) =>
        failed(paused ? "resume" : "pause", shown, error),
    }
  })
  const clear = useMutation(() => {
    const queue = props.queue.id
    const shown = name()
    return {
      mutationFn: () => client.admin.jobs.clear({ queue }),
      onSuccess: update.queue,
      onError: (error: Error) => failed("clear", shown, error),
    }
  })
  const summary = () => queueSummary(props.queue)

  const running = () =>
    tr("jobs.queue.running", {
      active: props.queue.active,
      concurrency: props.queue.concurrency,
    })
  const state = () =>
    props.queue.paused ? "paused" : props.queue.active > 0 ? "running" : "idle"
  // A paused queue still finishes what it started, so say so under it.
  const counts = () => {
    const queue = props.queue
    const parts: string[] = []
    if (queue.paused && queue.active > 0) parts.push(running())
    if (queue.waiting > 0) {
      parts.push(tr("jobs.queue.waiting", { count: queue.waiting }))
    }
    if (queue.completed > 0) {
      parts.push(tr("jobs.queue.done", { count: queue.completed }))
    }
    return parts
  }
  // A memo, so the line under the status is built once, not on each event.
  const hasCounts = createMemo(
    () => counts().length > 0 || props.queue.failed > 0,
  )

  return (
    <JobRow
      name={name()}
      description={queueDescription(props.queue)}
      controls={
        <>
          <Show when={props.task}>
            {(task) => <TaskButton task={task()} />}
          </Show>
          <DropdownMenu>
            <DropdownMenuTrigger
              class={rowMenuButton}
              aria-label={tr("jobs.queue.actions", { queue: name() })}
            >
              <Icon icon={Ellipsis} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} class="min-w-48">
              <DropdownMenuItem onSelect={() => setDetails(true)}>
                <Icon icon={Info} />
                {tr("jobs.queue.details")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pause.isPending}
                onSelect={() => pause.mutate(props.queue.paused)}
              >
                <Icon icon={props.queue.paused ? Play : Pause} />
                {props.queue.paused
                  ? tr("jobs.queue.resume")
                  : tr("jobs.queue.pause")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={props.queue.waiting === 0 || clear.isPending}
                onSelect={() => clear.mutate()}
              >
                <Icon icon={ListX} />
                {tr("jobs.queue.clear")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <QueueDetailsDialog
            queue={props.queue}
            summary={
              props.queue.failed > 0
                ? `${summary()} · ${failedText(props.queue)}`
                : summary()
            }
            open={details()}
            onOpenChange={setDetails}
          />
        </>
      }
    >
      <Fact
        label={tr("jobs.fact.status")}
        detail={
          hasCounts() ? (
            <>
              {counts().join(" · ")}
              <Show when={props.queue.failed > 0}>
                {counts().length > 0 && " · "}
                <button
                  type="button"
                  class="text-destructive focus-visible:ring-ring cursor-pointer rounded-sm underline-offset-3 outline-none hover:underline focus-visible:ring-2"
                  onClick={() => setDetails(true)}
                >
                  {failedText(props.queue)}
                </button>
              </Show>
            </>
          ) : undefined
        }
      >
        <StatusMark state={state()} />
        <span class="truncate">
          {state() === "paused"
            ? tr("jobs.queue.paused")
            : state() === "running"
              ? running()
              : tr("jobs.queue.idle")}
        </span>
      </Fact>
      <Show when={props.task}>{(task) => <TaskFacts task={task()} />}</Show>
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
    case "failed": {
      if (!last.error) return tr("jobs.task.failed")
      const known = knownMessage(last.error)
      return known === null
        ? tr("jobs.task.failedUnknown")
        : tr("jobs.task.failedWith", { error: known })
    }
  }
}

/** Run now, or cancel; the same width either way, so rows don't move. */
function TaskButton(props: { task: ScheduledTask }) {
  const update = useJobsUpdate()
  const running = () => props.task.startedAt !== null
  // The callbacks run outside tracking, so the options read the task. It
  // takes whether a run was going on, so a failure names what was asked.
  const action = useMutation(() => {
    const task = props.task.id
    const name = taskName(props.task)
    return {
      mutationFn: (cancel: boolean) =>
        cancel
          ? client.admin.jobs.cancelTask({ task })
          : client.admin.jobs.runTask({ task }),
      onSuccess: update.task,
      onError: (error: Error, cancel: boolean) =>
        toast.error(
          cancel
            ? tr("jobs.task.cancelFailed", { task: name })
            : tr("jobs.task.startFailed", { task: name }),
          { description: errorMessage(error) },
        ),
    }
  })
  return (
    <Button
      variant="outline"
      size="sm"
      class="min-w-24 shrink-0"
      disabled={action.isPending}
      onClick={() => action.mutate(running())}
    >
      <Icon icon={running() ? Square : Play} />
      {running() ? tr("jobs.task.cancel") : tr("jobs.task.run")}
    </Button>
  )
}

/**
 * The run going on, with its progress, or how the last one went; then when
 * the next one starts and the schedule behind it.
 */
function TaskFacts(props: { task: ScheduledTask }) {
  const schedule = () => scheduleOf(props.task)
  const lastDetail = () => {
    const last = props.task.lastRun
    return last ? lastRunDetail(last) : undefined
  }
  const percent = () =>
    props.task.progress === null ? null : Math.round(props.task.progress * 100)
  // A memo, so the bar is built once and its transition runs.
  const hasProgress = createMemo(() => percent() !== null)

  return (
    <>
      <Show
        when={props.task.startedAt}
        fallback={
          <Fact
            label={tr("jobs.fact.lastRun")}
            tone={
              !props.task.lastRun
                ? "muted"
                : props.task.lastRun.result === "failed"
                  ? "destructive"
                  : "default"
            }
            detail={lastDetail()}
            title={lastDetail()}
          >
            <span class="truncate">
              {props.task.lastRun
                ? formatRelative(props.task.lastRun.endedAt)
                : tr("jobs.task.neverRan")}
            </span>
          </Fact>
        }
      >
        {(startedAt) => (
          <Fact
            label={tr("jobs.fact.currentRun")}
            detail={
              hasProgress() ? (
                <TaskProgress task={props.task} percent={percent() ?? 0} />
              ) : undefined
            }
          >
            <span class="truncate">
              {tr("jobs.task.started", { when: formatRelative(startedAt()) })}
            </span>
          </Fact>
        )}
      </Show>
      <Fact
        label={tr("jobs.fact.nextRun")}
        tone={
          props.task.nextRunAt || props.task.startedAt ? "default" : "muted"
        }
        detail={schedule()}
        title={schedule()}
      >
        <span class="truncate">
          {props.task.startedAt !== null
            ? tr("jobs.schedule.afterThisRun")
            : props.task.nextRunAt
              ? formatUpcoming(props.task.nextRunAt)
              : tr("jobs.schedule.notScheduled")}
        </span>
      </Fact>
    </>
  )
}

function TaskProgress(props: { task: ScheduledTask; percent: number }) {
  return (
    <span class="flex items-center gap-2">
      <span
        role="progressbar"
        aria-label={tr("jobs.task.progress", { task: taskName(props.task) })}
        aria-valuenow={props.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        class="bg-secondary h-1 w-full max-w-32 overflow-hidden rounded-full"
      >
        {/* Slid in from the left rather than widened, so it animates on
            the compositor. */}
        <span
          class="bg-primary block h-full rounded-full transition-[translate]"
          style={{ translate: `${props.percent - 100}% 0` }}
        />
      </span>
      {tr("jobs.task.percent", { percent: props.percent })}
    </span>
  )
}

/** A task that fills no queue: its name, what it does, and its runs. */
function TaskRow(props: { task: ScheduledTask }) {
  const running = () => props.task.startedAt !== null
  return (
    <JobRow
      name={taskName(props.task)}
      description={taskDescription(props.task)}
      controls={<TaskButton task={props.task} />}
    >
      <Fact label={tr("jobs.fact.status")}>
        <StatusMark state={running() ? "running" : "idle"} />
        <span class="truncate">
          {running() ? tr("jobs.task.running") : tr("jobs.queue.idle")}
        </span>
      </Fact>
      <TaskFacts task={props.task} />
    </JobRow>
  )
}
