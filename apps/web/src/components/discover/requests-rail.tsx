import type { AdminRequestItem } from "@matinee/contracts"
import { AvatarGroup } from "@matinee/ui/components/avatar"
import { Button } from "@matinee/ui/components/button"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import {
  getRouteApi,
  Link,
  type LinkOptions,
  linkOptions,
} from "@tanstack/react-router"
import { ChevronRightIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"

import { type AskedItem, DeclinedNote } from "@/components/asked/asked"
import { Rail, RailItem } from "@/components/rail"
import { AdminAnswer } from "@/components/requests/admin-answer"
import {
  askers,
  formatNames,
  useRequestQueue,
} from "@/components/requests/request-queue"
import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { formatDateTime, formatRelative } from "@/lib/format"
import { seasonName } from "@/lib/media"
import { liveQuery, orpc } from "@/lib/rpc"
import {
  useHiddenRequests,
  useRequestActionsStore,
} from "@/stores/request-actions"

import { RAIL_CARDS } from "./discover-data"
import { RailFailed } from "./rail-failed"
import {
  RequestCard,
  RequestCardSkeleton,
  RequestState,
  WaitingBadge,
} from "./request-card"

/** How many askers' avatars a card shows; the count after them says the rest. */
const AVATARS = 3

/**
 * Each avatar's place in the stack, first asker on top: the card names
 * them, so theirs is the face that shows whole, with the others behind.
 */
const STACK = ["z-3", "z-2", "z-1"]

const authed = getRouteApi("/_authed")

/**
 * The first row of Discover when it has requests to show: an admin's
 * waiting ones, or a person's own in progress. Both come from streams or
 * lists of their own, so they stay when the catalog's rows are down or
 * empty.
 */
export function DiscoverRequests({ which }: { which: "queue" | "mine" }) {
  return which === "queue" ? <WaitingRequests /> : <OwnRequests />
}

/**
 * The frame both share: the heading, which leads to the full list, the
 * row, its skeletons while `items` load (undefined), and nothing once
 * none is left. What's held for Undo or just sent is out of the row.
 * The frame stays mounted as long as Discover has requests, so an Undo
 * outlives the last card.
 */
function RequestsRow<Item extends { id: string }>({
  link,
  items,
  retry,
  children,
}: {
  link: LinkOptions
  items: readonly Item[] | undefined
  retry?: () => void
  children: (item: Item) => ReactNode
}) {
  const hidden = useHiddenRequests()
  const shown = items?.filter((item) => !hidden.has(item.id))
  if (shown?.length === 0) return null
  const title = tr("requests.title")

  return (
    <Rail
      title={title}
      heading={
        <Link
          {...link}
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
      {retry ? (
        <RailFailed onRetry={retry} />
      ) : shown ? (
        shown.slice(0, RAIL_CARDS).map((item) => (
          <RailItem key={item.id} artwork="request">
            {children(item)}
          </RailItem>
        ))
      ) : (
        Array.from({ length: 3 }, (_, i) => (
          <RailItem key={i} artwork="request">
            <RequestCardSkeleton />
          </RailItem>
        ))
      )}
    </Rail>
  )
}

/**
 * The requests that wait for an admin, from the queue's own stream. A
 * request answered goes at once, and the row with the last one, so
 * nothing here needs a reload. Its heading leads to the queue.
 */
function WaitingRequests() {
  const queue = useRequestQueue()
  return (
    <RequestsRow
      link={linkOptions({ to: "/requests" })}
      items={queue.data?.waiting}
      retry={
        queue.isError && !queue.data ? () => void queue.refetch() : undefined
      }
    >
      {(item) => <QueueRequest item={item} />}
    </RequestsRow>
  )
}

/**
 * The viewer's own requests in progress, as My requests lists them, with
 * their states from the same live stream. Its heading leads to that page.
 */
function OwnRequests() {
  const { user } = authed.useRouteContext()
  const mine = useQuery({
    ...orpc.requests.mineLive.experimental_liveOptions({
      input: { limit: RAIL_CARDS },
    }),
    ...liveQuery,
  })
  const items = mine.data?.items
  return (
    <RequestsRow
      link={linkOptions({
        to: "/profiles/$username/asked",
        params: { username: user.username },
      })}
      items={items}
      retry={mine.isError && !mine.data ? () => void mine.refetch() : undefined}
    >
      {(item) => <OwnRequest item={item} />}
    </RequestsRow>
  )
}

/** A waiting request: who asked and when, and Add and Decline. */
function QueueRequest({ item }: { item: AdminRequestItem }) {
  return (
    <RequestCard
      item={item}
      state={<WaitingBadge />}
      who={<Askers item={item} />}
      actions={
        <AdminAnswer item={item} look="plain" className="flex-wrap *:min-w-0" />
      }
    />
  )
}

/**
 * One of the viewer's requests, as the server says it stands: its state,
 * under a declined one its reason, when they asked, and Cancel while the
 * server allows it. Cancel holds the call for Undo as the queue's answers
 * do, rather than going out from the poster's own button.
 */
function OwnRequest({ item }: { item: AskedItem }) {
  const hold = useRequestActionsStore((state) => state.hold)
  const season = item.season
  const availability = season ?? item.availability
  return (
    <RequestCard
      item={item}
      state={
        <>
          {season && (
            <span className="text-muted-foreground text-xs">
              {seasonName(season.number)}
            </span>
          )}
          <RequestState availability={availability} />
          <DeclinedNote item={{ availability }} />
        </>
      }
      who={
        <p
          className="text-muted-foreground text-13px truncate leading-5"
          title={formatDateTime(item.createdAt)}
        >
          {tr("discover.request.askedWhen", {
            when: formatRelative(item.createdAt),
          })}
        </p>
      }
      actions={
        (item.availability.action === "cancel" ||
          availability.action === "cancel") && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              hold({
                kind: "cancel",
                ids: [item.id],
                names: [item.title.name],
              })
            }
            // Long words, like German's, wrap rather than cut off.
            className="h-auto min-h-8 w-full py-1.5 leading-tight whitespace-normal"
          >
            <XIcon aria-hidden strokeWidth={2.5} />
            <span className="text-balance">{tr("ask.cancel")}</span>
          </Button>
        )
      }
    />
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
      <div className="text-13px flex min-w-0 flex-col leading-5">
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
