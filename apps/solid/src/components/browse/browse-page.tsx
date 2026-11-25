import type { BrowsedTitles, TitleFilters } from "@matinee/contracts"
import { hashKey, useInfiniteQuery } from "@tanstack/solid-query"
import { Link } from "@tanstack/solid-router"
import { Building2, SearchX, Tag } from "lucide"
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  Errored,
  Loading,
  Show,
  untrack,
} from "solid-js"

import { pageGutter } from "@/components/app-shell"
import {
  posterGrid,
  PosterGridSkeleton,
  ShowMore,
} from "@/components/library/library-states"
import { SortMenu } from "@/components/library/list-controls"
import { TitleFilterPanel } from "@/components/library/title-filter-panel"
import {
  cardDetail,
  titleFilterCount,
} from "@/components/library/title-filter-params"
import {
  browsedTitlesOptions,
  useTitleFilters,
} from "@/components/library/title-queries"
import { PosterCard } from "@/components/media-item"
import {
  belowHeader,
  PageHeader,
  useDocumentTitle,
} from "@/components/page-header"
import { WindowedGrid } from "@/components/windowed-grid"
import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/kit/empty"
import { Icon } from "@/kit/icon"
import type { BrowseSearch } from "@/lib/browse-search"
import { errorMessage } from "@/lib/rpc"
import { isPhone } from "@/lib/viewport"

import { type KindCounts, KindPicker } from "./kind-picker"

const icons = { genre: Tag, studio: Building2 }

type By = "genre" | "studio"
type Filters = ReturnType<typeof useTitleFilters>
type TitlesRequest = ReturnType<typeof browsedTitlesOptions>

/**
 * Every movie and show with a genre or from a studio, across the
 * libraries, as a poster grid. Titles link here from their genres and
 * studios.
 */
export function BrowsePage(props: {
  by: By
  name: string
  search: BrowseSearch
  /** Writes some of the page's search params. */
  update: (patch: BrowseSearch) => void
}) {
  useDocumentTitle(() => props.name)
  const groupLabel = () => tr(`browse.${props.by}`)
  const list = useTitleFilters(
    () => props.search,
    (patch) => props.update(patch),
    () =>
      props.by === "genre"
        ? { genre: props.name, kind: props.search.kind }
        : { studio: props.name, kind: props.search.kind },
  )
  // The page's own genre or studio, which every title here has, isn't
  // a filter to take off; the server gets it with the rest.
  const shown = createMemo((): TitleFilters => {
    const filters = list.filters()
    const others = (names: string[]) =>
      names.filter((other) => other !== props.name)
    return props.by === "genre"
      ? { ...filters, genres: others(filters.genres) }
      : { ...filters, studios: others(filters.studios) }
  })
  const request = createMemo(
    () => {
      if (!list.ready()) return undefined
      const filters = shown()
      return browsedTitlesOptions({
        kind: props.search.kind,
        filters:
          props.by === "genre"
            ? { ...filters, genres: [props.name, ...filters.genres] }
            : { ...filters, studios: [props.name, ...filters.studios] },
        order: list.order(),
      })
    },
    {
      equals: (before, after) =>
        before === after ||
        (before !== undefined &&
          after !== undefined &&
          hashKey(before.queryKey) === hashKey(after.queryKey)),
    },
  )
  // The last counts stay up while another kind or filter loads, so the
  // picker doesn't leave and come back.
  const [counts, setCounts] = createSignal<KindCounts>()
  const description = () => {
    const current = counts()
    return current
      ? `${groupLabel()} · ${tr("browse.titleCount", { count: current.movie + current.show })}`
      : groupLabel()
  }
  const filter = (compact: boolean) => (
    <Show when={list.options()}>
      {(options) => (
        <TitleFilterPanel
          options={options()}
          filters={shown()}
          change={list.change}
          compact={compact}
        />
      )}
    </Show>
  )
  const sort = () => (
    <SortMenu
      options={list.sorts()}
      value={list.sort()}
      onChange={list.setSort}
    />
  )

  return (
    <div class={[pageGutter, "sm:pt-8"]}>
      <PageHeader
        title={props.name}
        description={description()}
        actions={
          <Show when={!isPhone()}>
            {filter(false)}
            {sort()}
          </Show>
        }
        phoneActions={
          <Show when={isPhone()}>
            {filter(true)}
            {sort()}
          </Show>
        }
      />
      <Show when={counts()}>
        {(current) => (
          <KindPicker
            counts={current()}
            value={props.search.kind}
            onChange={(kind) => props.update({ kind })}
            class={belowHeader}
          />
        )}
      </Show>
      <Show when={request()} keyed fallback={<PosterGridSkeleton />}>
        {(input) => (
          <Errored fallback={resultsError}>
            <Loading fallback={<PosterGridSkeleton />}>
              <BrowseResults
                by={props.by}
                name={props.name}
                request={input}
                list={list}
                shown={shown()}
                kind={props.search.kind}
                onCounts={setCounts}
                showBoth={() => props.update({ kind: undefined })}
              />
            </Loading>
          </Errored>
        )}
      </Show>
    </div>
  )
}

function resultsError(cause: Accessor<Parameters<typeof errorMessage>[0]>) {
  return <p class="text-muted-foreground text-sm">{errorMessage(cause())}</p>
}

function BrowseResults(props: {
  by: By
  name: string
  request: TitlesRequest
  list: Filters
  shown: TitleFilters
  kind: BrowseSearch["kind"]
  onCounts: (counts: KindCounts) => void
  showBoth: () => void
}) {
  const titles = useInfiniteQuery<
    BrowsedTitles,
    Error,
    { pages: BrowsedTitles[]; pageParams: number[] },
    readonly unknown[],
    number
  >(() => props.request)
  // The cards read a signal that follows the query, as `TitleResults` in
  // `title-grid.tsx` does, so a page of them mounts in a frame of its own.
  const [rows, setRows] = createSignal<BrowsedTitles["items"]>()
  createEffect(
    () =>
      titles.isSuccess
        ? {
            at: titles.dataUpdatedAt,
            loaded: untrack(() =>
              titles.data.pages.flatMap((page) => page.items),
            ),
            kinds: untrack(() => titles.data.pages[0]?.kinds),
          }
        : undefined,
    (now) => {
      if (!now) return
      setRows(now.loaded)
      if (now.kinds) props.onCounts(now.kinds)
    },
  )
  const load = () => {
    if (!titles.isFetching && titles.hasNextPage) {
      void titles.fetchNextPage({ cancelRefetch: false })
    }
  }
  return (
    <Show when={rows()} fallback={<PosterGridSkeleton />}>
      {(loaded) => (
        <Show
          when={loaded().length > 0}
          fallback={
            <BrowseEmpty
              by={props.by}
              name={props.name}
              kind={props.kind}
              filtered={titleFilterCount(props.shown) > 0}
              clear={props.list.clear}
              showBoth={props.showBoth}
            />
          }
        >
          <WindowedGrid
            class={posterGrid}
            items={loaded()}
            keyed={(title) => title.id}
          >
            {(title) => (
              <li>
                <PosterCard
                  title={title()}
                  detail={cardDetail(title(), props.list.order().sort)}
                />
              </li>
            )}
          </WindowedGrid>
          <Show when={titles.hasNextPage}>
            <ShowMore
              fetching={titles.isFetchingNextPage}
              paused={
                titles.fetchStatus !== "idle" && !titles.isFetchingNextPage
              }
              failed={titles.isFetchNextPageError}
              onLoad={load}
            />
          </Show>
        </Show>
      )}
    </Show>
  )
}

/**
 * Nothing to show: filters that match nothing, a kind the page has none
 * of, or a genre or studio no title here has.
 */
function BrowseEmpty(props: {
  by: By
  name: string
  kind: BrowseSearch["kind"]
  filtered: boolean
  clear: () => void
  showBoth: () => void
}) {
  const action = () =>
    props.filtered
      ? { label: tr("library.clearFilters"), run: props.clear }
      : props.kind
        ? { label: tr("browse.showBoth"), run: props.showBoth }
        : undefined
  const title = () =>
    props.filtered
      ? tr("browse.noFilterMatch")
      : props.kind
        ? tr(`browse.${props.by}.none.${props.kind}`)
        : tr(`browse.${props.by}.empty`)
  return (
    <Empty class="min-h-64 py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon" class="mb-4 size-9 [&_svg]:size-5">
          <Icon icon={action() ? SearchX : icons[props.by]} />
        </EmptyMedia>
        <EmptyTitle class="text-base font-semibold">{title()}</EmptyTitle>
        <Show when={!action()}>
          <EmptyDescription>
            {tr("browse.emptyDescription", { name: props.name })}
          </EmptyDescription>
        </Show>
      </EmptyHeader>
      <EmptyContent>
        <Show
          when={action()}
          fallback={
            <Link to="/" class={buttonVariants({ variant: "outline" })}>
              {tr("browse.backHome")}
            </Link>
          }
        >
          {(current) => (
            <Button variant="outline" onClick={() => current().run()}>
              {current().label}
            </Button>
          )}
        </Show>
      </EmptyContent>
    </Empty>
  )
}
