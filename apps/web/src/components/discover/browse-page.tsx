import { ORPCError } from "@matinee/client"
import type {
  CatalogBrowsePage,
  CatalogFilters,
  CatalogSort,
  TitleKind,
} from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  type InfiniteData,
  InfiniteQueryObserver,
  type InfiniteQueryObserverResult,
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/solid-query"
import { CloudOff, RotateCw, SearchX, Sparkles } from "lucide"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  from,
  Match,
  onSettled,
  Show,
  Switch,
  untrack,
} from "solid-js"

import { refKey, useLiveAvailability } from "@/components/catalog/catalog-data"
import {
  type Browse,
  browseFrom,
  type BrowseOptions,
  type BrowseSearch,
  filterCount,
  NO_FILTERS,
  searchFor,
  sortFits,
} from "@/components/discover/browse-params"
import {
  posterGrid,
  PosterGridSkeleton,
} from "@/components/library/library-states"
import { SortMenu } from "@/components/library/list-controls"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { WindowedGrid } from "@/components/windowed-grid"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/kit/select"
import { Skeleton } from "@/kit/skeleton"
import { errorMessage, orpc } from "@/lib/rpc"
import { isPhone } from "@/lib/viewport"
import { useDismissedStore } from "@/stores/recommendations"

import { BrowseCard, cardDetail, recommends } from "./browse-card"
import { BrowseFilterPanel } from "./browse-filters"
import { DiscoverEmpty, DiscoverOff } from "./discover-rails"
import { CardSkeletons, Retry, unique, useNextPage } from "./grid-parts"

/*
 * All of TMDB's movies or shows, or the viewer's recommendations of
 * them, narrowed by filters and in the order the viewer picks, as a grid
 * that loads more as it scrolls. Each of Discover's rows opens here with
 * its own filters and sort. Titles that are here are the library's cards
 * and play; the rest ask, as on Discover.
 */

type BrowsePageData = t.infer<typeof CatalogBrowsePage>
type Results = InfiniteQueryObserverResult<InfiniteData<BrowsePageData, number>>

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

/** The sorts the server offers, in its order, worded. */
function sortOptions(options: BrowseOptions) {
  return options.sorts.map((value) => ({
    value,
    label: tr(SORT_WORDS[value]),
  }))
}

export function BrowsePage(props: {
  kind: TitleKind
  search: BrowseSearch
  /** Writes the browse's search params, in place of the current entry. */
  navigate: (search: BrowseSearch) => void
}) {
  const title = () => tr(`discover.browse.${props.kind}`)
  useDocumentTitle(title)
  const options = useQuery(() => browseOptionsQuery(props.kind))
  return (
    <Switch>
      <Match when={options.isPending}>
        <div aria-hidden="true">
          <div class="mb-4 flex h-8 items-center md:mb-6 md:h-10">
            <Skeleton class="h-7 w-56" />
          </div>
          <PosterGridSkeleton />
        </div>
      </Match>
      <Match when={options.isError}>
        <PageHeader title={title()} />
        <DiscoverEmpty
          icon={<Icon icon={CloudOff} />}
          title={tr("discover.browse.optionsFailed")}
          description={tr("discover.failedHint")}
        >
          <Button variant="outline" onClick={() => void options.refetch()}>
            <Icon icon={RotateCw} />
            {tr("discover.retry")}
          </Button>
        </DiscoverEmpty>
      </Match>
      <Match when={options.isSuccess && !options.data.enabled}>
        <PageHeader title={title()} />
        <DiscoverOff />
      </Match>
      <Match when={options.isSuccess && options.data}>
        {(offered) => (
          <BrowseGrid
            kind={props.kind}
            title={title()}
            options={offered()}
            browse={browseFrom(props.search, offered())}
            navigate={(browse) => props.navigate(searchFor(browse))}
          />
        )}
      </Match>
    </Switch>
  )
}

/**
 * A browse's pages, read through one observer that moves to each new
 * browse, so the last answer stays on screen, dimmed, while a change of
 * filter loads. The options are read in an effect, never while a memo
 * computes: an observer notifies its subscribers as it moves, and a write
 * from inside that computation is one Solid refuses. The subscription in
 * `from` is the memo's own source, so each result arrives as the observer
 * has it.
 */
function useBrowseResults(kind: () => TitleKind, browse: () => Browse) {
  const queryClient = useQueryClient()
  const options = () => ({
    ...browseQuery(kind(), browse()),
    placeholderData: keepPreviousData,
  })
  const observer: InfiniteQueryObserver<
    BrowsePageData,
    Error,
    InfiniteData<BrowsePageData, number>,
    readonly unknown[],
    number
  > = new InfiniteQueryObserver(queryClient, untrack(options))
  createEffect(options, (next) => observer.setOptions(next))
  return createMemo(() =>
    from<Results>((next) => {
      next(observer.getCurrentResult())
      return observer.subscribe(next)
    }),
  )
}

/**
 * Which cards of the grid are in the page, which the windowed grid keeps
 * to the rows near the window, in blocks of twelve so scrolling within
 * them doesn't open the stream of what changes again. It moves once the
 * scrolling rests, so a fast scroll opens one stream, not one a block.
 * `[start, end)`.
 */
function useFollowedCards() {
  const BLOCK = 12
  const REST_MS = 300
  const mounted = new Set<number>()
  const [range, setRange] = createSignal<[number, number]>([0, 0], {
    equals: (a, b) => a[0] === b[0] && a[1] === b[1],
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const settle = () => {
    timer = undefined
    if (mounted.size === 0) return
    const low = Math.min(...mounted)
    const high = Math.max(...mounted)
    setRange((old) =>
      low >= old[0] && high < old[1]
        ? old
        : [
            Math.floor(low / BLOCK) * BLOCK,
            (Math.floor(high / BLOCK) + 1) * BLOCK,
          ],
    )
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(settle, REST_MS)
  }
  onSettled(() => () => clearTimeout(timer))
  /** Call under each card's owner, with its place in the grid. */
  const track = (index: () => number) => {
    onSettled(() => {
      const at = index()
      mounted.add(at)
      schedule()
      return () => {
        mounted.delete(at)
        schedule()
      }
    })
  }
  return { track, range }
}

function BrowseGrid(props: {
  kind: TitleKind
  title: string
  options: BrowseOptions
  browse: Browse
  navigate: (browse: Browse) => void
}) {
  const [panelOpen, setPanelOpen] = createSignal(false)
  const queryClient = useQueryClient()
  const dismissed = useDismissedStore((state) => state)
  const recommended = () => recommends(props.browse)
  const results = useBrowseResults(
    () => props.kind,
    () => props.browse,
  )
  const pages = () => results()?.data?.pages ?? []
  const rows = createMemo(() => {
    const hidden = dismissed().hidden
    const all = unique(pages().flatMap((page) => page.items))
    return recommended()
      ? all.filter((item) => !hidden.has(refKey(item.ref)))
      : all
  })
  const indexes = createMemo(
    () => new Map(rows().map((item, at) => [refKey(item.ref), at])),
  )
  const first = () => pages()[0]
  const stale = () => pages().some((page) => page.stale)
  const followed = useFollowedCards()
  // Library cards play; only the rest can change.
  const live = useLiveAvailability(() => {
    const [start, end] = followed.range()
    return rows()
      .slice(start, end)
      .filter((item) => !item.title)
      .map((item) => ({ ref: item.ref }))
  })
  const placeholder = () => results()?.isPlaceholderData ?? false
  const more = useNextPage({
    enabled: () => {
      const current = results()
      return (
        current !== undefined &&
        current.hasNextPage &&
        !current.isFetchingNextPage &&
        !current.isFetchNextPageError &&
        !current.isPlaceholderData
      )
    },
    fetch: () => void results()?.fetchNextPage(),
    pages: () => pages().length,
  })

  // Best match goes with the recommendations, and back to popular without them.
  const withFilters = (filters: CatalogFilters) =>
    props.navigate({
      filters,
      sort: sortFits(props.browse.sort, filters.recommended)
        ? props.browse.sort
        : "popular",
    })
  const change = (patch: Partial<CatalogFilters>) =>
    withFilters({ ...props.browse.filters, ...patch })
  const setSort = (sort: CatalogSort) =>
    props.navigate({ ...props.browse, sort })
  const clear = () => withFilters(NO_FILTERS)
  const filtered = () => filterCount(props.browse.filters) > 0
  const sorts = createMemo(() =>
    sortOptions(props.options).filter(({ value }) =>
      sortFits(value, props.browse.filters.recommended),
    ),
  )
  // One panel, in the bar that shows; both share its open state.
  const panel = (compact: boolean) => (
    <BrowseFilterPanel
      options={props.options}
      filters={props.browse.filters}
      change={change}
      open={panelOpen()}
      onOpenChange={setPanelOpen}
      compact={compact}
    />
  )
  const clearButton = () => (
    <Button variant="outline" onClick={clear}>
      {tr("library.clearFilters")}
    </Button>
  )
  const error = () => results()?.error ?? null

  return (
    <div>
      <PageHeader
        title={props.title}
        actions={
          <Show when={!isPhone()}>
            {panel(false)}
            <SortSelect
              options={sorts()}
              value={props.browse.sort}
              onChange={setSort}
            />
          </Show>
        }
        phoneActions={
          <Show when={isPhone()}>
            {panel(true)}
            <SortMenu
              options={sorts()}
              value={props.browse.sort}
              onChange={(value) => {
                const sort = sorts().find((entry) => entry.value === value)
                if (sort) setSort(sort.value)
              }}
            />
          </Show>
        }
      />
      <Show when={stale()}>
        <Note icon={<Icon icon={CloudOff} class="size-4 shrink-0" />}>
          {tr("discover.stale")}
        </Note>
      </Show>
      <Switch>
        <Match when={!results() || results()?.isPending}>
          <PosterGridSkeleton />
        </Match>
        <Match when={rows().length === 0 && turnedDown(error())}>
          {/* A link from before the server stopped offering one of its filters. */}
          <DiscoverEmpty
            icon={<Icon icon={SearchX} />}
            title={errorMessage(error())}
            description=""
          >
            {clearButton()}
          </DiscoverEmpty>
        </Match>
        <Match when={rows().length === 0 && error()}>
          <Retry
            message={tr("discover.browse.failed")}
            onRetry={() => void results()?.refetch()}
          />
        </Match>
        <Match when={rows().length === 0 && recommended()}>
          <DiscoverEmpty
            icon={<Icon icon={Sparkles} />}
            title={tr("discover.browse.forYouNone")}
            description={tr("discover.browse.forYouHint")}
          >
            <Show when={filtered()}>{clearButton()}</Show>
          </DiscoverEmpty>
        </Match>
        <Match when={rows().length === 0}>
          <DiscoverEmpty
            icon={<Icon icon={SearchX} />}
            title={
              filtered()
                ? tr(`discover.browse.none.${props.kind}`)
                : tr("discover.browse.nothing")
            }
            description={filtered() ? tr("filters.noneHint") : ""}
          >
            <Show when={filtered()}>{clearButton()}</Show>
          </DiscoverEmpty>
        </Match>
        <Match when>
          <div
            aria-busy={placeholder() ? "true" : undefined}
            class={cn(
              "transition-opacity duration-200 motion-reduce:transition-none",
              placeholder() && "opacity-50",
            )}
          >
            <WindowedGrid
              data-slot="browse-grid"
              class={posterGrid}
              items={rows()}
              keyed={(item) => refKey(item.ref)}
            >
              {(item) => {
                followed.track(() => indexes().get(refKey(item().ref)) ?? 0)
                return (
                  <li>
                    <BrowseCard
                      item={item()}
                      live={live()}
                      detail={cardDetail(first()?.detail ?? null, item())}
                      dismiss={
                        recommended()
                          ? () =>
                              dismissed().dismiss(
                                queryClient,
                                item().ref,
                                item().name,
                              )
                          : undefined
                      }
                    />
                  </li>
                )
              }}
            </WindowedGrid>
            <Show when={results()?.isFetchingNextPage}>
              <ul aria-hidden="true" class={cn(posterGrid, "mt-6")}>
                <CardSkeletons />
              </ul>
            </Show>
          </div>
          <div ref={more} aria-hidden="true" class="h-px" />
          <Show
            when={!results()?.isFetchNextPageError}
            fallback={
              <Retry
                message={tr("discover.moreFailed")}
                onRetry={() => void results()?.fetchNextPage()}
              />
            }
          >
            <Show when={!results()?.hasNextPage && pages().length > 1}>
              <p class="text-muted-foreground mt-10 text-center text-sm">
                {tr("discover.end")}
              </p>
            </Show>
          </Show>
        </Match>
      </Switch>
    </div>
  )
}

/** The server refused the filters, which only a hand-made or old link gets. */
function turnedDown(error: Error | null): boolean {
  return error instanceof ORPCError && error.status === 400
}

/** A line above the grid about the whole list. */
function Note(props: { icon?: JSX.Element; children: JSX.Element }) {
  return (
    <p class="text-muted-foreground mb-5 flex items-center gap-2 text-sm">
      {props.icon}
      {props.children}
    </p>
  )
}

/** The sort as a select with its words in place, from `sm` up. */
function SortSelect<T extends string>(props: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  const label = () =>
    props.options.find((option) => option.value === props.value)?.label
  return (
    <Select
      value={props.value}
      onValueChange={(next) => {
        const choice = props.options.find((option) => option.value === next)
        if (choice) props.onChange(choice.value)
      }}
    >
      <SelectTrigger
        aria-label={tr("library.sort")}
        class="min-w-44 shrink-0 justify-between gap-1"
      >
        <span class="text-muted-foreground">{tr("library.sortPrefix")}</span>
        <SelectValue>{label()}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <For each={props.options} keyed={(option) => option.value}>
          {(option) => (
            <SelectItem value={option().value} label={option().label}>
              {option().label}
            </SelectItem>
          )}
        </For>
      </SelectContent>
    </Select>
  )
}
