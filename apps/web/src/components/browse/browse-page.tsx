import { buttonVariants } from "@matinee/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { cn } from "@matinee/ui/lib/utils"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Building2Icon, TagIcon } from "lucide-react"
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
import { useSearchText } from "@/components/library/list-params"
import {
  activeTitleFilters,
  TitleFilterPanel,
} from "@/components/library/title-filter-panel"
import {
  browsedTitlesOptions,
  useTitleFilters,
} from "@/components/library/title-queries"
import { PosterCard, posterGrid } from "@/components/media-item"
import {
  belowHeader,
  PageHeader,
  useDocumentTitle,
} from "@/components/page-header"
import { tr } from "@/i18n"
import type { BrowseSearch } from "@/lib/browse-search"
import { errorMessage } from "@/lib/rpc"

import { KindPicker } from "./kind-picker"

const icons = { genre: TagIcon, studio: Building2Icon }

/**
 * Every movie and show with a genre or from a studio, across the
 * libraries, as a poster grid. Titles link here from their genres and
 * studios.
 */
export function BrowsePage({
  by,
  name,
  search,
  update,
}: {
  by: "genre" | "studio"
  name: string
  search: BrowseSearch
  /** Writes some of the page's search params. */
  update: (patch: BrowseSearch) => void
}) {
  useDocumentTitle(name)
  const Icon = icons[by]
  const groupLabel = tr(`browse.${by}`)
  const text = useSearchText(search.q, update)
  const kind = search.kind
  const scope = by === "genre" ? { genre: name } : { studio: name }
  const list = useTitleFilters(search, update, { ...scope, kind })
  const [panelOpen, setPanelOpen] = useState(false)
  // The page's own genre or studio, which every title here has, isn't
  // a filter to take off; the server gets it with the rest.
  const others = (names: string[]) => names.filter((other) => other !== name)
  const shown =
    by === "genre"
      ? { ...list.filters, genres: others(list.filters.genres) }
      : { ...list.filters, studios: others(list.filters.studios) }
  const filters =
    by === "genre"
      ? { ...shown, genres: [name, ...shown.genres] }
      : { ...shown, studios: [name, ...shown.studios] }
  const titles = useInfiniteQuery({
    ...browsedTitlesOptions({
      query: text.query,
      kind,
      filters,
      order: list.order,
    }),
    enabled: list.ready,
  })

  const rows = titles.data?.pages.flatMap((page) => page.items) ?? []
  const counts = titles.data?.pages[0]?.kinds
  const options = list.options
  const chips = options ? activeTitleFilters(shown, options, list.change) : []
  const controls: ListControlsProps = {
    search: text.search,
    setSearch: text.setSearch,
    label: tr("browse.search", { name }),
    sorts: list.sorts,
    sort: list.sort,
    setSort: list.setSort,
    filter: options
      ? (compact) => (
          <TitleFilterPanel
            kind={kind}
            options={options}
            filters={shown}
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
        title={name}
        description={
          counts
            ? `${groupLabel} · ${tr("browse.titleCount", { count: counts.movie + counts.show })}`
            : groupLabel
        }
        actions={<HeaderControls {...controls} />}
        phoneActions={<PhoneControls {...controls} />}
      />
      {counts && (
        <KindPicker
          counts={counts}
          value={kind}
          onChange={(next) => update({ kind: next })}
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
      ) : rows.length > 0 ? (
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
      ) : text.query ? (
        <EmptyList
          title={tr("browse.noMatch", { query: text.query })}
          scanning={false}
          clear={{
            label: tr("browse.clearSearch"),
            onClick: () => text.setSearch(""),
          }}
        />
      ) : chips.length > 0 ? (
        <EmptyList
          title={tr("browse.noFilterMatch")}
          scanning={false}
          clear={{ label: tr("library.clearFilters"), onClick: list.clear }}
        />
      ) : kind ? (
        <EmptyList
          title={tr(`browse.${by}.none.${kind}`)}
          scanning={false}
          clear={{
            label: tr("browse.showBoth"),
            onClick: () => update({ kind: undefined }),
          }}
        />
      ) : (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="mb-4 size-9 [&_svg]:size-5">
              <Icon />
            </EmptyMedia>
            <EmptyTitle className="text-base font-semibold">
              {tr(`browse.${by}.empty`)}
            </EmptyTitle>
            <EmptyDescription>
              {tr("browse.emptyDescription", { name })}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link to="/" className={buttonVariants({ variant: "outline" })}>
              {tr("browse.backHome")}
            </Link>
          </EmptyContent>
        </Empty>
      )}
    </div>
  )
}
