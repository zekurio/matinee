import { Button } from "@matinee/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { createFileRoute, Navigate } from "@tanstack/react-router"
import { ClockIcon, FilterIcon } from "lucide-react"
import { useState } from "react"

import { ShowMore } from "@/components/library/library-states"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { OwnRequest } from "@/components/requests/own-request"
import {
  RequestCardSkeleton,
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
import { filterInput } from "@/components/requests/request-queue"
import { tr } from "@/i18n"
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
  const { user } = Route.useRouteContext()
  const { username } = Route.useParams()
  const own = username === user.username
  const navigate = Route.useNavigate()
  const filter = requestFilter(Route.useSearch())
  const setFilter = (next: RequestFilter) =>
    void navigate({ search: searchFor(next), replace: true })
  const filtered = filterCount(filter) > 0
  useDocumentTitle(tr("ask.mine.title"))
  // A Cancel held for Undo goes out as the page is left.
  useSendHeldOnLeave()
  const hidden = useHiddenRequests()

  const first = useQuery({
    ...orpc.requests.mineLive.experimental_liveOptions({
      input: { limit: PAGE, ...filterInput(filter) },
    }),
    ...liveQuery,
    enabled: own,
  })
  const after = first.data?.nextCursor ?? null
  const [more, setMore] = useState(false)
  const older = useInfiniteQuery({
    ...orpc.requests.mine.infiniteOptions({
      input: (cursor: string) => ({
        cursor,
        limit: PAGE,
        ...filterInput(filter),
      }),
      initialPageParam: after ?? "",
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
    enabled: own && more && after !== null,
  })

  const firstItems = first.data?.items ?? []
  const seen = new Set(firstItems.map((item) => item.id))
  const items = [
    ...firstItems,
    ...(more
      ? (older.data?.pages.flatMap((page) => page.items) ?? [])
      : []
    ).filter((item) => !seen.has(item.id)),
  ].filter((item) => !isHidden(hidden, item))
  const hasMore = more ? older.hasNextPage : after !== null

  if (!own) {
    return <Navigate to="/profiles/$username" params={{ username }} replace />
  }
  return (
    <div className="pb-6">
      <PageHeader
        title={tr("ask.mine.title")}
        actions={<RequestFilterPanel filter={filter} onChange={setFilter} />}
        phoneActions={
          <RequestFilterPanel filter={filter} onChange={setFilter} compact />
        }
        className="mb-5 md:mb-6"
      />
      {first.isPending ? (
        <div className={requestGrid}>
          {[0, 1, 2, 3].map((index) => (
            <RequestCardSkeleton key={index} />
          ))}
        </div>
      ) : first.isError && !first.data ? (
        <p className="text-muted-foreground text-sm">
          {tr("ask.mine.error", { error: errorMessage(first.error) })}
        </p>
      ) : items.length === 0 && filtered ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilterIcon />
            </EmptyMedia>
            <EmptyTitle>{tr("requests.filter.none")}</EmptyTitle>
            <EmptyDescription>
              {tr("requests.filter.noneHint")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => setFilter({ states: [] })}>
              {tr("library.clearFilters")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : items.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClockIcon />
            </EmptyMedia>
            <EmptyTitle>{tr("ask.mine.empty")}</EmptyTitle>
            <EmptyDescription>{tr("ask.mine.emptyHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ul aria-label={tr("ask.mine.title")} className={requestGrid}>
            {items.map((item) => (
              <li key={item.id} className="min-w-0">
                <OwnRequest item={item} size="wide" />
              </li>
            ))}
          </ul>
          {hasMore && (
            <ShowMore
              fetching={more && (older.isPending || older.isFetchingNextPage)}
              failed={older.isError}
              onClick={() =>
                more ? void older.fetchNextPage() : setMore(true)
              }
              className="mt-8"
            />
          )}
        </>
      )}
    </div>
  )
}
