import type { PluginInfo } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation } from "@tanstack/react-query"
import {
  ActivityIcon,
  CalendarX2Icon,
  InboxIcon,
  MoonIcon,
  RotateCwIcon,
  TimerIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { perLocale, tr } from "@/i18n"
import { formatDateTime, formatRelative } from "@/lib/format"
import { client } from "@/lib/rpc"

import {
  Fact,
  pluginErrorMessage,
  Reason,
  usePluginSaved,
} from "./plugins-common"

type Delivery = NonNullable<PluginInfo["events"]>

/**
 * Whether a plugin that's on sleeps or is awake, beside its state. Words
 * in the muted tone of a fact, so it reads as detail of "Running" and
 * changes without moving anything around it.
 */
export function SleepNote({ awake }: { awake: boolean }) {
  return (
    <span className="text-muted-foreground inline-flex h-5 items-center text-[13px] leading-5">
      <Fact icon={awake ? <ActivityIcon /> : <MoonIcon />}>
        {awake ? tr("plugins.sleep.awake") : tr("plugins.sleep.asleep")}
      </Fact>
    </span>
  )
}

/**
 * How delivery is in trouble, for a plugin that runs: `blocked` when
 * nothing gets through, so the server tries one event at a time, and
 * `failing` when some events keep failing while the rest get through. A
 * plugin that stopped shows that instead, since it's why.
 */
export type DeliveryTrouble = "blocked" | "failing" | null

function troubleOf(events: Delivery, running: boolean): DeliveryTrouble {
  if (!running) return null
  if (events.blocked) return "blocked"
  if (events.failing > 0) return "failing"
  return null
}

export function deliveryTrouble(plugin: PluginInfo): DeliveryTrouble {
  return plugin.events
    ? troubleOf(plugin.events, plugin.state === "running")
    : null
}

const seconds = perLocale(
  (locale) => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
)

/** The current time, every second while `running`. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  return now
}

/**
 * When the next try is: counted down by the second for the short waits,
 * in minutes or hours past that, and "now" once it's due.
 */
function NextTry({ at }: { at: Date }) {
  const now = useNow(true)
  const left = Math.ceil((at.getTime() - now) / 1000)
  let text: string
  if (left <= 0) text = tr("plugins.events.tryingNow")
  else if (left < 60) {
    text = tr("plugins.events.nextTry", {
      when: seconds().format(left, "second"),
    })
  } else text = tr("plugins.events.nextTry", { when: formatRelative(at) })
  return (
    <Fact icon={<TimerIcon />} title={formatDateTime(at)}>
      <time dateTime={at.toISOString()} className="tabular-nums">
        {text}
      </time>
    </Fact>
  )
}

/** Moves to the log, newest line in view, and puts focus on it. */
function showLog() {
  const section = document.getElementById("settings-plugin-log")
  if (!section) return
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  section.scrollIntoView({
    block: "start",
    behavior: reduce ? "auto" : "smooth",
  })
  section
    .querySelector<HTMLElement>("[role=log]")
    ?.focus({ preventScroll: true })
}

/** When the server gives up on an event, with the exact time on hover. */
function DropAt({ at }: { at: Date }) {
  return (
    <Fact icon={<CalendarX2Icon />} title={formatDateTime(at)}>
      <time dateTime={at.toISOString()}>
        {tr("plugins.events.dropAt", { when: formatRelative(at) })}
      </time>
    </Fact>
  )
}

/**
 * How the events the plugin listens for are getting to it, as a row of
 * its status. Delivered and draining are a word or a count.
 *
 * Blocked is when nothing gets through: amber, with the plugin's own
 * words, when the next single try is, and how many wait. Failing is when
 * a few events keep failing and the rest get through, which needs a look
 * but isn't urgent: the count in plain text, and the oldest one's error,
 * tries, next try, and when it's dropped. Both point at the log, whose
 * lines are the tries, and offer a try now, for after the cause is fixed.
 * Never red: the plugin runs, and the server keeps trying.
 */
export function DeliveryRow({
  id,
  events,
  running,
}: {
  id: string
  events: Delivery
  /** Whether it runs; events for one that doesn't wait for it. */
  running: boolean
}) {
  const trouble = troubleOf(events, running)
  const blocked = trouble === "blocked"
  const saved = usePluginSaved()
  const retry = useMutation({
    mutationFn: () => client.admin.plugins.retryEvents({ id }),
    onSuccess: saved,
    onError: (error) =>
      toast.error(tr("plugins.events.retryFailed"), {
        description: pluginErrorMessage(error),
      }),
  })
  if (!running && events.pending === 0) return null

  let status: string
  if (blocked) status = tr("plugins.events.blocked")
  else if (trouble === "failing") {
    status = tr("plugins.events.failing", { count: events.failing })
  } else if (events.pending === 0) status = tr("plugins.events.delivered")
  else if (running) {
    status = tr("plugins.events.delivering", { count: events.pending })
  } else status = tr("plugins.events.waiting", { count: events.pending })

  return (
    <div className="@container flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <h4 className="text-sm leading-5 font-medium">
          {tr("plugins.events.title")}
        </h4>
        <p
          className={
            blocked
              ? "text-foreground inline-flex items-center gap-1.5 text-[13px] leading-5 font-medium"
              : trouble === "failing"
                ? "text-foreground text-[13px] leading-5 tabular-nums"
                : "text-muted-foreground text-[13px] leading-5 tabular-nums"
          }
        >
          {blocked && (
            <TriangleAlertIcon
              aria-hidden
              className="text-warning size-3.5 shrink-0"
            />
          )}
          {status}
        </p>
      </div>
      {!running && (
        <p className="text-muted-foreground text-[13px] leading-5">
          {tr("plugins.events.whileStopped")}
        </p>
      )}
      {trouble && (
        <>
          <p className="text-muted-foreground text-[13px] leading-5">
            {blocked
              ? tr("plugins.events.blockedReason")
              : tr("plugins.events.failingReason", {
                  count: events.failing,
                })}
          </p>
          {events.error && <Reason text={events.error} serverText />}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] leading-5">
            {events.retryAt && <NextTry at={events.retryAt} />}
            {events.attempts > 0 && (
              <Fact icon={<RotateCwIcon />}>
                <span className="tabular-nums">
                  {tr("plugins.events.tries", { count: events.attempts })}
                </span>
              </Fact>
            )}
            {events.expiresAt && <DropAt at={events.expiresAt} />}
            {(blocked || events.pending > events.failing) && (
              <Fact icon={<InboxIcon />}>
                <span className="tabular-nums">
                  {tr("plugins.events.waiting", { count: events.pending })}
                </span>
              </Fact>
            )}
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0 text-[13px]"
              disabled={retry.isPending}
              onClick={() => retry.mutate()}
            >
              {tr("plugins.events.retry")}
            </Button>
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0 text-[13px]"
              onClick={showLog}
            >
              {tr("plugins.events.showLog")}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
