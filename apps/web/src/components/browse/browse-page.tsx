import { TitleKind } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
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
  type Sort,
  titleSort,
  titleSorts,
  useListSearch,
} from "@/components/library/list-params"
import { PosterCard, posterGrid } from "@/components/media-item"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { plural } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"

import { KindPicker } from "./kind-picker"

/** A genre's or studio's search params. Both kinds is the default. */
export const BrowseSearch = t.object({
  q: t.string().min(1).optional().catch(undefined),
  sort: t.enum(["recent", "year"]).optional().catch(undefined) satisfies t.Type<
    Sort | undefined
  >,
  kind: TitleKind.optional().catch(undefined),
})
export type BrowseSearch = t.infer<typeof BrowseSearch>

const PAGE_SIZE = 60

const groups = {
  genre: { label: "Genre", here: "in this genre", icon: TagIcon },
  studio: { label: "Studio", here: "from this studio", icon: Building2Icon },
}

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
  const group = groups[by]
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
    label: `Search ${name}`,
    sorts: titleSorts,
    sort: list.sort,
    setSort: list.setSort,
  }

  return (
    <div>
      <PageHeader
        title={name}
        description={
          counts
            ? `${group.label} · ${plural(counts.movie + counts.show, "title")}`
            : group.label
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
              onClick={() => void titles.fetchNextPage()}
              className="mt-8"
            />
          )}
        </>
      ) : list.query ? (
        <EmptyList
          title={`Nothing matches “${list.query}”`}
          scanning={false}
          clear={{ label: "Clear search", onClick: () => list.setSearch("") }}
        />
      ) : kind ? (
        <EmptyList
          title={`No ${kind}s ${group.here}`}
          scanning={false}
          clear={{
            label: "Show movies and shows",
            onClick: () => update({ kind: undefined }),
          }}
        />
      ) : (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="mb-4 size-9 [&_svg]:size-5">
              <group.icon />
            </EmptyMedia>
            <EmptyTitle className="text-base font-semibold">
              Nothing {group.here}
            </EmptyTitle>
            <EmptyDescription>
              No movie or show in the libraries lists “{name}”.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link to="/" className={buttonVariants({ variant: "outline" })}>
              Back to Home
            </Link>
          </EmptyContent>
        </Empty>
      )}
    </div>
  )
}
