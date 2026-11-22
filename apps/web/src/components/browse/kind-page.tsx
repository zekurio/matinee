import type { Library, TitleKind } from "@matinee/contracts"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { cn } from "@matinee/ui/lib/utils"
import {
  type QueryClient,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query"
import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"

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
import { PageHeader, useDocumentTitle } from "@/components/page-header"
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
 * Every movie or every show, across the libraries, as a poster grid. With
 * more than one library, a menu in the subtitle narrows it to one.
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
  const list = useTitleFilters(
    search,
    update,
    libraryId ? { libraryId } : { kind },
  )
  const [panelOpen, setPanelOpen] = useState(false)
  const titles = useInfiniteQuery({
    ...browsedTitlesOptions({
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
  const picker = ofKind.length > 1
  const count =
    total === undefined ? undefined : tr("browse.titleCount", { count: total })
  const controls: ListControlsProps = {
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
          picker ? (
            <>
              <LibraryMenu
                libraries={ofKind}
                value={libraryId}
                onChange={(next) => update({ library: next })}
              />
              {count && (
                <>
                  <span aria-hidden className="mx-1.5">
                    ·
                  </span>
                  {count}
                </>
              )}
            </>
          ) : (
            count
          )
        }
        actions={<HeaderControls {...controls} />}
        chips={<FilterChips inline active={chips} clear={list.clear} />}
        phoneActions={<PhoneControls {...controls} />}
      />
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
            filtered
              ? tr(`library.noFilterMatch.${words}`)
              : tr(`library.none.${words}`)
          }
          scanning={ofKind.some((library) => library.scanning)}
          clear={
            filtered
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

/** The value the menu's radio group uses for every library at once. */
const ALL = ""

/**
 * Every library of the kind, or one of them, as a menu behind the chosen
 * one's name. It sits in the header's subtitle so it takes no room of its
 * own.
 */
function LibraryMenu({
  libraries,
  value,
  onChange,
}: {
  libraries: Library[]
  value: string | undefined
  onChange: (libraryId: string | undefined) => void
}) {
  const current = libraries.find((library) => library.id === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "text-foreground/85 hover:text-foreground focus-visible:ring-ring data-popup-open:text-foreground relative -mx-1 inline-flex max-w-full cursor-default items-center gap-0.5 rounded-md px-1 align-bottom font-medium outline-none select-none focus-visible:ring-2",
          // A taller hit area on touch screens, without moving the text.
          "[@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-y-3 [@media(pointer:coarse)]:after:inset-x-0",
        )}
      >
        <span className="truncate">
          {current?.name ?? tr("browse.library.all")}
        </span>
        <ChevronDownIcon aria-hidden className="size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-48">
        <DropdownMenuRadioGroup
          aria-label={tr("browse.library")}
          value={value ?? ALL}
          onValueChange={(next) => {
            const library = libraries.find((l) => l.id === next)
            onChange(library?.id)
          }}
        >
          <DropdownMenuRadioItem
            value={ALL}
            closeOnClick
            className="[@media(pointer:coarse)]:min-h-11"
          >
            {tr("browse.library.all")}
          </DropdownMenuRadioItem>
          {libraries.map((library) => (
            <DropdownMenuRadioItem
              key={library.id}
              value={library.id}
              closeOnClick
              className="[@media(pointer:coarse)]:min-h-11"
            >
              {library.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
