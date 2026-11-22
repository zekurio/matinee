import type { AdminRequestItem } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  getRouteApi,
  Link,
  type LinkOptions,
  linkOptions,
} from "@tanstack/react-router"
import { ChevronRightIcon, RotateCwIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Rail, RailItem } from "@/components/rail"
import { AdminAnswer } from "@/components/requests/admin-answer"
import { OwnRequest } from "@/components/requests/own-request"
import {
  RequestCard,
  RequestCardSkeleton,
  RequestStateBadge,
  requestProgress,
} from "@/components/requests/request-card"
import { Askers, QueueLine } from "@/components/requests/request-lines"
import { useRequestQueue, workItems } from "@/components/requests/request-queue"
import { tr } from "@/i18n"
import { client, errorMessage, liveQuery, orpc } from "@/lib/rpc"
import { isHidden, useHiddenRequests } from "@/stores/request-actions"

import { RAIL_CARDS } from "./discover-data"
import { RailFailed } from "./rail-failed"

const authed = getRouteApi("/_authed")

/**
 * Discover's first row, "Recent requests": for whoever runs the queue,
 * the latest in every state, waiting first; for anyone else, their own,
 * in progress first. Both come from streams of their own, so they stay
 * when the catalog's rows are down or empty. The heading opens the full
 * list, and the row only goes when there are no requests at all, since
 * on a TV it's the way there.
 */
export function DiscoverRequests({ which }: { which: "queue" | "mine" }) {
  return which === "queue" ? <QueueRequests /> : <OwnRequests />
}

/**
 * The frame both share: the heading, which leads to the full list, the
 * row, its skeletons while `items` load (undefined), and nothing once
 * none is left. What's held for Undo or just sent is out of the row.
 * The frame stays mounted as long as Discover has requests, so an Undo
 * outlives the last card.
 */
function RequestsRow<Item extends Pick<AdminRequestItem, "id" | "state">>({
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
  const shown = items?.filter((item) => !isHidden(hidden, item))
  if (shown?.length === 0) return null
  const title = tr("requests.recent")

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
 * The queue's latest, from its own stream, in the order of its lists:
 * waiting, needs attention, on the way, then the latest done. A request
 * answered moves on at once, so nothing here needs a reload. Its heading
 * leads to the requests page.
 */
function QueueRequests() {
  const queue = useRequestQueue()
  const items = queue.data
    ? [...workItems(queue.data), ...queue.data.done]
    : undefined
  return (
    <RequestsRow
      link={linkOptions({ to: "/requests" })}
      items={items}
      retry={
        queue.isError && !queue.data ? () => void queue.refetch() : undefined
      }
    >
      {(item) => <QueueRequest item={item} />}
    </RequestsRow>
  )
}

/**
 * The viewer's own latest requests, as My requests lists them, in
 * progress first, from the same live stream. Its heading leads to that
 * page.
 */
function OwnRequests() {
  const { user } = authed.useRouteContext()
  const mine = useQuery({
    ...orpc.requests.mineLive.experimental_liveOptions({
      input: { limit: RAIL_CARDS },
    }),
    ...liveQuery,
  })
  return (
    <RequestsRow
      link={linkOptions({
        to: "/profiles/$username/asked",
        params: { username: user.username },
      })}
      items={mine.data?.items}
      retry={mine.isError && !mine.data ? () => void mine.refetch() : undefined}
    >
      {(item) => <OwnRequest item={item} />}
    </RequestsRow>
  )
}

/**
 * A request in the queue: its state, the state's line, who asked and
 * when, and what the row lets an admin do about it: Add and Decline
 * while it waits, Retry once sending it failed. The rest is on the
 * requests page.
 */
function QueueRequest({ item }: { item: AdminRequestItem }) {
  const retry = useMutation({
    mutationFn: () => client.admin.requests.retry({ id: item.id }),
    onSuccess: () =>
      toast.success(tr("requests.retried", { name: item.title.name })),
    onError: (error) =>
      toast.error(tr("requests.retryFailed", { name: item.title.name }), {
        description: errorMessage(error),
      }),
  })
  return (
    <RequestCard
      item={item}
      state={
        <RequestStateBadge
          state={item.state}
          progress={requestProgress(item)}
          urgent
        />
      }
      // Add names where a waiting one goes, and chooses another.
      line={<QueueLine item={item} goesTo={false} />}
      who={<Askers item={item} />}
      actions={
        item.state === "waiting" ? (
          <AdminAnswer
            item={item}
            look="plain"
            className="flex-wrap *:min-w-0"
          />
        ) : item.state === "needsAttention" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={retry.isPending}
            aria-label={tr("requests.retryNamed", { name: item.title.name })}
            onClick={() => retry.mutate()}
            className="w-full"
          >
            <RotateCwIcon />
            {tr("requests.retry")}
          </Button>
        ) : null
      }
    />
  )
}
