import type { Library, TitleKind } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import {
  type QueryClient,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query"
import { useState } from "react"

import { chipClass, chipRow } from "@/components/chips"
import {
  EmptyList,
  PosterGridSkeleton,
  ShowMore,
} from "@/components/library/library-states"
import {
  FilterChips,
  HeaderControls,
  type ListControlsProps,
  PhoneControls,
} from "@/components/library/list-controls"
import { useSearchText } from "@/components/library/list-params"
import {
  activeTitleFilters,
  TitleFilterPanel,
} from "@/components/library/title-filter-panel"
import { cardDetail } from "@/components/library/title-filter-params"
import {
  browsedTitlesOptions,
  preloadInput,
  titleFilterOptionsQuery,
  useTitleFilters,
} from "@/components/library/title-queries"
import { PosterCard, posterGrid } from "@/components/media-item"
import {
  belowHeader,
  PageHeader,
  useDocumentTitle,
} from "@/components/page-header"
import { tr } from "@/i18n"
import type { KindSearch } from "@/lib/browse-search"
import { errorMessage, orpc } from "@/lib/rpc"

/** The kind of library that holds each kind of title. */
export const libraryKind = {
  movie: "movies",
  show: "shows",
} satisfies Record<TitleKind, Library["kind"]>

/**
 * The library `search` narrows to, when it names one of `kind`'s. Until
 * the libraries load, the one it names, so the list isn't asked for twice.
 */
export function pickedLibrary(
  search: KindSearch,
  libraries: Library[] | undefined,
  kind: TitleKind,
): string | undefined {
  if (!search.library || !libraries) return search.library
  return libraries.some(
    (library) =>
      library.id === search.library && library.kind === libraryKind[kind],
  )
    ? search.library
    : undefined
}

/** What the Movies or Shows route starts loading before the page mounts. */
export function kindPageLoader(
  queryClient: QueryClient,
  kind: TitleKind,
  search: KindSearch,
) {
  const librariesQuery = orpc.libraries.list.queryOptions()
  void queryClient.prefetchQuery(librariesQuery)
  const libraryId = pickedLibrary(
    search,
    queryClient.getQueryData(librariesQuery.queryKey),
    kind,
  )
  void queryClient.prefetchQuery(
    titleFilterOptionsQuery(libraryId ? { libraryId } : { kind }),
  )
  const input = preloadInput(search)
  if (input)
    void queryClient.prefetchInfiniteQuery(
      browsedTitlesOptions({ ...input, kind, libraryId }),
    )
}

/**
 * Every movie or every show, across the libraries, as a poster grid, with
 * chips to narrow it to one library when there's more than one.
 */
export function KindPage({
  kind,
  search,
  update,
}: {
  kind: TitleKind
  search: KindSearch
  /** Writes some of the page's search params. */
  update: (patch: KindSearch) => void
}) {
  const title = tr(`shell.${libraryKind[kind]}`)
  useDocumentTitle(title)
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const ofKind = (libraries.data ?? []).filter(
    (library) => library.kind === libraryKind[kind],
  )
  const libraryId = pickedLibrary(search, libraries.data, kind)
  const text = useSearchText(search.q, update)
  const list = useTitleFilters(
    search,
    update,
    libraryId ? { libraryId } : { kind },
  )
  const [panelOpen, setPanelOpen] = useState(false)
  const titles = useInfiniteQuery({
    ...browsedTitlesOptions({
      query: text.query,
      kind,
      libraryId,
      filters: list.filters,
      order: list.order,
    }),
    enabled: list.ready,
  })

  const rows = titles.data?.pages.flatMap((page) => page.items) ?? []
  const total = titles.data?.pages[0]?.total
  const options = list.options
  const chips = options
    ? activeTitleFilters(list.filters, options, list.change)
    : []
  const filtered = chips.length > 0
  const words = libraryKind[kind]
  const controls: ListControlsProps = {
    search: text.search,
    setSearch: text.setSearch,
    label: tr(`library.search.${words}`),
    sorts: list.sorts,
    sort: list.sort,
    setSort: list.setSort,
    filter: options
      ? (compact) => (
          <TitleFilterPanel
            kind={kind}
            options={options}
            filters={list.filters}
            change={list.change}
            open={panelOpen}
            onOpenChange={setPanelOpen}
            compact={compact}
          />
        )
      : undefined,
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={
          total === undefined
            ? undefined
            : tr("browse.titleCount", { count: total })
        }
        actions={<HeaderControls {...controls} />}
        chips={<FilterChips inline active={chips} clear={list.clear} />}
        phoneActions={<PhoneControls {...controls} />}
      />
      {ofKind.length > 1 && (
        <LibraryPicker
          libraries={ofKind}
          value={libraryId}
          onChange={(next) => update({ library: next })}
          className={belowHeader}
        />
      )}
      <FilterChips active={chips} clear={list.clear} />

      {titles.isPending ? (
        <PosterGridSkeleton />
      ) : titles.isError ? (
        <p className="text-muted-foreground text-sm">
          {errorMessage(titles.error)}
        </p>
      ) : rows.length === 0 ? (
        <EmptyList
          title={
            text.query
              ? tr(`library.noMatch.${words}`, { query: text.query })
              : filtered
                ? tr(`library.noFilterMatch.${words}`)
                : tr(`library.none.${words}`)
          }
          scanning={ofKind.some((library) => library.scanning)}
          clear={
            text.query
              ? {
                  label: tr("library.clearSearch"),
                  onClick: () => text.setSearch(""),
                }
              : filtered
                ? { label: tr("library.clearFilters"), onClick: list.clear }
                : undefined
          }
        />
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
            {rows.map((row) => (
              <li key={row.id}>
                <PosterCard
                  title={row}
                  detail={cardDetail(row, list.order.sort)}
                />
              </li>
            ))}
          </ul>
          {titles.hasNextPage && (
            <ShowMore
              fetching={titles.isFetchingNextPage}
              failed={titles.isFetchNextPageError}
              onClick={() => void titles.fetchNextPage()}
              className="mt-8"
            />
          )}
        </>
      )}
    </div>
  )
}

/** Chips for every library of the kind, or one of them. */
function LibraryPicker({
  libraries,
  value,
  onChange,
  className,
}: {
  libraries: Library[]
  value: string | undefined
  onChange: (libraryId: string | undefined) => void
  className?: string
}) {
  const choices = [
    { id: undefined, name: tr("browse.library.all") },
    ...libraries.map((library) => ({ id: library.id, name: library.name })),
  ]
  return (
    <div
      role="group"
      aria-label={tr("browse.library")}
      className={cn(chipRow, className)}
    >
      {choices.map((choice) => (
        <button
          key={choice.id ?? "all"}
          type="button"
          aria-pressed={choice.id === value}
          onClick={() => onChange(choice.id)}
          className={chipClass(choice.id === value)}
        >
          {choice.name}
        </button>
      ))}
    </div>
  )
}
