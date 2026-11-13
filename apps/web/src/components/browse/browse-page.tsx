import { buttonVariants } from "@matinee/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Building2Icon, TagIcon } from "lucide-react"

import {
  EmptyList,
  PosterGridSkeleton,
  ShowMore,
} from "@/components/library/library-states"
import {
  HeaderControls,
  type ListControlsProps,
  PhoneControls,
} from "@/components/library/list-controls"
import {
  titleSort,
  titleSorts,
  useListSearch,
} from "@/components/library/list-params"
import { PosterCard, posterGrid } from "@/components/media-item"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { tr } from "@/i18n"
import type { BrowseSearch } from "@/lib/browse-search"
import { errorMessage, orpc } from "@/lib/rpc"

import { KindPicker } from "./kind-picker"

const PAGE_SIZE = 60

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
  const list = useListSearch(search, update)
  const kind = search.kind
  const titles = useInfiniteQuery(
    orpc.titles.browse.infiniteOptions({
      input: (offset: number) => ({
        genre: by === "genre" ? name : undefined,
        studio: by === "studio" ? name : undefined,
        query: list.query || undefined,
        kind,
        sort: titleSort(list.sort),
        limit: PAGE_SIZE,
        offset,
      }),
      initialPageParam: 0,
      getNextPageParam: (last, pages) => {
        const loaded = pages.reduce((n, page) => n + page.items.length, 0)
        return loaded < last.total ? loaded : undefined
      },
      placeholderData: keepPreviousData,
    }),
  )

  const rows = titles.data?.pages.flatMap((page) => page.items) ?? []
  const counts = titles.data?.pages[0]?.kinds
  const controls: ListControlsProps = {
    search: list.search,
    setSearch: list.setSearch,
    label: tr("browse.search", { name }),
    sorts: titleSorts(),
    sort: list.sort,
    setSort: list.setSort,
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
          className="mb-5"
        />
      )}

      {titles.isPending ? (
        <PosterGridSkeleton />
      ) : titles.isError ? (
        <p className="text-muted-foreground text-sm">
          {errorMessage(titles.error)}
        </p>
      ) : rows.length > 0 ? (
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
      ) : list.query ? (
        <EmptyList
          title={tr("browse.noMatch", { query: list.query })}
          scanning={false}
          clear={{
            label: tr("browse.clearSearch"),
            onClick: () => list.setSearch(""),
          }}
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
