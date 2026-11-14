import { t } from "@matinee/contracts/schema"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { cn } from "@matinee/ui/lib/utils"
import { useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, Navigate } from "@tanstack/react-router"
import { ClockIcon } from "lucide-react"

import { AskedCard, DeclinedNote, useAskedLive } from "@/components/asked/asked"
import { chipClass, chipRow } from "@/components/chips"
import {
  PosterGridSkeleton,
  ShowMore,
} from "@/components/library/library-states"
import { posterGrid } from "@/components/media-item"
import {
  belowHeader,
  PageHeader,
  useDocumentTitle,
} from "@/components/page-header"
import { tr } from "@/i18n"
import { errorMessage, orpc } from "@/lib/rpc"

const FILTERS = ["all", "inProgress"] as const

/** Everything is the default, so the URL leaves it out. */
const AskedSearch = t.object({
  filter: t.enum(FILTERS).exclude(["all"]).optional().catch(undefined),
})

export const Route = createFileRoute(
  "/_authed/_shell/profiles/$username_/asked",
)({
  validateSearch: AskedSearch,
  component: AskedPage,
})

/**
 * Everything the viewer asked for or follows, newest first, as a grid of
 * the same cards Home's rail has. Declined titles say why under their
 * card. Only ever your own: another person's address leads to their
 * profile.
 */
function AskedPage() {
  const { user } = Route.useRouteContext()
  const { username } = Route.useParams()
  const { filter = "all" } = Route.useSearch()
  const navigate = Route.useNavigate()
  useDocumentTitle(tr("ask.mine.title"))
  const mine = useInfiniteQuery({
    ...orpc.requests.mine.infiniteOptions({
      input: (cursor: string | undefined) => ({ filter, cursor, limit: 40 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
    enabled: username === user.username,
  })
  const items = mine.data?.pages.flatMap((page) => page.items) ?? []
  const live = useAskedLive(items.slice(0, 100))

  if (username !== user.username) {
    return <Navigate to="/profiles/$username" params={{ username }} replace />
  }
  return (
    <div className="pb-6">
      <PageHeader title={tr("ask.mine.title")} />
      <div
        role="group"
        aria-label={tr("ask.mine.filter")}
        className={cn(chipRow, belowHeader)}
      >
        {FILTERS.map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={entry === filter}
            onClick={() =>
              void navigate({
                search: { filter: entry === "all" ? undefined : entry },
                replace: true,
              })
            }
            className={chipClass(entry === filter)}
          >
            {entry === "all" ? tr("ask.mine.all") : tr("ask.mine.inProgress")}
          </button>
        ))}
      </div>
      <div>
        {mine.isPending ? (
          <PosterGridSkeleton />
        ) : mine.isError ? (
          <p className="text-muted-foreground text-sm">
            {tr("ask.mine.error", { error: errorMessage(mine.error) })}
          </p>
        ) : items.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClockIcon />
              </EmptyMedia>
              <EmptyTitle>
                {filter === "all"
                  ? tr("ask.mine.empty")
                  : tr("ask.mine.emptyInProgress")}
              </EmptyTitle>
              {filter === "all" && (
                <EmptyDescription>{tr("ask.mine.emptyHint")}</EmptyDescription>
              )}
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ul className={posterGrid}>
              {items.map((item) => (
                <li key={item.id}>
                  <AskedCard
                    item={item}
                    live={live}
                    fresh={filter === "inProgress"}
                  />
                  <DeclinedNote item={item} />
                </li>
              ))}
            </ul>
            {mine.hasNextPage && (
              <ShowMore
                fetching={mine.isFetchingNextPage}
                onClick={() => void mine.fetchNextPage()}
                className="mt-8"
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
