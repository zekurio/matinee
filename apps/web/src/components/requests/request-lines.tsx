import type { AdminRequestItem, Availability } from "@matinee/contracts"
import { AvatarGroup } from "@matinee/ui/components/avatar"
import { cn } from "@matinee/ui/lib/utils"
import { BanIcon, CheckIcon, CircleOffIcon, LibraryBigIcon } from "lucide-react"
import type { ReactNode } from "react"

import type { AskedItem } from "@/components/asked/asked"
import { declineLine, releaseWord } from "@/components/catalog/words"
import { UserAvatar } from "@/components/user-avatar"
import { knownMessage, tr } from "@/i18n"
import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatSpan,
  parseDay,
} from "@/lib/format"
import { seasonName } from "@/lib/media"

import { GoesToLibrary, useGoesTo } from "./goes-to"
import { askers, formatNames, formatPercent } from "./request-queue"

/*
 * What a card says under its state's badge: for whoever runs the queue,
 * where a waiting request goes, what went wrong, how far along it is, or
 * how it ended; for a person, the same about their own. And who asked.
 */

/** A line in muted type, with a mark before it. */
function Line({
  icon,
  children,
  title,
  className,
}: {
  icon?: ReactNode
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <p
      title={title}
      className={cn(
        "text-foreground/85 text-13px flex max-w-full min-w-0 items-center gap-1.5",
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </p>
  )
}

const lineIcon = "size-3.5 shrink-0"

/** "Films · Radarr": where a request went, under its state. */
function whereLine(item: AdminRequestItem): string {
  return [item.library.name, item.connection?.name].filter(Boolean).join(" · ")
}

/** The second line in quieter type. */
function Second({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-13px max-w-full truncate">
      {children}
    </p>
  )
}

/**
 * The line a request in the queue has for its state, as the server put
 * it in its list: where a waiting one goes, which it can change before
 * Add; the problem; the progress; or how it ended. `goesTo` false leaves
 * a waiting one's out where Add names the library itself.
 */
export function QueueLine({
  item,
  goesTo = true,
}: {
  item: AdminRequestItem
  goesTo?: boolean
}) {
  switch (item.state) {
    case "waiting":
      return goesTo ? <GoesToLine item={item} /> : null
    case "needsAttention":
      return <ProblemLine item={item} />
    case "onTheWay":
      return <ProgressLine item={item} />
    case "here":
      return <ArrivedLine item={item} />
    case "declined":
      return <DeclinedLine item={item} />
  }
}

/** Where a waiting request goes, and the connection that fills it. */
function GoesToLine({ item }: { item: AdminRequestItem }) {
  const { connection } = useGoesTo(item)
  return (
    <div className="flex min-w-0 flex-col">
      <p className="text-foreground/85 text-13px flex max-w-full min-w-0 items-center gap-1.5">
        <LibraryBigIcon
          aria-hidden
          className={cn(lineIcon, "text-muted-foreground")}
        />
        <span className="text-muted-foreground shrink-0">
          {tr("requests.goesTo.label")}
        </span>
        <GoesToLibrary item={item} />
      </p>
      <Second>
        {connection ?? (
          <span className="text-warning">{tr("requests.noConnection")}</span>
        )}
      </Second>
    </div>
  )
}

/** What went wrong sending it. */
function ProblemLine({ item }: { item: AdminRequestItem }) {
  const error = item.error
    ? (knownMessage(item.error) ?? tr("requests.attention.failedUnknown"))
    : tr("requests.attention.unknown")
  return (
    <div className="flex min-w-0 flex-col">
      <p
        title={error}
        className="text-foreground/90 text-13px line-clamp-2 max-w-full"
      >
        {error}
      </p>
      <Second>{whereLine(item)}</Second>
    </div>
  )
}

/** How far along a request on its way is, in words. */
function progressWords(item: AdminRequestItem): string {
  const { availability } = item
  if (availability.state === "release") {
    const day = availability.releaseDate
      ? parseDay(availability.releaseDate)
      : null
    return day
      ? tr("requests.progress.release", { date: formatDate(day) })
      : tr("requests.progress.notOut")
  }
  if (availability.progress !== null) {
    return [
      formatPercent(availability.progress),
      availability.etaSeconds === null
        ? null
        : tr("requests.progress.left", {
            time: formatSpan(availability.etaSeconds),
          }),
    ]
      .filter(Boolean)
      .join(" · ")
  }
  if (availability.stillLooking) return tr("requests.progress.looking")
  if (item.fulfilmentState === "queued") return tr("requests.progress.queued")
  if (item.connection && !item.connection.reportsProgress)
    return tr("requests.progress.byHand")
  return tr("requests.progress.sent")
}

/** A request on its way: a bar while it counts, the words, and where. */
function ProgressLine({ item }: { item: AdminRequestItem }) {
  const { progress } = item.availability
  const percent = progress === null ? null : Math.round(progress * 100)
  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      {percent !== null && (
        <span
          role="progressbar"
          aria-label={tr("requests.progress.label", { name: item.title.name })}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="bg-foreground/15 my-1 h-1 w-full max-w-48 overflow-hidden rounded-full"
        >
          <span
            className="bg-primary block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </span>
      )}
      <div className="flex min-w-0 flex-col">
        <Line className="tabular-nums">{progressWords(item)}</Line>
        <Second>{whereLine(item)}</Second>
      </div>
    </div>
  )
}

function ArrivedLine({ item }: { item: AdminRequestItem }) {
  return (
    <div className="flex min-w-0 flex-col">
      {item.arrivedAt && (
        <Line
          icon={
            <CheckIcon aria-hidden className={cn(lineIcon, "text-success")} />
          }
          title={formatDateTime(item.arrivedAt)}
        >
          {tr("requests.done.arrived", {
            when: formatRelative(item.arrivedAt),
          })}
        </Line>
      )}
      <Second>{whereLine(item)}</Second>
    </div>
  )
}

/** Declined or given up on, when, why, and the note left with it. */
function DeclinedLine({ item }: { item: AdminRequestItem }) {
  const when = item.declinedAt
  const gaveUp = item.reason === "notFound"
  const Icon = gaveUp ? CircleOffIcon : BanIcon
  const outcome = [
    when
      ? tr(gaveUp ? "requests.done.gaveUp" : "requests.done.declined", {
          when: formatRelative(when),
        })
      : tr(
          gaveUp
            ? "requests.done.gaveUpUndated"
            : "requests.done.declinedUndated",
        ),
    item.reason && !gaveUp ? tr(`requests.reason.${item.reason}`) : null,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <div className="flex min-w-0 flex-col">
      <Line
        icon={
          <Icon aria-hidden className={cn(lineIcon, "text-muted-foreground")} />
        }
        title={when ? formatDateTime(when) : undefined}
      >
        {outcome}
      </Line>
      {item.note ? (
        <p
          title={item.note}
          className="text-foreground/70 text-13px line-clamp-2 max-w-full italic"
        >
          {item.note}
        </p>
      ) : (
        <Second>{item.library.name}</Second>
      )}
    </div>
  )
}

/**
 * What the connection said about a request it holds, label and value,
 * when it said anything: for working out why one is stuck.
 */
export function Diagnostics({ item }: { item: AdminRequestItem }) {
  if (item.diagnostics.length === 0) return null
  return (
    <dl className="text-11px grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-md bg-black/25 px-2.5 py-1.5">
      {item.diagnostics.map((entry, index) => (
        <div key={`${entry.label}-${index}`} className="contents">
          <dt className="text-muted-foreground">{entry.label}</dt>
          <dd
            className="text-foreground/85 truncate font-mono"
            title={entry.value}
          >
            {entry.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** How many askers' avatars a card shows; the count after them says the rest. */
const AVATARS = 3

/**
 * Each avatar's place in the stack, first asker on top: the card names
 * them, so theirs is the face that shows whole, with the others behind.
 */
const STACK = ["z-3", "z-2", "z-1"]

/** The first few who asked, the first one's name, how many others, and when. */
export function Askers({ item }: { item: AdminRequestItem }) {
  const { first, rest } = askers(item)
  if (!first) return null
  const others = rest.map((entry) => entry.name)
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <AvatarGroup className="shrink-0">
        {[first, ...rest.slice(0, AVATARS - 1)].map((asker, index) => (
          <UserAvatar
            key={asker.id}
            user={{
              avatarId: asker.avatarId,
              displayName: asker.name,
              username: asker.name,
            }}
            className={cn("text-11px size-6", STACK[index])}
          />
        ))}
      </AvatarGroup>
      <div className="text-13px flex min-w-0 flex-col">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-foreground/90 truncate">{first.name}</span>
          {others.length > 0 && (
            <span
              className="text-muted-foreground shrink-0 tabular-nums"
              title={tr("requests.alsoRequested", {
                names: formatNames(others),
              })}
            >
              <span aria-hidden>
                {tr("requests.othersCount", { count: others.length })}
              </span>
              <span className="sr-only">
                {tr("requests.alsoRequested", { names: formatNames(others) })}
              </span>
            </span>
          )}
        </p>
        <p
          className="text-muted-foreground truncate"
          title={formatDateTime(first.createdAt)}
        >
          {formatRelative(first.createdAt)}
        </p>
      </div>
    </div>
  )
}

/** When the viewer's request was first made. */
export function AskedWhen({ item }: { item: AskedItem }) {
  return (
    <p
      className="text-muted-foreground text-13px truncate"
      title={formatDateTime(item.createdAt)}
    >
      {tr("requests.askedWhen", { when: formatRelative(item.createdAt) })}
    </p>
  )
}

/**
 * The line a person's own request has for its state: the season of a
 * show it's about, and how far along it is, when it's out, why it was
 * declined, or when it came.
 */
export function OwnLine({ item }: { item: AskedItem }) {
  const season = item.state === "here" ? null : item.season
  const availability: Availability = season ?? item.availability
  let words: string | null = null
  switch (item.state) {
    case "onTheWay":
      if (availability.state === "release")
        words = releaseWord(availability.releaseDate)
      else if (availability.etaSeconds !== null)
        words = tr("requests.progress.left", {
          time: formatSpan(availability.etaSeconds),
        })
      else if (availability.stillLooking)
        words = tr("requests.progress.looking")
      break
    case "here":
      if (item.arrivedAt)
        words = tr("requests.done.arrived", {
          when: formatRelative(item.arrivedAt),
        })
      break
    case "declined": {
      const { reason } = availability
      if (!reason) break
      return (
        <div className="flex min-w-0 flex-col">
          {season && <Second>{seasonName(season.number)}</Second>}
          <p className="text-foreground/85 text-13px line-clamp-2">
            {declineLine(reason)}
          </p>
          {reason.note && (
            <p className="text-foreground/70 text-13px line-clamp-2 italic">
              {reason.note}
            </p>
          )}
        </div>
      )
    }
    case "waiting":
    case "needsAttention":
      break
  }
  if (!season && !words) return null
  return (
    <p className="text-muted-foreground text-13px max-w-full truncate">
      {[season ? seasonName(season.number) : null, words]
        .filter(Boolean)
        .join(" · ")}
    </p>
  )
}
