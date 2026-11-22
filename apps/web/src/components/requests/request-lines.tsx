import type { AdminRequestItem } from "@matinee/contracts"
import { AvatarGroup } from "@matinee/ui/components/avatar"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@matinee/ui/components/popover"
import { cn } from "@matinee/ui/lib/utils"
import {
  BanIcon,
  CheckIcon,
  CircleOffIcon,
  LibraryBigIcon,
  TriangleAlertIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import type { AskedItem } from "@/components/asked/asked"
import { declineLine } from "@/components/catalog/words"
import { UserAvatar } from "@/components/user-avatar"
import { knownMessage, tr } from "@/i18n"
import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatSpan,
  parseDay,
} from "@/lib/format"

import { GoesToLibrary, useGoesTo } from "./goes-to"
import { askers } from "./request-queue"

/*
 * What a card says under its state's badge, one line long: for whoever
 * runs the queue, where a waiting request goes, what went wrong, how far
 * along it is, or how it ended; for a person, how their own ended. A line
 * that can be cut opens the whole of it, and more, in a popover. And who
 * asked, and when.
 */

const lineIcon = "size-3.5 shrink-0"
const lineText = "text-foreground/85 text-13px"

/**
 * A card's detail line: a mark and the words, cut to one line. With
 * `more`, it's a button that opens the full text in a popover, so a cut
 * note or error can still be read, by pointer, touch, or keyboard.
 */
function Detail({
  icon,
  text,
  title,
  more,
  className,
}: {
  icon?: ReactNode
  text: ReactNode
  /** The popover's heading, the line's subject, like "Declined". */
  title?: string
  more?: ReactNode
  className?: string
}) {
  const face = (
    <>
      {icon}
      <span className="truncate">{text}</span>
    </>
  )
  const look = cn(
    lineText,
    "flex max-w-full min-w-0 items-center gap-1.5 text-left",
    className,
  )
  if (!more) return <p className={look}>{face}</p>
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          look,
          "hover:text-foreground focus-visible:ring-ring data-popup-open:text-foreground relative -mx-1 rounded-md px-1 outline-none focus-visible:ring-2",
          "hover:bg-foreground/[0.06] data-popup-open:bg-foreground/[0.06]",
          // A finger's worth to press on phones, without a taller line.
          "[@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-y-2.5 [@media(pointer:coarse)]:after:inset-x-0 [@media(pointer:coarse)]:after:content-['']",
        )}
      >
        {face}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-(--available-width) gap-0 p-0"
      >
        {title && (
          <PopoverHeader>
            <PopoverTitle className="truncate">{title}</PopoverTitle>
          </PopoverHeader>
        )}
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto px-3 py-2.5 text-sm break-words">
          {more}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A quieter line in a detail popover. */
function Quiet({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-13px">{children}</p>
}

/** "Films · Radarr": where a request went. */
function whereLine(item: AdminRequestItem): string {
  return [item.library.name, item.connection?.name].filter(Boolean).join(" · ")
}

/**
 * The detail line a request in the queue has for its state: where a
 * waiting one goes, which it can change before Add; the problem; the
 * progress; or how it ended.
 */
export function QueueLine({ item }: { item: AdminRequestItem }) {
  switch (item.state) {
    case "waiting":
      return <GoesToLine item={item} />
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

/** "Films ▾ · By hand": where a waiting request goes, and what fills it. */
function GoesToLine({ item }: { item: AdminRequestItem }) {
  const { connection } = useGoesTo(item)
  return (
    <p className={cn(lineText, "flex max-w-full min-w-0 items-center gap-1.5")}>
      <LibraryBigIcon
        aria-hidden
        className={cn(lineIcon, "text-muted-foreground")}
      />
      <GoesToLibrary item={item} className="shrink-[2]" />
      <span aria-hidden className="text-muted-foreground shrink-0">
        ·
      </span>
      {connection ? (
        <span title={connection} className="text-muted-foreground truncate">
          {connection}
        </span>
      ) : (
        <span className="text-warning truncate">
          {tr("requests.noConnection")}
        </span>
      )}
    </p>
  )
}

/**
 * What the connection said about a request it holds, label and value,
 * when it said anything: for working out why one is stuck.
 */
function Diagnostics({ item }: { item: AdminRequestItem }) {
  if (item.diagnostics.length === 0) return null
  return (
    <dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-md bg-black/25 px-2.5 py-1.5 text-xs">
      {item.diagnostics.map((entry, index) => (
        <div key={`${entry.label}-${index}`} className="contents">
          <dt className="text-muted-foreground">{entry.label}</dt>
          <dd className="text-foreground/85 font-mono break-all">
            {entry.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** What went wrong sending it, all of it a tap away. */
function ProblemLine({ item }: { item: AdminRequestItem }) {
  const error = item.error
    ? (knownMessage(item.error) ?? tr("requests.attention.failedUnknown"))
    : tr("requests.attention.unknown")
  return (
    <Detail
      icon={
        <TriangleAlertIcon
          aria-hidden
          className={cn(lineIcon, "text-warning")}
        />
      }
      text={error}
      title={tr("requests.state.needsAttention")}
      more={
        <>
          <p>{error}</p>
          <Quiet>{whereLine(item)}</Quiet>
          <Diagnostics item={item} />
        </>
      }
    />
  )
}

/**
 * How far along a request on its way is, in words. The badge has the
 * percentage, so the words say what it doesn't.
 */
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
  if (availability.progress !== null && availability.etaSeconds !== null) {
    return tr("requests.progress.left", {
      time: formatSpan(availability.etaSeconds),
    })
  }
  if (availability.stillLooking) return tr("requests.progress.looking")
  if (item.fulfilmentState === "queued") return tr("requests.progress.queued")
  if (item.connection && !item.connection.reportsProgress)
    return tr("requests.progress.byHand")
  return tr("requests.progress.sent")
}

function ProgressLine({ item }: { item: AdminRequestItem }) {
  const words = progressWords(item)
  return (
    <Detail
      text={<span className="tabular-nums">{words}</span>}
      title={tr("requests.state.onTheWay")}
      more={
        <>
          <p>{words}</p>
          <Quiet>{whereLine(item)}</Quiet>
          <Diagnostics item={item} />
        </>
      }
    />
  )
}

function ArrivedLine({ item }: { item: AdminRequestItem }) {
  if (!item.arrivedAt) return null
  return (
    <Detail
      icon={<CheckIcon aria-hidden className={cn(lineIcon, "text-success")} />}
      text={tr("requests.done.arrived", {
        when: formatRelative(item.arrivedAt),
      })}
      title={tr("requests.state.here")}
      more={
        <>
          <p>
            {tr("requests.done.arrived", {
              when: formatDateTime(item.arrivedAt),
            })}
          </p>
          <Quiet>{whereLine(item)}</Quiet>
        </>
      }
    />
  )
}

/** Why it was declined, or that it was given up on, then the note. */
function DeclinedLine({ item }: { item: AdminRequestItem }) {
  const when = item.declinedAt
  const gaveUp = item.reason === "notFound"
  const Icon = gaveUp ? CircleOffIcon : BanIcon
  const why = gaveUp
    ? tr("requests.done.gaveUpUndated")
    : item.reason
      ? tr(`requests.reason.${item.reason}`)
      : tr("requests.done.declinedUndated")
  return (
    <Detail
      icon={
        <Icon aria-hidden className={cn(lineIcon, "text-muted-foreground")} />
      }
      text={
        <>
          {why}
          {item.note && (
            <span className="text-foreground/70 italic"> · {item.note}</span>
          )}
        </>
      }
      title={tr("requests.state.declined")}
      more={
        <>
          <p>
            {[
              when
                ? tr(
                    gaveUp ? "requests.done.gaveUp" : "requests.done.declined",
                    { when: formatDateTime(when) },
                  )
                : null,
              gaveUp ? null : why,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {item.note && (
            <p className="whitespace-pre-line italic">{item.note}</p>
          )}
          <Quiet>{item.library.name}</Quiet>
        </>
      }
    />
  )
}

/** How many askers' avatars a card shows; the count after them says the rest. */
const AVATARS = 3

/**
 * Each avatar's place in the stack, first asker on top: the card names
 * them, so theirs is the face that shows whole, with the others behind.
 */
const STACK = ["z-3", "z-2", "z-1"]

/**
 * Who asked, as a button that lists them all, each with when: "Ben +1 ·
 * 2 hours ago", with the first few faces before it. `when` leaves the
 * time out for a request that's finished, and `faces` leaves the words
 * out where only the faces fit.
 */
export function Askers({
  item,
  when = true,
  faces = false,
}: {
  item: AdminRequestItem
  when?: boolean
  faces?: boolean
}) {
  const { first, rest } = askers(item)
  if (!first) return null
  const everyone = [first, ...rest]
  return (
    <Popover>
      <PopoverTrigger
        aria-label={tr("requests.askedByNamed", { name: item.title.name })}
        className={cn(
          "text-13px focus-visible:ring-ring hover:bg-foreground/[0.06] data-popup-open:bg-foreground/[0.06] relative -mx-1 flex max-w-full min-w-0 items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-2",
          "[@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-y-2 [@media(pointer:coarse)]:after:inset-x-0 [@media(pointer:coarse)]:after:content-['']",
        )}
      >
        <AvatarGroup className="shrink-0">
          {everyone.slice(0, AVATARS).map((asker, index) => (
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
        {!faces && (
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="text-foreground/90 truncate">{first.name}</span>
            {rest.length > 0 && (
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {tr("requests.othersCount", { count: rest.length })}
              </span>
            )}
            {when && (
              <span className="text-muted-foreground truncate">
                · {formatRelative(first.createdAt)}
              </span>
            )}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-w-(--available-width) gap-0 p-0"
      >
        <PopoverHeader>
          <PopoverTitle>{tr("requests.askedBy")}</PopoverTitle>
        </PopoverHeader>
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto px-3 py-2.5">
          {everyone.map((asker) => (
            <li key={asker.id} className="flex min-w-0 items-center gap-2.5">
              <UserAvatar
                user={{
                  avatarId: asker.avatarId,
                  displayName: asker.name,
                  username: asker.name,
                }}
                className="text-11px size-6 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {asker.name}
              </span>
              <span
                className="text-muted-foreground text-13px shrink-0"
                title={formatDateTime(asker.createdAt)}
              >
                {formatRelative(asker.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

/** When the viewer asked, "25 minutes ago". */
export function AskedWhen({ item }: { item: AskedItem }) {
  return (
    <p
      className="text-muted-foreground text-13px truncate"
      title={formatDateTime(item.createdAt)}
    >
      {formatRelative(item.createdAt)}
    </p>
  )
}

/**
 * The detail line a person's own request has: when it arrived, or why
 * it was declined and the note. The other states need none.
 */
export function OwnLine({ item }: { item: AskedItem }) {
  if (item.state === "here" && item.arrivedAt) {
    return (
      <Detail
        icon={
          <CheckIcon aria-hidden className={cn(lineIcon, "text-success")} />
        }
        text={tr("requests.done.arrived", {
          when: formatRelative(item.arrivedAt),
        })}
        title={tr("requests.state.here")}
        more={
          <p>
            {tr("requests.done.arrived", {
              when: formatDateTime(item.arrivedAt),
            })}
          </p>
        }
      />
    )
  }
  if (item.state !== "declined") return null
  const { reason } = item.season ?? item.availability
  if (!reason) return null
  const why = declineLine(reason)
  return (
    <Detail
      icon={
        <BanIcon
          aria-hidden
          className={cn(lineIcon, "text-muted-foreground")}
        />
      }
      text={
        <>
          {why}
          {reason.note && (
            <span className="text-foreground/70 italic"> · {reason.note}</span>
          )}
        </>
      }
      title={tr("requests.state.declined")}
      more={
        <>
          <p>{why}</p>
          {reason.note && (
            <p className="whitespace-pre-line italic">{reason.note}</p>
          )}
        </>
      }
    />
  )
}
