import { ORPCError } from "@matinee/client"
import type {
  CatalogBrowsePage,
  CatalogFilters,
  CatalogSort,
  TitleKind,
} from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { Button } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query"
import {
  CloudOffIcon,
  ListFilterIcon,
  RotateCwIcon,
  SearchXIcon,
} from "lucide-react"
import { type ReactNode, useState } from "react"

import { CatalogCard } from "@/components/catalog/catalog-card"
import {
  type LiveEntry,
  liveEntry,
  refKey,
  useLiveAvailability,
} from "@/components/catalog/catalog-data"
import { PosterGridSkeleton } from "@/components/library/library-states"
import {
  FilterChips,
  SortMenu,
  SortSelect,
} from "@/components/library/list-controls"
import { PosterCard, posterGrid } from "@/components/media-item"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { usePhone } from "@/components/sheet-menu"
import { tr } from "@/i18n"
import { formatDate, formatScore, parseDay } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"

import { activeFilters, BrowseFilterPanel } from "./browse-filters"
import {
  type Browse,
  browseFrom,
  type BrowseOptions,
  type BrowseSearch,
  NO_FILTERS,
  searchFor,
} from "./browse-params"
import { useOnScreenCards } from "./discover-live"
import { DiscoverEmpty, DiscoverOff } from "./discover-rails"
import { CardSkeletons, Retry, unique, useNextPage } from "./grid-parts"

/*
 * All of TMDB's movies or shows, narrowed by filters and in the order the
 * viewer picks, as a grid that loads more as it scrolls. Titles that are
 * here are the library's cards and play; the rest ask, as on Discover.
 */

type Entry = t.infer<typeof CatalogBrowsePage>["items"][number]

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
  const titles = useInfiniteQuery({
    ...browseQuery(kind, browse),
    // The last answer stays, dimmed, while a change of filter loads.
    placeholderData: keepPreviousData,
  })
  const rows = unique(titles.data?.pages.flatMap((page) => page.items) ?? [])
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

  const change = (patch: Partial<CatalogFilters>) =>
    navigate({ ...browse, filters: { ...browse.filters, ...patch } })
  const setSort = (sort: CatalogSort) => navigate({ ...browse, sort })
  const clear = () => navigate({ ...browse, filters: NO_FILTERS })
  const chips = activeFilters(browse.filters, options, change)
  const sorts = sortOptions(options)
  // One panel, in the bar that shows; both share its open state.
  const phone = usePhone()
  const panel = (compact: boolean) => (
    <BrowseFilterPanel
      kind={kind}
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
      <FilterChips active={chips} clear={clear} />
      {first?.voteFloor != null && (
        <Note
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPanelOpen(true)}
            >
              <ListFilterIcon />
              {tr("discover.browse.floorChange")}
            </Button>
          }
        >
          {tr(
            browse.sort === "scoreHigh" || browse.sort === "scoreLow"
              ? "discover.browse.floorScore"
              : "discover.browse.floorList",
            { count: first.voteFloor },
          )}
        </Note>
      )}
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
      ) : rows.length === 0 ? (
        <DiscoverEmpty
          icon={<SearchXIcon />}
          title={
            chips.length > 0
              ? tr(`discover.browse.none.${kind}`)
              : tr("discover.browse.nothing")
          }
          description={chips.length > 0 ? tr("filters.noneHint") : ""}
        >
          {chips.length > 0 && (
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

/** What a card says under its name, as the server says the list calls for. */
function cardDetail(
  detail: t.infer<typeof CatalogBrowsePage>["detail"],
  item: Entry,
): string | undefined {
  if (detail === "score" && item.score !== null) {
    const score = formatScore(item.score)
    return item.year
      ? tr("discover.browse.card.score", { score, year: String(item.year) })
      : tr("discover.browse.card.scoreOnly", { score })
  }
  if (detail === "releaseDate" && item.releaseDate) {
    const day = parseDay(item.releaseDate)
    if (day) return formatDate(day)
  }
  // Every card is the same kind, so the year alone.
  return item.year ? String(item.year) : undefined
}

/**
 * A title the viewer can watch is the library's card, with Play. The
 * rest are catalog cards with what the stream says now.
 */
function BrowseCard({
  item,
  live,
  detail,
}: {
  item: Entry
  live: LiveEntry[] | undefined
  detail: string | undefined
}) {
  const availability =
    liveEntry(live, item.ref)?.availability ?? item.availability
  if (
    item.title &&
    availability.state === "here" &&
    availability.libraryTitleId === item.title.id
  )
    return <PosterCard title={item.title} detail={detail} />
  return (
    <CatalogCard title={item} availability={availability} detail={detail} />
  )
}

/** A line above the grid about the whole list. */
function Note({
  icon,
  action,
  children,
}: {
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="text-muted-foreground mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <p className="flex items-center gap-2">
        {icon}
        {children}
      </p>
      {action}
    </div>
  )
}
