import type { AdminRequestItem } from "@matinee/contracts"
import { AvatarGroup } from "@matinee/ui/components/avatar"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"

import { Picture, tone } from "@/components/picture"
import { Rail, RailItem } from "@/components/rail"
import { AdminAnswer } from "@/components/requests/admin-answer"
import {
  askers,
  formatNames,
  scopeLabel,
  titleLink,
  useRequestQueue,
} from "@/components/requests/request-queue"
import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { formatDateTime, formatRelative } from "@/lib/format"
import { art } from "@/lib/media"
import { useHiddenRequests, useSendHeldOnLeave } from "@/stores/request-actions"

/** How many askers' avatars a card shows; the count after them says the rest. */
const AVATARS = 3

/**
 * The requests that wait for an admin, as the first row of Discover, from
 * the queue's own stream. A request answered goes at once, and the row
 * with the last one, so nothing here needs a reload. Its heading leads to
 * the queue.
 */
export function WaitingRequests() {
  const queue = useRequestQueue()
  const hidden = useHiddenRequests()
  // Mounted for as long as Discover is, so an Undo outlives the last card.
  useSendHeldOnLeave()

  if (queue.isError && !queue.data) return null
  const waiting = queue.data?.waiting.filter((item) => !hidden.has(item.id))
  if (waiting?.length === 0) return null
  const title = tr("discover.rail.requests")

  return (
    <Rail
      title={title}
      heading={
        <Link
          to="/requests"
          className="focus-visible:ring-ring group/heading inline-flex max-w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
        >
          <span className="truncate">{title}</span>
          <ChevronRightIcon
            aria-hidden
            className="text-muted-foreground group-hover/heading:text-foreground size-5 shrink-0 transition-colors"
          />
        </Link>
      }
    >
      {waiting ? (
        waiting.map((item) => (
          <RailItem key={item.id} artwork="poster">
            <RequestCard item={item} />
          </RailItem>
        ))
      ) : (
        <CardSkeletons />
      )}
    </Rail>
  )
}

/** The cards on their way, in the size of the cards they stand in for. */
function CardSkeletons() {
  return Array.from({ length: 4 }, (_, i) => (
    <RailItem key={i} artwork="poster">
      <Skeleton className="aspect-[2/3] rounded-lg" />
      <Skeleton className="mt-2.5 h-3.5 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/3" />
    </RailItem>
  ))
}

/**
 * One waiting request: the title's poster and name, which open it as the
 * queue's rows do, who asked and when, and Add and Decline under them.
 */
function RequestCard({ item }: { item: AdminRequestItem }) {
  const poster = art(item.title.poster)
  const facts = [
    item.title.year === null ? null : String(item.title.year),
    tr(`requests.kind.${item.title.ref.kind}`),
  ]
    .filter(Boolean)
    .join(" · ")
  const scope = scopeLabel(item.scope)

  return (
    <article className="bg-card flex h-full flex-col overflow-hidden rounded-lg border">
      <Link
        {...titleLink(item)}
        className="focus-visible:ring-ring flex min-w-0 flex-col rounded-t-lg outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <span
          aria-hidden
          className={cn(
            "relative block aspect-[2/3] overflow-hidden border-b",
            tone(item.title.ref.providerId),
          )}
        >
          {poster && <Picture sources={[poster]} sizes="204px" />}
        </span>
        <span className="flex min-w-0 flex-col px-3 pt-2.5 text-sm leading-5">
          <span className="truncate font-medium">{item.title.name}</span>
          <span className="text-muted-foreground text-13px truncate">
            {facts}
          </span>
          {scope && (
            <span className="text-muted-foreground text-13px truncate">
              {scope}
            </span>
          )}
        </span>
      </Link>
      <div className="mt-auto flex min-w-0 flex-col gap-3 p-3 pt-2.5">
        <Askers item={item} />
        {/* Stacked: the two labels don't fit side by side in a poster's width. */}
        <AdminAnswer item={item} look="plain" className="flex-col *:w-full" />
      </div>
    </article>
  )
}

/** The first few who asked, the first one's name, how many others, and when. */
function Askers({ item }: { item: AdminRequestItem }) {
  const { first, rest } = askers(item)
  if (!first) return null
  const others = rest.map((entry) => entry.name)
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <AvatarGroup className="shrink-0">
        {[first, ...rest.slice(0, AVATARS - 1)].map((asker) => (
          <UserAvatar
            key={asker.id}
            user={{
              avatarId: asker.avatarId,
              displayName: asker.name,
              username: asker.name,
            }}
            className="text-11px size-6"
          />
        ))}
      </AvatarGroup>
      <div className="text-13px flex min-w-0 flex-col leading-5">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-foreground/85 truncate">{first.name}</span>
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
