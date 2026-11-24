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
  For,
  Loading,
  Show,
  untrack,
} from "solid-js"

import { pageGutter } from "@/components/app-shell"
import { chipClass } from "@/components/chips"
import {
  cardDetail,
  titleFilterCount,
} from "@/components/library/title-filter-params"
import { PosterCard } from "@/components/media-item"
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
import { LibraryMenu, SortMenu } from "./list-controls"
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
  kind: TitleKind
  scanning: boolean
  list: Filters
  request: TitlesRequest
  poll?: number | false
  description?: JSX.Element
  libraries?: Library[]
  libraryId?: string
  onLibraryChange?: (value?: string) => void
  back?: boolean
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
  const selectedGenres = () => props.list.filters().genres
  const quickGenres = createMemo(() => {
    const options = props.list.options()
    if (!options) return []
    const selected = selectedGenres()
    return [
      ...new Set([
        ...selected,
        ...options.genres.slice(0, 5).map((genre) => genre.name),
      ]),
    ]
  })
  const sort = () => (
    <SortMenu
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
            class={compact ? "size-9 rounded-full" : "h-8 w-20 rounded-full"}
          />
        </Show>
      }
    >
      {(options) => (
        <TitleFilterPanel
          kind={props.kind}
          options={options()}
          filters={props.list.filters()}
          change={props.list.change}
          compact={compact}
        />
      )}
    </Show>
  )
  const libraryMenu = () => (
    <Show
      when={props.libraries && props.libraries.length > 1 && props.libraries}
    >
      {(libraries) => (
        <LibraryMenu
          libraries={libraries()}
          value={props.libraryId}
          onChange={(id) => props.onLibraryChange?.(id)}
        />
      )}
    </Show>
  )
  return (
    <div class={browseLayout}>
      <header class="max-sm:bg-background order-1 flex min-h-12 items-center gap-1 max-sm:sticky max-sm:top-[calc(env(safe-area-inset-top)+4rem)] max-sm:z-20 max-sm:-mx-4 max-sm:px-4">
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
        <h1 class={[sectionTitle, "sm:text-26px flex-1"]}>{props.name}</h1>
        <Show when={isPhone()}>
          {filter(true)}
          {sort()}
        </Show>
      </header>
      <Show when={props.description}>
        <div class="text-muted-foreground text-13px order-2 mb-3 sm:mb-0 sm:text-sm">
          {props.description}
        </div>
      </Show>
      <Show when={isPhone() && props.libraries && props.libraries.length > 1}>
        <div class="order-2 mb-2">{libraryMenu()}</div>
      </Show>
      <Show when={!isPhone()}>
        <div class="order-3 mt-3 mb-4 flex min-h-8 items-start justify-between gap-3">
          <div class="flex min-w-0 flex-wrap items-center gap-1.5">
            {filter(false)}
            {libraryMenu()}
            <div
              role="group"
              aria-label={tr("filters.genres")}
              class="flex flex-wrap gap-1.5"
            >
              <For each={quickGenres()}>
                {(genre) => {
                  const active = () => selectedGenres().includes(genre)
                  return (
                    <button
                      type="button"
                      aria-pressed={active() ? "true" : "false"}
                      class={chipClass(active())}
                      onClick={() => {
                        const genres = selectedGenres()
                        props.list.change({
                          genres: active()
                            ? genres.filter((name) => name !== genre)
                            : [...genres, genre],
                        })
                      }}
                    >
                      {genre}
                    </button>
                  )
                }}
              </For>
            </div>
          </div>
          <div class="shrink-0">{sort()}</div>
        </div>
      </Show>
      <Show
        when={request()}
        keyed
        fallback={<TitleGridLoading showCount={!props.back} />}
      >
        {(input) => (
          <Errored fallback={titleResultsError}>
            <Loading fallback={<TitleGridLoading showCount={!props.back} />}>
              <TitleResults
                kind={props.kind}
                scanning={props.scanning}
                list={props.list}
                request={input}
                poll={props.poll}
                showCount={!props.back}
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

function TitleGridLoading(props: { showCount: boolean }) {
  return (
    <>
      <Show when={props.showCount}>
        <div class="order-2 mb-3 h-5 sm:mb-0" />
      </Show>
      <div class="order-4">
        <PosterGridSkeleton />
      </div>
    </>
  )
}

function TitleResults(props: {
  kind: TitleKind
  scanning: boolean
  list: Filters
  request: TitlesRequest
  poll?: number | false
  showCount: boolean
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
  // 1,200 titles took three times React's script time to page in. Written
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
  const filtered = () => titleFilterCount(props.list.filters()) > 0
  const emptyTitle = () => {
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
    <>
      <Show when={props.showCount}>
        <p class="text-muted-foreground text-13px order-2 mb-3 min-h-5 sm:mb-0 sm:text-sm">
          <Show when={total() !== undefined}>
            {tr("browse.titleCount", { count: total() ?? 0 })}
          </Show>
        </p>
      </Show>
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
              paused={
                titles.fetchStatus !== "idle" && !titles.isFetchingNextPage
              }
              failed={titles.isFetchNextPageError}
              onLoad={load}
            />
          </Show>
        </Show>
      </div>
    </>
  )
}
