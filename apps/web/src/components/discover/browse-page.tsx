import { ORPCError } from "@matinee/client"
import type { CatalogFilters, CatalogSort, TitleKind } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  CloudOffIcon,
  RotateCwIcon,
  SearchXIcon,
  SparklesIcon,
} from "lucide-react"
import { type ReactNode, useState } from "react"

import { refKey, useLiveAvailability } from "@/components/catalog/catalog-data"
import { PosterGridSkeleton } from "@/components/library/library-states"
import { SortMenu, SortSelect } from "@/components/library/list-controls"
import { posterGrid } from "@/components/media-item"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { usePhone } from "@/components/sheet-menu"
import { tr } from "@/i18n"
import { errorMessage, orpc } from "@/lib/rpc"
import { useDismissedStore } from "@/stores/recommendations"

import { BrowseCard, cardDetail, recommends } from "./browse-card"
import { BrowseFilterPanel } from "./browse-filters"
import {
  type Browse,
  browseFrom,
  type BrowseOptions,
  type BrowseSearch,
  filterCount,
  NO_FILTERS,
  searchFor,
  sortFits,
} from "./browse-params"
import { useOnScreenCards } from "./discover-live"
import { DiscoverEmpty, DiscoverOff } from "./discover-rails"
import { CardSkeletons, Retry, unique, useNextPage } from "./grid-parts"

/*
 * All of TMDB's movies or shows, or the viewer's recommendations of
 * them, narrowed by filters and in the order the viewer picks, as a grid
 * that loads more as it scrolls. Each of Discover's rows opens here with
 * its own filters and sort. Titles that are here are the library's cards
 * and play; the rest ask, as on Discover.
 */

export function browseOptionsQuery(kind: TitleKind) {
  return orpc.discover.browseOptions.queryOptions({ input: { kind } })
}

function browseQuery(kind: TitleKind, browse: Browse) {
  return orpc.discover.browse.infiniteOptions({
    input: (page: number) => ({ kind, ...browse, page }),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
  })
}

/** The sorts the server offers, in its order, worded. */
function sortOptions(options: BrowseOptions) {
  return options.sorts.map((value) => ({
    value,
    label: tr(SORT_WORDS[value]),
  }))
}

const SORT_WORDS = {
  popular: "discover.browse.sort.popular",
  forYou: "discover.browse.sort.forYou",
  votes: "discover.browse.sort.votes",
  scoreHigh: "filters.sort.scoreHigh",
  scoreLow: "filters.sort.scoreLow",
  newest: "filters.sort.newest",
  oldest: "filters.sort.oldest",
  nameAsc: "filters.sort.nameAsc",
  nameDesc: "filters.sort.nameDesc",
} as const satisfies Record<CatalogSort, string>

export function BrowsePage({
  kind,
  search,
  navigate,
}: {
  kind: TitleKind
  search: BrowseSearch
  /** Writes the browse's search params, in place of the current entry. */
  navigate: (search: BrowseSearch) => void
}) {
  const title = tr(`discover.browse.${kind}`)
  useDocumentTitle(title)
  const options = useQuery(browseOptionsQuery(kind))
  const header = <PageHeader title={title} />
  if (options.isPending) {
    return (
      <div aria-hidden>
        <div className="mb-4 flex h-8 items-center md:mb-6 md:h-10">
          <Skeleton className="h-7 w-56" />
        </div>
        <PosterGridSkeleton />
      </div>
    )
  }
  if (options.isError) {
    return (
      <>
        {header}
        <DiscoverEmpty
          icon={<CloudOffIcon />}
          title={tr("discover.browse.optionsFailed")}
          description={tr("discover.failedHint")}
        >
          <Button variant="outline" onClick={() => void options.refetch()}>
            <RotateCwIcon />
            {tr("discover.retry")}
          </Button>
        </DiscoverEmpty>
      </>
    )
  }
  if (!options.data.enabled) {
    return (
      <>
        {header}
        <DiscoverOff />
      </>
    )
  }
  return (
    <BrowseGrid
      kind={kind}
      title={title}
      options={options.data}
      browse={browseFrom(search, options.data)}
      navigate={(browse) => navigate(searchFor(browse))}
    />
  )
}

function BrowseGrid({
  kind,
  title,
  options,
  browse,
  navigate,
}: {
  kind: TitleKind
  title: string
  options: BrowseOptions
  browse: Browse
  navigate: (browse: Browse) => void
}) {
  const [panelOpen, setPanelOpen] = useState(false)
  const queryClient = useQueryClient()
  const hidden = useDismissedStore((state) => state.hidden)
  const dismiss = useDismissedStore((state) => state.dismiss)
  const recommended = recommends(browse)
  const titles = useInfiniteQuery({
    ...browseQuery(kind, browse),
    // The last answer stays, dimmed, while a change of filter loads.
    placeholderData: keepPreviousData,
  })
  const rows = unique(
    titles.data?.pages.flatMap((page) => page.items) ?? [],
  ).filter((item) => !recommended || !hidden.has(refKey(item.ref)))
  const first = titles.data?.pages[0]
  const stale = titles.data?.pages.some((page) => page.stale) ?? false
  const { track, start, end } = useOnScreenCards()
  // Library cards play; only the rest can change.
  const live = useLiveAvailability(
    rows
      .slice(start, end)
      .filter((item) => !item.title)
      .map((item) => ({ ref: item.ref })),
  )
  const more = useNextPage({
    enabled:
      titles.hasNextPage &&
      !titles.isFetchingNextPage &&
      !titles.isFetchNextPageError &&
      !titles.isPlaceholderData,
    fetch: titles.fetchNextPage,
    pages: titles.data?.pages.length ?? 0,
  })

  // Best match goes with the recommendations, and back to popular without them.
  const withFilters = (filters: CatalogFilters) =>
    navigate({
      filters,
      sort: sortFits(browse.sort, filters.recommended)
        ? browse.sort
        : "popular",
    })
  const change = (patch: Partial<CatalogFilters>) =>
    withFilters({ ...browse.filters, ...patch })
  const setSort = (sort: CatalogSort) => navigate({ ...browse, sort })
  const clear = () => withFilters(NO_FILTERS)
  const filtered = filterCount(browse.filters) > 0
  const sorts = sortOptions(options).filter(({ value }) =>
    sortFits(value, browse.filters.recommended),
  )
  // One panel, in the bar that shows; both share its open state.
  const phone = usePhone()
  const panel = (compact: boolean) => (
    <BrowseFilterPanel
      options={options}
      filters={browse.filters}
      change={change}
      open={panelOpen}
      onOpenChange={setPanelOpen}
      compact={compact}
    />
  )

  return (
    <div>
      <PageHeader
        title={title}
        actions={
          !phone && (
            <>
              {panel(false)}
              <SortSelect
                options={sorts}
                value={browse.sort}
                onChange={setSort}
              />
            </>
          )
        }
        phoneActions={
          phone && (
            <>
              {panel(true)}
              <SortMenu
                options={sorts}
                value={browse.sort}
                onChange={setSort}
              />
            </>
          )
        }
      />
      {stale && (
        <Note icon={<CloudOffIcon aria-hidden className="size-4 shrink-0" />}>
          {tr("discover.stale")}
        </Note>
      )}
      {titles.isPending ? (
        <PosterGridSkeleton />
      ) : rows.length === 0 && titles.isError && turnedDown(titles.error) ? (
        // A link from before the server stopped offering one of its filters.
        <DiscoverEmpty
          icon={<SearchXIcon />}
          title={errorMessage(titles.error)}
          description=""
        >
          <Button variant="outline" onClick={clear}>
            {tr("library.clearFilters")}
          </Button>
        </DiscoverEmpty>
      ) : rows.length === 0 && titles.isError ? (
        <Retry
          message={tr("discover.browse.failed")}
          onRetry={() => void titles.refetch()}
        />
      ) : rows.length === 0 && recommended ? (
        <DiscoverEmpty
          icon={<SparklesIcon />}
          title={tr("discover.browse.forYouNone")}
          description={tr("discover.browse.forYouHint")}
        >
          {filtered && (
            <Button variant="outline" onClick={clear}>
              {tr("library.clearFilters")}
            </Button>
          )}
        </DiscoverEmpty>
      ) : rows.length === 0 ? (
        <DiscoverEmpty
          icon={<SearchXIcon />}
          title={
            filtered
              ? tr(`discover.browse.none.${kind}`)
              : tr("discover.browse.nothing")
          }
          description={filtered ? tr("filters.noneHint") : ""}
        >
          {filtered && (
            <Button variant="outline" onClick={clear}>
              {tr("library.clearFilters")}
            </Button>
          )}
        </DiscoverEmpty>
      ) : (
        <>
          <ul
            aria-busy={titles.isPlaceholderData}
            className={cn(
              posterGrid,
              "transition-opacity duration-200 motion-reduce:transition-none",
              titles.isPlaceholderData && "opacity-50",
            )}
          >
            {rows.map((item, index) => (
              <li key={refKey(item.ref)} ref={track(index)}>
                <BrowseCard
                  item={item}
                  live={live}
                  detail={cardDetail(first?.detail ?? null, item)}
                  dismiss={
                    recommended
                      ? () => dismiss(queryClient, item.ref, item.name)
                      : undefined
                  }
                />
              </li>
            ))}
            {titles.isFetchingNextPage && <CardSkeletons />}
          </ul>
          <div ref={more} aria-hidden className="h-px" />
          {titles.isFetchNextPageError ? (
            <Retry
              message={tr("discover.moreFailed")}
              onRetry={() => void titles.fetchNextPage()}
            />
          ) : (
            !titles.hasNextPage &&
            (titles.data?.pages.length ?? 0) > 1 && (
              <p className="text-muted-foreground mt-10 text-center text-sm">
                {tr("discover.end")}
              </p>
            )
          )}
        </>
      )}
    </div>
  )
}

/** The server refused the filters, which only a hand-made or old link gets. */
function turnedDown(error: Error): boolean {
  return error instanceof ORPCError && error.status === 400
}

/** A line above the grid about the whole list. */
function Note({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="text-muted-foreground mb-5 flex items-center gap-2 text-sm">
      {icon}
      {children}
    </p>
  )
}
