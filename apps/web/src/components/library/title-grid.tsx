import type { Library } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useState } from "react"

import { PosterCard, posterGrid } from "@/components/media-item"
import { PageHeader } from "@/components/page-header"
import { tr } from "@/i18n"

import {
  EmptyList,
  libraryStatus,
  PosterGridSkeleton,
  ShowMore,
} from "./library-states"
import {
  HeaderControls,
  type ListControlsProps,
  PhoneControls,
} from "./list-controls"
import { libraryRoute } from "./list-params"
import { TitleFilterPanel } from "./title-filter-panel"
import {
  cardDetail,
  titleFilterCount,
  type TitleListSearch,
} from "./title-filter-params"
import { libraryTitlesOptions, useTitleFilters } from "./title-queries"

export function TitleGrid({ library }: { library: Library }) {
  const current = libraryRoute.useSearch()
  const navigate = libraryRoute.useNavigate()
  const update = (patch: Partial<TitleListSearch>) =>
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      replace: true,
    })
  const list = useTitleFilters(current, update, { libraryId: library.id })
  const [panelOpen, setPanelOpen] = useState(false)
  const busy = library.scanning || library.refreshing
  const titles = useInfiniteQuery({
    ...libraryTitlesOptions(library.id, {
      filters: list.filters,
      order: list.order,
    }),
    enabled: list.ready,
    // Refresh while metadata arrives; the library poll refreshes once more
    // when the work ends.
    refetchInterval: busy ? 3000 : false,
  })

  const rows = titles.data?.pages.flatMap((page) => page.items) ?? []
  const kind = library.kind
  const options = list.options
  const controls: ListControlsProps = {
    sorts: list.sorts,
    sort: list.sort,
    setSort: list.setSort,
    filter: options
      ? (compact) => (
          <TitleFilterPanel
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
  const filtered = titleFilterCount(list.filters) > 0

  return (
    <div>
      <PageHeader
        title={library.name}
        description={libraryStatus(library)}
        actions={<HeaderControls {...controls} />}
        phoneActions={<PhoneControls {...controls} />}
      />

      {titles.isPending ? (
        <PosterGridSkeleton />
      ) : rows.length === 0 ? (
        <EmptyList
          title={
            filtered
              ? tr(`library.noFilterMatch.${kind}`)
              : tr(`library.none.${kind}`)
          }
          scanning={library.scanning}
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
            {rows.map((title) => (
              <li key={title.id}>
                <PosterCard
                  title={title}
                  detail={cardDetail(title, list.order.sort)}
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
