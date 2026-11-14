import type { CatalogInput, CatalogRef } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { Skeleton } from "@matinee/ui/components/skeleton"
import {
  type UseQueryResult,
  useQueries,
  useQuery,
} from "@tanstack/react-query"

import {
  PosterSkeletons,
  RailFailed,
  RailsNote,
} from "@/components/discover/discover-rails"
import { PosterCard } from "@/components/media-item"
import { Rail, RailItem } from "@/components/rail"
import { tr } from "@/i18n"

import { CatalogCard } from "./catalog-card"
import {
  type LiveEntry,
  liveEntry,
  type RelatedEntry,
  type RelatedRailInfo,
  refKey,
  relatedOptions,
  relatedTitlesOptions,
} from "./catalog-data"

/*
 * The rows under a catalog title's page: the rest of the film series it
 * belongs to, and more like it. Titles already here are the library's
 * cards and play; the rest are catalog cards that ask, as on Discover.
 */

type Page = UseQueryResult<{ items: RelatedEntry[]; stale: boolean }>

export type Related = {
  rails: UseQueryResult<{ rails: RelatedRailInfo[]; stale: boolean }>
  pages: Page[]
  /**
   * The titles the rows show that aren't here, for the page's one stream
   * of what changes. Empty until every row has loaded, so the stream
   * opens again once rather than once a row.
   */
  followed: t.infer<typeof CatalogInput>[]
}

/** The rows of titles related to `ref`, each loading on its own. */
export function useRelated(ref: CatalogRef, libraryId?: string): Related {
  const rails = useQuery(relatedOptions(ref, libraryId))
  const list = rails.data?.rails ?? []
  const pages = useQueries({
    queries: list.map((rail) => relatedTitlesOptions(ref, rail.id, libraryId)),
  })
  const settled = rails.isSuccess && pages.every((page) => !page.isPending)
  const seen = new Map<string, { ref: CatalogRef }>()
  if (settled) {
    for (const page of pages) {
      for (const item of page.data?.items ?? []) {
        if (item.availability.state !== "here")
          seen.set(refKey(item.ref), { ref: item.ref })
      }
    }
  }
  return { rails, pages, followed: [...seen.values()] }
}

export function RelatedRails({
  related,
  live,
}: {
  related: Related
  live: LiveEntry[] | undefined
}) {
  const { rails, pages } = related
  if (rails.isPending) return <RowSkeleton />
  // The page is whole without them; a failed list of rows leaves no gap.
  if (rails.isError) return null
  const rows = rails.data.rails.flatMap((rail, index) => {
    const page = pages[index]
    if (!page || (page.isSuccess && page.data.items.length === 0)) return []
    return [{ rail, page }]
  })
  const stale = rails.data.stale || pages.some((page) => page.data?.stale)
  return (
    <>
      {stale && rows.length > 0 && (
        <RailsNote>{tr("catalog.related.stale")}</RailsNote>
      )}
      {rows.map(({ rail, page }) => (
        <RelatedRow key={rail.id} rail={rail} page={page} live={live} />
      ))}
    </>
  )
}

function railTitle(rail: RelatedRailInfo): string {
  return rail.id === "collection" && rail.name
    ? rail.name
    : tr("catalog.related.moreLikeThis")
}

function RelatedRow({
  rail,
  page,
  live,
}: {
  rail: RelatedRailInfo
  page: Page
  live: LiveEntry[] | undefined
}) {
  return (
    <Rail title={railTitle(rail)}>
      {page.isPending || (page.isError && page.isFetching) ? (
        <PosterSkeletons />
      ) : page.isError ? (
        <RailFailed onRetry={() => void page.refetch()} />
      ) : (
        page.data.items.map((item) => (
          <RailItem key={refKey(item.ref)} artwork="poster">
            <RelatedCard item={item} live={live} />
          </RailItem>
        ))
      )}
    </Rail>
  )
}

/**
 * A title the viewer can watch is the library's card, with Play. The
 * rest are catalog cards, with what the stream says now; one that
 * arrives while on screen turns into the library's card in place.
 */
function RelatedCard({
  item,
  live,
}: {
  item: RelatedEntry
  live: LiveEntry[] | undefined
}) {
  const availability =
    liveEntry(live, item.ref)?.availability ?? item.availability
  if (
    item.title &&
    availability.state === "here" &&
    availability.libraryTitleId === item.title.id
  )
    return <PosterCard title={item.title} />
  return <CatalogCard title={item} availability={availability} />
}

/** A row on its way, before the page knows which rows it gets. */
function RowSkeleton() {
  return (
    <div aria-hidden>
      {/* The heading's 28px line. */}
      <div className="mb-3 flex h-9 items-center">
        <Skeleton className="h-5 w-40" />
      </div>
      <ul className="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:gap-4 sm:px-0">
        <PosterSkeletons />
      </ul>
    </div>
  )
}
