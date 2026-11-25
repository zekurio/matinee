import type { AdminRequestItem } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { useMutation } from "@tanstack/solid-query"
import { getRouteApi, Link } from "@tanstack/solid-router"
import { ChevronRight, RotateCw } from "lucide"
import { createMemo, For, Match, Repeat, Show, Switch } from "solid-js"

import { Rail } from "@/components/rail"
import { AdminAnswer } from "@/components/requests/admin-answer"
import { CardMenu } from "@/components/requests/card-menu"
import { OwnRequest } from "@/components/requests/own-request"
import {
  RequestCard,
  RequestCardSkeleton,
  RequestStateBadge,
  requestProgress,
} from "@/components/requests/request-card"
import { Askers, queueDetail } from "@/components/requests/request-lines"
import {
  addAction,
  needsYou,
  useFollowedQuery,
  useRequestQueue,
  workItems,
} from "@/components/requests/request-queue"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { toast } from "@/kit/toast"
import { queueActions } from "@/lib/permissions"
import { client, errorMessage, liveQuery, orpc } from "@/lib/rpc"
import {
  isHidden,
  useHiddenRequests,
  useRequestActionsStore,
} from "@/stores/request-actions"

import { RAIL_CARDS } from "./discover-data"
import { RailFailed } from "./rail-failed"

const authed = getRouteApi("/_authed")

/** The heading's link, which leads to the full list. */
export const railHeadingLink =
  "focus-visible:ring-ring group/heading inline-flex max-w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2"

/**
 * Discover's first row, "Recent requests": for whoever runs the queue,
 * the latest in every state, waiting first; for anyone else, their own,
 * in progress first. Both come from streams of their own, so they stay
 * when the catalog's rows are down or empty. The heading opens the full
 * list, with a dot while work waits for the admin, and an empty queue
 * keeps the heading rather than hiding the way there.
 */
export function DiscoverRequests(props: { which: "queue" | "mine" }) {
  return (
    <Show when={props.which === "queue"} fallback={<OwnRequests />}>
      <QueueRequests />
    </Show>
  )
}

/**
 * A request's place in the row, as `RailItem` sizes its cards: one and a
 * bit on a phone, and from there two posters and the gap between them
 * wide, so it lines up with the poster rows around it.
 */
function RequestItem(props: { children: JSX.Element }) {
  return (
    <li class="w-full shrink-0 snap-start not-first:[contain-intrinsic-size:auto_0px] not-first:[content-visibility:auto] not-first:[overflow-clip-margin:8px] sm:w-[calc(2*188px+1rem)] lg:w-[calc(2*200px+1rem)] 2xl:w-[calc(2*216px+1rem)]">
      {props.children}
    </li>
  )
}

/**
 * The frame both share: the heading, which leads to the full list, the
 * row, its skeletons while `items` load (undefined), and either a note
 * or nothing once none is left. What's held for Undo or just sent is out
 * of the row. The frame stays mounted as long as Discover has requests,
 * so an Undo outlives the last card.
 */
function RequestsRow<
  Item extends Pick<AdminRequestItem, "id" | "state">,
>(props: {
  heading: JSX.Element
  /** The admin's cards, a row taller, for the skeletons. */
  admin?: boolean
  items: readonly Item[] | undefined
  retry?: () => void
  /** Shown in the row when the list is empty, if it has one. */
  empty?: JSX.Element
  children: (item: Item) => JSX.Element
}) {
  const hidden = useHiddenRequests()
  const shown = createMemo(() =>
    props.items?.filter((item) => !isHidden(hidden(), item)),
  )
  const title = tr("requests.recent")
  return (
    <Show when={props.empty !== undefined || shown()?.length !== 0}>
      <Rail title={title} heading={props.heading}>
        <Switch>
          <Match when={props.retry}>
            {(retry) => <RailFailed onRetry={() => retry()()} />}
          </Match>
          <Match when={shown()?.length === 0}>{props.empty}</Match>
          <Match when={shown()}>
            {(items) => (
              <For
                each={items().slice(0, RAIL_CARDS)}
                keyed={(item) => item.id}
              >
                {(item) => <RequestItem>{props.children(item())}</RequestItem>}
              </For>
            )}
          </Match>
          <Match when>
            <Repeat count={3}>
              {() => (
                <RequestItem>
                  <RequestCardSkeleton admin={props.admin} />
                </RequestItem>
              )}
            </Repeat>
          </Match>
        </Switch>
      </Rail>
    </Show>
  )
}

function RecentHeading(props: { waiting?: () => number }) {
  return (
    <>
      <span class="truncate">{tr("requests.recent")}</span>
      <Show when={(props.waiting?.() ?? 0) > 0}>
        <span
          aria-hidden="true"
          class="bg-primary size-2 shrink-0 rounded-full"
        />
        <span class="sr-only">
          {tr("requests.menuWaiting", { count: props.waiting?.() ?? 0 })}
        </span>
      </Show>
      <Icon
        icon={ChevronRight}
        class="text-muted-foreground group-hover/heading:text-foreground size-5 shrink-0 transition-colors"
      />
    </>
  )
}

/** An empty queue keeps Discover's way into the requests page. */
function EmptyQueue() {
  return (
    <RequestItem>
      <div class="bg-foreground/[0.04] flex min-h-28 flex-col justify-center rounded-xl px-4 py-3">
        <span class="text-foreground text-sm font-medium">
          {tr("requests.empty.none")}
        </span>
        <span class="text-muted-foreground mt-1 text-xs">
          {tr("requests.empty.noneHint")}
        </span>
      </div>
    </RequestItem>
  )
}

/**
 * The queue's latest, from its own stream, in the order of its lists:
 * waiting, needs attention, on the way, then the latest done. A request
 * answered moves on at once, so nothing here needs a reload. Its heading
 * leads to the requests page.
 */
function QueueRequests() {
  const queue = useRequestQueue(() => true)
  const hidden = useHiddenRequests()
  const waiting = () => needsYou(queue()?.data, hidden())
  const items = createMemo(() => {
    const data = queue()?.data
    return data ? [...workItems(data), ...data.done] : undefined
  })
  return (
    <RequestsRow
      heading={
        <Link to="/requests" class={railHeadingLink}>
          <RecentHeading waiting={waiting} />
        </Link>
      }
      items={items()}
      admin
      empty={<EmptyQueue />}
      retry={
        queue()?.isError && !queue()?.data
          ? () => void queue()?.refetch()
          : undefined
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
  const context = authed.useRouteContext()
  const mine = useFollowedQuery(() => ({
    ...orpc.requests.mineLive.experimental_liveOptions({
      input: { limit: RAIL_CARDS },
    }),
    ...liveQuery,
  }))
  return (
    <RequestsRow
      heading={
        <Link
          to="/profiles/$username/asked"
          params={{ username: context().user.username }}
          class={railHeadingLink}
        >
          <RecentHeading />
        </Link>
      }
      items={mine()?.data?.items}
      retry={
        mine()?.isError && !mine()?.data
          ? () => void mine()?.refetch()
          : undefined
      }
    >
      {(item) => <OwnRequest item={item} />}
    </RequestsRow>
  )
}

/**
 * A request in the queue: who asked, its state, its problem if any, the
 * menu with the rest, and what the row lets an admin do about it: Add and
 * Decline while it waits, Retry once sending it failed. The rest is on
 * the requests page.
 */
function QueueRequest(props: { item: AdminRequestItem }) {
  const context = authed.useRouteContext()
  const may = createMemo(() => queueActions(context().user))
  const retry = useMutation(() => ({
    mutationFn: () => client.admin.requests.retry({ id: props.item.id }),
    onSuccess: () =>
      toast.success(tr("requests.retried", { name: props.item.title.name })),
    onError: (error) =>
      toast.error(tr("requests.retryFailed", { name: props.item.title.name }), {
        description: errorMessage(error),
      }),
  }))
  const hold = useRequestActionsStore((state) => state.hold)
  return (
    <RequestCard
      item={props.item}
      state={
        <RequestStateBadge
          state={props.item.state}
          progress={requestProgress(props.item)}
          detail={queueDetail(props.item)}
        />
      }
      who={<Askers item={props.item} />}
      menu={
        <CardMenu
          item={props.item}
          onAdd={() => hold()(addAction([props.item]))}
          may={may()}
        />
      }
      actions={
        <Switch>
          <Match
            when={
              props.item.state === "waiting" && (may().approve || may().decline)
            }
          >
            <AdminAnswer item={props.item} look="fill" />
          </Match>
          <Match when={props.item.state === "needsAttention" && may().retry}>
            <Button
              variant="outline"
              size="sm"
              disabled={retry.isPending}
              aria-label={tr("requests.retryNamed", {
                name: props.item.title.name,
              })}
              onClick={() => retry.mutate()}
            >
              <Icon icon={RotateCw} />
              {tr("requests.retry")}
            </Button>
          </Match>
        </Switch>
      }
    />
  )
}
