import { buttonVariants } from "@matinee/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { Skeleton } from "@matinee/ui/components/skeleton"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { CloudOffIcon, CompassIcon } from "lucide-react"

import { CatalogCard } from "@/components/catalog/catalog-card"
import {
  liveEntry,
  refKey,
  useLiveAvailability,
} from "@/components/catalog/catalog-data"
import { PosterGridSkeleton } from "@/components/library/library-states"
import { posterGrid } from "@/components/media-item"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { tr } from "@/i18n"

import {
  type Rail,
  railAt,
  railGridOptions,
  railName,
  railsOptions,
} from "./discover-data"
import { useOnScreenCards } from "./discover-live"
import { releaseLine } from "./discover-rails"
import { CardSkeletons, Retry, unique, useNextPage } from "./grid-parts"

/** One of Discover's rows in full, as a grid that loads more as it scrolls. */
export function RailGridPage({ slug }: { slug: string }) {
  const rails = useQuery(railsOptions())
  const rail = rails.data?.enabled ? railAt(rails.data.rails, slug) : undefined
  useDocumentTitle(rail ? railName(rail) : tr("discover.title"))

  if (rails.isPending) {
    return (
      <div aria-hidden>
        <div className="mb-4 flex h-8 items-center md:mb-6 md:h-10">
          <Skeleton className="h-7 w-64" />
        </div>
        <PosterGridSkeleton />
      </div>
    )
  }
  if (!rail) {
    return (
      <>
        <PageHeader title={tr("discover.title")} />
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="mb-4 size-9 [&_svg]:size-5">
              <CompassIcon />
            </EmptyMedia>
            <EmptyTitle className="text-base font-semibold">
              {tr("discover.gone")}
            </EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Link to="/discover" className={buttonVariants()}>
              {tr("discover.back")}
            </Link>
          </EmptyContent>
        </Empty>
      </>
    )
  }
  // A new row, like another "Because you watched", starts its own grid.
  return <RailGrid key={JSON.stringify(rail)} rail={rail} />
}

function RailGrid({ rail }: { rail: Rail }) {
  const queryClient = useQueryClient()
  const titles = useInfiniteQuery(railGridOptions(queryClient, rail))
  const rows = unique(titles.data?.pages.flatMap((page) => page.items) ?? [])
  const stale = titles.data?.pages.some((page) => page.stale) ?? false
  const { track, start, end } = useOnScreenCards()
  const live = useLiveAvailability(
    rows.slice(start, end).map((item) => ({ ref: item.ref })),
  )
  const more = useNextPage({
    enabled:
      titles.hasNextPage &&
      !titles.isFetchingNextPage &&
      !titles.isFetchNextPageError,
    fetch: titles.fetchNextPage,
    // Watched again when a page lands, in case the end is still in view.
    pages: titles.data?.pages.length ?? 0,
  })

  return (
    <div>
      <PageHeader title={railName(rail)} />
      {stale && (
        <p className="text-muted-foreground mb-5 flex items-center gap-2 text-sm">
          <CloudOffIcon aria-hidden className="size-4 shrink-0" />
          {tr("discover.stale")}
        </p>
      )}
      {titles.isPending ? (
        <PosterGridSkeleton />
      ) : rows.length === 0 && titles.isError ? (
        <Retry
          message={tr("discover.railFailed")}
          onRetry={() => void titles.refetch()}
        />
      ) : rows.length === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="mb-4 size-9 [&_svg]:size-5">
              <CompassIcon />
            </EmptyMedia>
            <EmptyTitle className="text-base font-semibold">
              {tr("discover.empty")}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ul className={posterGrid}>
            {rows.map((item, index) => (
              <li key={refKey(item.ref)} ref={track(index)}>
                <CatalogCard
                  title={item}
                  availability={liveEntry(live, item.ref)?.availability}
                  detail={releaseLine(rail.id, item)}
                />
              </li>
            ))}
            {titles.isFetchingNextPage && <CardSkeletons />}
          </ul>
          <div ref={more} aria-hidden className="h-px" />
          {titles.isFetchNextPageError ? (
            <Retry
              message={tr("discover.moreFailed")}
              onRetry={() => void titles.fetchNextPage()}
            />
          ) : (
            !titles.hasNextPage &&
            (titles.data?.pages.length ?? 0) > 1 && (
              <p className="text-muted-foreground mt-10 text-center text-sm">
                {tr("discover.end")}
              </p>
            )
          )}
        </>
      )}
    </div>
  )
}
