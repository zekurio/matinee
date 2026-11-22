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
import { BanIcon, CircleOffIcon, TriangleAlertIcon } from "lucide-react"
import type { ReactNode } from "react"

import type { AskedItem } from "@/components/asked/asked"
import { declineLine } from "@/components/catalog/words"
import { UserAvatar } from "@/components/user-avatar"
import { knownMessage, tr } from "@/i18n"

import { askers } from "./request-queue"

/*
 * The two rows a card has besides its year, name and badge: who asked,
 * on the admin's cards, and the problem, only when something went wrong.
 * Everything else about a request is in the admin's "…" menu.
 */

const lineIcon = "size-3.5 shrink-0"

/**
 * The problem line under the badge, cut to one line, as a button that
 * opens the whole of it, so a long error or note can still be read, by
 * pointer, touch, or keyboard.
 */
function Problem({
  icon,
  text,
  title,
  children,
}: {
  icon: ReactNode
  text: ReactNode
  /** The popover's heading, like "Declined". */
  title: string
  /** The whole of it, in the popover. */
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "text-foreground/85 text-13px flex max-w-full min-w-0 items-center gap-1.5 text-left",
          "hover:text-foreground focus-visible:ring-ring data-popup-open:text-foreground relative -mx-1 rounded-md px-1 outline-none focus-visible:ring-2",
          "hover:bg-foreground/[0.06] data-popup-open:bg-foreground/[0.06]",
          // A finger's worth to press on phones, without a taller line.
          "[@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-y-2.5 [@media(pointer:coarse)]:after:inset-x-0 [@media(pointer:coarse)]:after:content-['']",
        )}
      >
        {icon}
        <span className="truncate">{text}</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-(--available-width) gap-0 p-0"
      >
        <PopoverHeader>
          <PopoverTitle className="truncate">{title}</PopoverTitle>
        </PopoverHeader>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto px-3 py-2.5 text-sm break-words">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * What the connection said about a request it holds, label and value,
 * when it said anything: for working out why one is stuck.
 */
export function Diagnostics({ item }: { item: AdminRequestItem }) {
  if (item.diagnostics.length === 0) return null
  return (
    <dl className="bg-muted grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-md px-2.5 py-1.5 text-xs">
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

/** "Reason · note", the note quieter, for a declined card's line. */
function reasonAndNote(why: string, note: string | null): ReactNode {
  return (
    <>
      {why}
      {note && <span className="text-foreground/70 italic"> · {note}</span>}
    </>
  )
}

/**
 * The problem a request in the queue has, if any: the error on one that
 * needs attention, the reason and note on one declined or given up on.
 */
export function QueueProblem({ item }: { item: AdminRequestItem }) {
  if (item.state === "needsAttention") {
    const error = item.error
      ? (knownMessage(item.error) ?? tr("requests.attention.failedUnknown"))
      : tr("requests.attention.unknown")
    return (
      <Problem
        icon={
          <TriangleAlertIcon
            aria-hidden
            className={cn(lineIcon, "text-warning")}
          />
        }
        text={error}
        title={tr("requests.state.needsAttention")}
      >
        <p>{error}</p>
        <Diagnostics item={item} />
      </Problem>
    )
  }
  if (item.state !== "declined") return null
  const gaveUp = item.reason === "notFound"
  const Icon = gaveUp ? CircleOffIcon : BanIcon
  const why = item.reason
    ? tr(`requests.reason.${item.reason}`)
    : tr("requests.state.declined")
  return (
    <Problem
      icon={
        <Icon aria-hidden className={cn(lineIcon, "text-muted-foreground")} />
      }
      text={reasonAndNote(why, item.note)}
      title={tr("requests.state.declined")}
    >
      <p>{why}</p>
      {item.note && <p className="whitespace-pre-line italic">{item.note}</p>}
    </Problem>
  )
}

/** The problem a person's own request has: why it was declined. */
export function OwnProblem({ item }: { item: AskedItem }) {
  if (item.state !== "declined") return null
  const { reason } = item.season ?? item.availability
  if (!reason) return null
  const why = declineLine(reason)
  return (
    <Problem
      icon={
        <BanIcon
          aria-hidden
          className={cn(lineIcon, "text-muted-foreground")}
        />
      }
      text={reasonAndNote(why, reason.note)}
      title={tr("requests.state.declined")}
    >
      <p>{why}</p>
      {reason.note && (
        <p className="whitespace-pre-line italic">{reason.note}</p>
      )}
    </Problem>
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
 * Who asked: the first few faces, the first one's name, and how many
 * more, "Ben +2". When each asked is in the card's menu.
 */
export function Askers({ item }: { item: AdminRequestItem }) {
  const { first, rest } = askers(item)
  if (!first) return null
  return (
    <div className="text-13px flex min-w-0 items-center gap-2">
      <AvatarGroup className="shrink-0">
        {[first, ...rest].slice(0, AVATARS).map((asker, index) => (
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
      <span className="text-foreground/90 truncate">{first.name}</span>
      {rest.length > 0 && (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {tr("requests.othersCount", { count: rest.length })}
        </span>
      )}
    </div>
  )
}
