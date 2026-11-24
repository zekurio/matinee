import type { AdminRequestItem } from "@matinee/contracts"
import { AvatarGroup } from "@matinee/ui/components/avatar"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import type { AskedItem } from "@/components/asked/asked"
import { declineLine } from "@/components/catalog/words"
import { UserAvatar } from "@/components/user-avatar"
import { knownMessage, tr } from "@/i18n"

import { askers } from "./request-queue"

/*
 * What a card says besides its year, name and state: who asked, on the
 * admin's cards, and what went wrong, which the state's badge opens.
 * Everything else about a request is in the admin's "…" menu.
 */

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

/**
 * What went wrong with a request in the queue, for its badge to open:
 * the error on one that needs attention, and on one declined or given up
 * on, which it was, with the reason the admin typed. Null when nothing
 * did.
 */
export function queueDetail(item: AdminRequestItem): ReactNode {
  if (item.state === "needsAttention") {
    const error = item.error
      ? (knownMessage(item.error) ?? tr("requests.attention.failedUnknown"))
      : tr("requests.attention.unknown")
    return (
      <>
        <p>{error}</p>
        <Diagnostics item={item} />
      </>
    )
  }
  if (item.state !== "declined") return null
  const why = item.gaveUp
    ? tr("requests.done.gaveUpUndated")
    : tr("requests.state.declined")
  return <Reason why={why} note={item.note} />
}

/** Why a person's own request was declined, for its badge to open. */
export function ownDetail(item: AskedItem): ReactNode {
  if (item.state !== "declined") return null
  const { reason } = item.season ?? item.availability
  if (!reason) return null
  return <Reason why={declineLine(reason)} note={reason.note} />
}

/** That a request was declined, and the reason the admin typed under it. */
function Reason({ why, note }: { why: string; note: string | null }) {
  return (
    <>
      <p>{why}</p>
      {note && <p className="whitespace-pre-line italic">{note}</p>}
    </>
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
 * more, "Ben +2". The faces and the name open the first one's profile;
 * everyone else, and when each asked, is in the card's menu.
 */
export function Askers({ item }: { item: AdminRequestItem }) {
  const { first, rest } = askers(item)
  if (!first) return null
  return (
    <div className="text-13px flex min-w-0 items-center gap-2">
      <Link
        to="/profiles/$username"
        params={{ username: first.username }}
        className="group/asker focus-visible:ring-ring -mx-1 flex min-w-0 items-center gap-2 rounded-sm px-1 outline-none focus-visible:ring-2"
      >
        <AvatarGroup className="shrink-0">
          {[first, ...rest].slice(0, AVATARS).map((asker, index) => (
            <UserAvatar
              key={asker.id}
              user={{
                avatarUrl: asker.avatarUrl,
                displayName: asker.name,
                username: asker.username,
              }}
              className={cn("text-11px size-6", STACK[index])}
            />
          ))}
        </AvatarGroup>
        <span className="text-foreground/90 group-hover/asker:text-foreground truncate underline-offset-2 group-hover/asker:underline">
          {first.name}
        </span>
      </Link>
      {rest.length > 0 && (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {tr("requests.othersCount", { count: rest.length })}
        </span>
      )}
    </div>
  )
}
