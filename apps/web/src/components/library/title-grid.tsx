import type { Library } from "@matinee/contracts"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

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
import { titleSorts, useLibraryFilters, useListParams } from "./list-params"
import { libraryTitlesOptions } from "./title-queries"

export function TitleGrid({ library }: { library: Library }) {
  const { search, setSearch, query, sort, setSort } = useListParams()
  const filterState = useLibraryFilters()
  const { genre, studio } = filterState
  const busy = library.scanning || library.refreshing
  const titles = useInfiniteQuery({
    ...libraryTitlesOptions(library.id, { q: query, sort, genre, studio }),
    // Refresh while metadata arrives; the library poll refreshes once more
    // when the work ends.
    refetchInterval: busy ? 3000 : false,
  })
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
