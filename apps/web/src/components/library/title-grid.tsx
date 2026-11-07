import type { Library } from "@matinee/contracts"
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query"

import { LibraryChips } from "@/components/library-chips"
import { PosterCard, posterGrid } from "@/components/media-item"
import { PageHeader } from "@/components/page-header"
import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"

import {
  EmptyList,
  libraryStatus,
  PosterGridSkeleton,
  ShowMore,
} from "./library-states"
import {
  ActiveFilters,
  type FilterControls,
  HeaderControls,
  type ListControlsProps,
  PhoneControls,
} from "./list-controls"
import {
  titleSort,
  titleSorts,
  useLibraryFilters,
  useListParams,
} from "./list-params"

const GRID_PAGE_SIZE = 60

export function TitleGrid({ library }: { library: Library }) {
  const { search, setSearch, query, sort, setSort } = useListParams()
  const filterState = useLibraryFilters()
  const { genre, studio } = filterState
  const busy = library.scanning || library.refreshing
  const titles = useInfiniteQuery(
    orpc.titles.list.infiniteOptions({
      input: (offset: number) => ({
        libraryId: library.id,
        query: query || undefined,
        genre,
        studio,
        sort: titleSort(sort),
        limit: GRID_PAGE_SIZE,
        offset,
      }),
      initialPageParam: 0,
      getNextPageParam: (last, pages) => {
        const loaded = pages.reduce((n, page) => n + page.items.length, 0)
        return loaded < last.total ? loaded : undefined
      },
      placeholderData: keepPreviousData,
      // Posters arrive one title at a time while metadata is fetched. The
      // library's poll refreshes the list once more when the work ends.
      refetchInterval: busy ? 3000 : false,
    }),
  )
  const facets = useQuery(
    orpc.titles.facets.queryOptions({ input: { libraryId: library.id } }),
  )

  const rows = titles.data?.pages.flatMap((page) => page.items) ?? []
  const kind = library.kind
  const filters: FilterControls | undefined = facets.data && {
    ...filterState,
    facets: facets.data,
  }
  const controls: ListControlsProps = {
    search,
    setSearch,
    label: tr(`library.search.${kind}`),
    sorts: titleSorts(),
    sort,
    setSort,
    filters,
  }
  const filtered = genre !== undefined || studio !== undefined

  return (
    <div>
      <PageHeader
        title={library.name}
        description={libraryStatus(library)}
        actions={<HeaderControls {...controls} />}
        phoneTitle={<LibraryChips className="-ml-4 pl-4" />}
        phoneActions={<PhoneControls {...controls} />}
      />
      <ActiveFilters {...filterState} />

      {titles.isPending ? (
        <PosterGridSkeleton />
      ) : rows.length === 0 ? (
        <EmptyList
          title={
            query
              ? tr(`library.noMatch.${kind}`, { query })
              : filtered
                ? tr(`library.noFilterMatch.${kind}`)
                : tr(`library.none.${kind}`)
          }
          scanning={library.scanning}
          clear={
            query
              ? {
                  label: tr("library.clearSearch"),
                  onClick: () => setSearch(""),
                }
              : filtered
                ? {
                    label: tr("library.clearFilters"),
                    onClick: filterState.clear,
                  }
                : undefined
          }
        />
      ) : (
        <>
          <ul className={posterGrid}>
            {rows.map((title) => (
              <li key={title.id}>
                <PosterCard title={title} />
              </li>
            ))}
          </ul>
          {titles.hasNextPage && (
            <ShowMore
              fetching={titles.isFetchingNextPage}
              onClick={() => void titles.fetchNextPage()}
              className="mt-8"
            />
          )}
        </>
      )}
    </div>
  )
}
