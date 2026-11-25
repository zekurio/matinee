import type { Library, TitleKind, TitleList } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { hashKey, useInfiniteQuery } from "@tanstack/solid-query"
import { ArrowLeft } from "lucide"
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  Errored,
  Loading,
  onSettled,
  Show,
  untrack,
} from "solid-js"

import { pageGutter } from "@/components/app-shell"
import {
  cardDetail,
  titleFilterCount,
} from "@/components/library/title-filter-params"
import { PosterCard } from "@/components/media-item"
import { TabHeader } from "@/components/phone-nav"
import { sectionTitle } from "@/components/rail"
import { WindowedGrid } from "@/components/windowed-grid"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import { useHistorySteps } from "@/lib/history-steps"
import { errorMessage } from "@/lib/rpc"
import { isPhone } from "@/lib/viewport"

import {
  EmptyList,
  posterGrid,
  PosterGridSkeleton,
  ShowMore,
} from "./library-states"
import { SortMenu, SortSelect } from "./list-controls"
import { TitleFilterPanel } from "./title-filter-panel"
import type {
  browsedTitlesOptions,
  libraryTitlesOptions,
  useTitleFilters,
} from "./title-queries"

export const browseLayout = cn(pageGutter, "flex flex-col pt-2 sm:pt-5")

type Filters = ReturnType<typeof useTitleFilters>
type TitlesRequest =
  | ReturnType<typeof libraryTitlesOptions>
  | ReturnType<typeof browsedTitlesOptions>

export function TitleGrid(props: {
  name: string
  /** The one kind the list holds, or none for movies and shows together. */
  kind?: TitleKind
  scanning: boolean
  list: Filters
  request: TitlesRequest | undefined
  poll?: number | false
  description?: JSX.Element
  libraries?: Library[]
  libraryId?: string
  onLibraryChange?: (value?: string) => void
  /** The kind narrows the list from the filter panel. */
  onKindChange?: (value?: TitleKind) => void
  back?: boolean
  /** The first page of a phone tab: its band rather than a heading. */
  tab?: boolean
}) {
  createEffect(
    () => props.name,
    (name) => {
      document.title = `${name} · matinee`
      return () => {
        document.title = "matinee"
      }
    },
  )
  // A query observer stays on one key. Changing filters starts a new
  // observer without remounting the controls or closing their popup.
  const request = createMemo(
    () => (props.list.ready() ? props.request : undefined),
    {
      equals: (before, after) =>
        before === after ||
        (before !== undefined &&
          after !== undefined &&
          hashKey(before.queryKey) === hashKey(after.queryKey)),
    },
  )
  const history = useHistorySteps()
  // The count belongs beside the title, but the query that knows it lives
  // with the grid. It writes the total here as its pages arrive.
  const [total, setTotal] = createSignal<number>()
  const sortMenu = () => (
    <SortMenu
      options={props.list.sorts()}
      value={props.list.sort()}
      onChange={props.list.setSort}
    />
  )
  const sortSelect = () => (
    <SortSelect
      options={props.list.sorts()}
      value={props.list.sort()}
      onChange={props.list.setSort}
    />
  )
  const filter = (compact: boolean) => (
    <Show
      when={props.list.options()}
      fallback={
        <Show when={props.list.optionsPending()}>
          <Skeleton
            class={compact ? "size-9 rounded-full" : "h-9 w-20 rounded-lg"}
          />
        </Show>
      }
    >
      {(options) => (
        <TitleFilterPanel
          options={options()}
          filters={props.list.filters()}
          change={props.list.change}
          compact={compact}
          libraries={props.libraries}
          libraryId={props.libraryId}
          onLibraryChange={props.onLibraryChange}
          kind={props.kind}
          onKindChange={props.onKindChange}
          trigger="button"
          align="end"
        />
      )}
    </Show>
  )
  return (
    <div class={browseLayout}>
      <Show
        when={isPhone() && props.tab}
        fallback={
          <header class="max-sm:bg-background order-1 mb-4 max-sm:sticky max-sm:top-[calc(env(safe-area-inset-top)+4rem)] max-sm:z-20 max-sm:-mx-4 max-sm:mb-3 max-sm:px-4 md:mb-6">
            <div class="flex items-end justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex min-h-12 items-center gap-1">
                  <Show when={props.back && isPhone() && history.canGoBack()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={tr("shell.back")}
                      class="-ml-2"
                      onClick={history.back}
                    >
                      <Icon icon={ArrowLeft} class="size-5" />
                    </Button>
                  </Show>
                  <h1 class={[sectionTitle, "sm:text-26px flex-1"]}>
                    {props.name}
                  </h1>
                  <Show when={isPhone()}>
                    <div class="flex shrink-0 items-center gap-1">
                      {filter(true)}
                      {sortMenu()}
                    </div>
                  </Show>
                </div>
                <Show when={props.description}>
                  <div class="text-muted-foreground text-13px mt-1 sm:text-sm">
                    {props.description}
                  </div>
                </Show>
                <Show when={!props.back && total() !== undefined}>
                  <p class="text-muted-foreground text-13px mt-1 sm:text-sm">
                    {tr("browse.titleCount", { count: total() ?? 0 })}
                  </p>
                </Show>
              </div>
              <Show when={!isPhone()}>
                <div class="flex shrink-0 items-center gap-2">
                  {filter(false)}
                  {sortSelect()}
                </div>
              </Show>
            </div>
          </header>
        }
      >
        <TabHeader
          title={props.name}
          search
          actions={
            <>
              {filter(true)}
              {sortMenu()}
            </>
          }
        />
      </Show>
      <Show when={request()} keyed fallback={<TitleGridLoading />}>
        {(input) => (
          <Errored fallback={titleResultsError}>
            <Loading fallback={<TitleGridLoading />}>
              <TitleResults
                kind={props.kind}
                scanning={props.scanning}
                list={props.list}
                request={input}
                poll={props.poll}
                onTotal={setTotal}
              />
            </Loading>
          </Errored>
        )}
      </Show>
    </div>
  )
}

function titleResultsError(
  cause: Accessor<Parameters<typeof errorMessage>[0]>,
) {
  return (
    <p class="text-muted-foreground order-4 text-sm">{errorMessage(cause())}</p>
  )
}

function TitleGridLoading() {
  return (
    <div class="order-4">
      <PosterGridSkeleton />
    </div>
  )
}

function TitleResults(props: {
  /** None when the list holds movies and shows together. */
  kind?: TitleKind
  scanning: boolean
  list: Filters
  request: TitlesRequest
  poll?: number | false
  onTotal: (total: number | undefined) => void
}) {
  const titles = useInfiniteQuery<
    TitleList,
    Error,
    { pages: TitleList[]; pageParams: number[] },
    readonly unknown[],
    number
  >(() => ({
    ...props.request,
    refetchInterval: props.poll,
  }))
  // The cards read a signal that follows the query, not the query. Solid
  // mounts whatever reads the query's data inside the frame its fetch
  // holds, and in solid-js 2.0.3 each mount there scans the whole frame:
  // 1,200 titles took three times the old React app's script time to page
  // in. Written
  // from an effect, the same cards mount in a frame of their own.
  const [rows, setRows] = createSignal<TitleList["items"]>()
  // It follows the query by when its data last changed. Reading the
  // titles themselves here would subscribe the effect to every one.
  createEffect(
    () =>
      titles.isSuccess
        ? {
            at: titles.dataUpdatedAt,
            loaded: untrack(() =>
              titles.data.pages.flatMap((page) => page.items),
            ),
          }
        : undefined,
    (now) => {
      if (now) setRows(now.loaded)
    },
  )
  const total = () => titles.data.pages[0]?.total
  createEffect(total, (value) => {
    props.onTotal(value)
  })
  onSettled(() => () => props.onTotal(undefined))
  const filtered = () => titleFilterCount(props.list.filters()) > 0
  const emptyTitle = () => {
    if (!props.kind)
      return filtered() ? tr("browse.noFilterMatch") : tr("library.none.media")
    const kind = props.kind === "movie" ? "movies" : "shows"
    return filtered()
      ? tr(`library.noFilterMatch.${kind}`)
      : tr(`library.none.${kind}`)
  }
  const load = () => {
    if (!titles.isFetching && titles.hasNextPage) {
      void titles.fetchNextPage({ cancelRefetch: false })
    }
  }
  return (
    <div class="order-4">
      <Show
        when={rows()?.length !== 0}
        fallback={
          <EmptyList
            title={emptyTitle()}
            scanning={props.scanning}
            clear={filtered() ? props.list.clear : undefined}
          />
        }
      >
        <WindowedGrid
          data-slot="title-grid"
          class={posterGrid}
          items={rows() ?? []}
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
            paused={titles.fetchStatus !== "idle" && !titles.isFetchingNextPage}
            failed={titles.isFetchNextPageError}
            onLoad={load}
          />
        </Show>
      </Show>
    </div>
  )
}
