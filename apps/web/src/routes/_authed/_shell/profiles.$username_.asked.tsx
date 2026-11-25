import { useInfiniteQuery } from "@tanstack/solid-query"
import { createFileRoute, Navigate } from "@tanstack/solid-router"
import { Clock, Filter } from "lucide"
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"

import { pageGutter } from "@/components/app-shell"
import { ShowMore } from "@/components/library/library-states"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { OwnRequest } from "@/components/requests/own-request"
import {
  RequestGridSkeleton,
  requestGrid,
} from "@/components/requests/request-card"
import {
  filterCount,
  type RequestFilter,
  RequestFilterPanel,
  RequestSearch,
  requestFilter,
  searchFor,
} from "@/components/requests/request-filter"
import {
  filterInput,
  useFollowedQuery,
} from "@/components/requests/request-queue"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/kit/empty"
import { Icon } from "@/kit/icon"
import { errorMessage, liveQuery, orpc } from "@/lib/rpc"
import {
  isHidden,
  useHiddenRequests,
  useSendHeldOnLeave,
} from "@/stores/request-actions"

/** Cards a page of the list brings. */
const PAGE = 40

export const Route = createFileRoute(
  "/_authed/_shell/profiles/$username_/asked",
)({
  validateSearch: RequestSearch,
  component: AskedPage,
})

/**
 * Everything the viewer asked for or follows, in the order the server
 * gives it: in progress first, then finished, each newest first, kept
 * to the states and kind the Filter panel has on. Every card shows its
 * state, and Cancel while the server allows it. The first
 * page follows the server live; older ones, finished by then, load as
 * they're read. Only ever your own: another person's address leads to
 * their profile.
 */
function AskedPage() {
  const context = Route.useRouteContext()
  const params = Route.useParams()
  const own = () => params().username === context().user.username
  return (
    <Show
      when={own()}
      fallback={
        <Navigate
          to="/profiles/$username"
          params={{ username: params().username }}
          replace
        />
      }
    >
      <AskedList />
    </Show>
  )
}

function AskedList() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  // Equal filters are one filter, so the list asks again only for a new one.
  const filter = createMemo(() => requestFilter(search()), {
    equals: (a, b) =>
      a.kind === b.kind && a.states.join(",") === b.states.join(","),
  })
  const setFilter = (next: RequestFilter) =>
    void navigate({ search: searchFor(next), replace: true })
  const filtered = () => filterCount(filter()) > 0
  useDocumentTitle(() => tr("ask.mine.title"))
  // A Cancel held for Undo goes out as the page is left.
  useSendHeldOnLeave()
  const hidden = useHiddenRequests()

  const first = useFollowedQuery(() => ({
    ...orpc.requests.mineLive.experimental_liveOptions({
      input: { limit: PAGE, ...filterInput(filter()) },
    }),
    ...liveQuery,
  }))
  const firstData = () => first()?.data
  const after = () => firstData()?.nextCursor ?? null
  const [more, setMore] = createSignal(false)
  const older = useInfiniteQuery(() => {
    // The live page's cursor and the filter only once older pages are
    // wanted, so their changes don't rebuild a query that isn't running.
    // Read here, where it's tracked: `input` runs as each page loads.
    const start = more() ? after() : null
    const kept = start === null ? {} : filterInput(filter())
    return {
      ...orpc.requests.mine.infiniteOptions({
        input: (cursor: string) => ({ cursor, limit: PAGE, ...kept }),
        initialPageParam: start ?? "",
        getNextPageParam: (last) => last.nextCursor ?? undefined,
      }),
      enabled: start !== null,
    }
  })

  const items = createMemo(() => {
    const firstItems = firstData()?.items ?? []
    const seen = new Set(firstItems.map((item) => item.id))
    const olderItems =
      more() && !older.isPending
        ? (older.data?.pages.flatMap((page) => page.items) ?? [])
        : []
    return [
      ...firstItems,
      ...olderItems.filter((item) => !seen.has(item.id)),
    ].filter((item) => !isHidden(hidden(), item))
  })
  const hasMore = () => (more() ? older.hasNextPage : after() !== null)

  return (
    <div class={[pageGutter, "pb-6 sm:pt-8"]}>
      <PageHeader
        title={tr("ask.mine.title")}
        actions={<RequestFilterPanel filter={filter()} onChange={setFilter} />}
        phoneActions={
          <RequestFilterPanel filter={filter()} onChange={setFilter} compact />
        }
        class="mb-5 md:mb-6"
      />
      <Switch>
        <Match when={!first() || first()?.isPending}>
          <RequestGridSkeleton />
        </Match>
        <Match when={!firstData() && first()?.error}>
          {(error) => (
            <p class="text-muted-foreground text-sm">
              {tr("ask.mine.error", { error: errorMessage(error()) })}
            </p>
          )}
        </Match>
        <Match when={items().length === 0 && filtered()}>
          <Empty class="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icon icon={Filter} />
              </EmptyMedia>
              <EmptyTitle>{tr("requests.filter.none")}</EmptyTitle>
              <EmptyDescription>
                {tr("requests.filter.noneHint")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                onClick={() => setFilter({ states: [] })}
              >
                {tr("library.clearFilters")}
              </Button>
            </EmptyContent>
          </Empty>
        </Match>
        <Match when={items().length === 0}>
          <Empty class="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icon icon={Clock} />
              </EmptyMedia>
              <EmptyTitle>{tr("ask.mine.empty")}</EmptyTitle>
              <EmptyDescription>{tr("ask.mine.emptyHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Match>
        <Match when={true}>
          <ul aria-label={tr("ask.mine.title")} class={requestGrid}>
            <For each={items()} keyed={(item) => item.id}>
              {(item) => (
                <li class="min-w-0">
                  <OwnRequest item={item()} size="wide" />
                </li>
              )}
            </For>
          </ul>
          <Show when={hasMore()}>
            <ShowMore
              fetching={more() && (older.isPending || older.isFetchingNextPage)}
              paused={false}
              failed={older.isError}
              onLoad={() => {
                if (!more()) setMore(true)
                else if (!older.isFetching) void older.fetchNextPage()
              }}
            />
          </Show>
        </Match>
      </Switch>
    </div>
  )
}
