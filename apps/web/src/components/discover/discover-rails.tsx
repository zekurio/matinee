import type { CatalogRef } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { Skeleton } from "@matinee/ui/components/skeleton"
import {
  type UseQueryResult,
  useQueries,
  useQuery,
} from "@tanstack/react-query"
import { Link, useRouteContext } from "@tanstack/react-router"
import {
  ChevronRightIcon,
  CompassIcon,
  CloudOffIcon,
  RotateCwIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { CatalogCard } from "@/components/catalog/catalog-card"
import {
  type CatalogSummary,
  type LiveEntry,
  liveEntry,
  refKey,
  useLiveAvailability,
} from "@/components/catalog/catalog-data"
import { Rail, RailItem } from "@/components/rail"
import { tr } from "@/i18n"
import { formatDay, parseDay } from "@/lib/format"

import {
  type Rail as RailInfo,
  RAIL_CARDS,
  railName,
  railPageOptions,
  railLink,
  railsOptions,
} from "./discover-data"

type Page = UseQueryResult<{ items: CatalogSummary[]; stale: boolean }>

/**
 * Discover's rows, in the order the server sends them, each loading on
 * its own so a slow or failed one holds up nothing else. On its own page
 * from `sm` up, and under the field on a phone's search tab.
 */
export function DiscoverRails() {
  const rails = useQuery(railsOptions())
  const list = rails.data?.enabled ? rails.data.rails : []
  const pages = useQueries({ queries: list.map(railPageOptions) })
  const settled = pages.every((page) => !page.isPending)
  const live = useLiveAvailability(
    settled ? followed(pages.map((page) => page.data)) : [],
  )

  if (rails.isPending || (rails.isError && rails.isFetching)) {
    return <RailsSkeleton />
  }
  if (rails.isError) {
    return <Failed onRetry={() => void rails.refetch()} />
  }
  if (!rails.data.enabled) return <DiscoverOff />
  if (list.length > 0 && pages.every((page) => page.isError)) {
    if (pages.some((page) => page.isFetching)) return <RailsSkeleton />
    return (
      <Failed
        onRetry={() => {
          for (const page of pages) void page.refetch()
        }}
      />
    )
  }
  // A row whose titles are all here already has nothing to show.
  const shown = list.flatMap((rail, index) => {
    const page = pages[index]
    if (!page || (page.isSuccess && page.data.items.length === 0)) return []
    return [{ rail, page }]
  })
  if (shown.length === 0) return <Nothing />
  const stale = pages.some((page) => page.data?.stale)
  // One row that failed says so in its place. Several say it once, at the
  // top, rather than as a stack of empty boxes.
  const failed = shown.filter(({ page }) => page.isError && !page.isFetching)
  const rows =
    failed.length > 1 ? shown.filter((row) => !failed.includes(row)) : shown

  return (
    <div className="flex flex-col gap-10 max-sm:gap-6">
      {stale && <RailsNote>{tr("discover.stale")}</RailsNote>}
      {failed.length > 1 && (
        <RailsNote
          retry={() => {
            for (const { page } of failed) void page.refetch()
          }}
        >
          {tr("discover.railsFailed", { count: failed.length })}
        </RailsNote>
      )}
      {rows.map(({ rail, page }) => (
        <DiscoverRow key={rail.id} rail={rail} page={page} live={live} />
      ))}
    </div>
  )
}

/**
 * The titles the rows show, once, for the stream of what changes: a
 * card on two rows is one title, and the rows stay under the stream's
 * hundred.
 */
function followed(
  pages: ({ items: CatalogSummary[] } | undefined)[],
): { ref: CatalogRef }[] {
  const seen = new Map<string, { ref: CatalogRef }>()
  for (const page of pages) {
    for (const item of page?.items.slice(0, RAIL_CARDS) ?? []) {
      seen.set(refKey(item.ref), { ref: item.ref })
    }
  }
  return [...seen.values()]
}

/** "Coming soon" says when, where other rows say the year. */
export function releaseLine(
  rail: RailInfo["id"],
  item: CatalogSummary,
): string | undefined {
  if (rail !== "comingSoon" || !item.availability.releaseDate) return undefined
  const day = parseDay(item.availability.releaseDate)
  if (!day) return undefined
  return tr("discover.card.release", {
    date: formatDay(day),
    kind: tr(`search.kind.${item.ref.kind}`),
  })
}

/**
 * A row's heading, which leads to all of it: its own grid, or for the
 * popular rows, browsing that kind.
 */
export function RailHeading({ rail }: { rail: RailInfo }) {
  return (
    <Link
      {...railLink(rail.id)}
      className="focus-visible:ring-ring group/heading inline-flex max-w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
    >
      <span className="truncate">{railName(rail)}</span>
      <ChevronRightIcon
        aria-hidden
        className="text-muted-foreground group-hover/heading:text-foreground size-5 shrink-0 transition-colors"
      />
    </Link>
  )
}

function DiscoverRow({
  rail,
  page,
  live,
}: {
  rail: RailInfo
  page: Page
  live: LiveEntry[] | undefined
}) {
  const title = railName(rail)
  return (
    <Rail title={title} heading={<RailHeading rail={rail} />}>
      {page.isPending || (page.isError && page.isFetching) ? (
        <PosterSkeletons />
      ) : page.isError ? (
        <RailFailed onRetry={() => void page.refetch()} />
      ) : (
        page.data.items.slice(0, RAIL_CARDS).map((item) => (
          <RailItem key={refKey(item.ref)} artwork="poster">
            <CatalogCard
              title={item}
              availability={liveEntry(live, item.ref)?.availability}
              detail={releaseLine(rail.id, item)}
            />
          </RailItem>
        ))
      )}
    </Rail>
  )
}

/** In a row's place, when its cards didn't load. */
export function RailFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <li className="text-muted-foreground flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-6 text-sm">
      {tr("discover.railFailed")}
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCwIcon />
        {tr("discover.retry")}
      </Button>
    </li>
  )
}

/** A row's cards on their way, the size of the cards they stand in for. */
export function PosterSkeletons() {
  return Array.from({ length: 8 }, (_, i) => (
    <RailItem key={i} artwork="poster">
      <Skeleton className="aspect-[2/3] rounded-md" />
      <Skeleton className="mt-2.5 h-3.5 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/3" />
    </RailItem>
  ))
}

/** Rows on their way, before the page knows which ones it gets. */
function RailsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-10 max-sm:gap-6">
      {[44, 36, 40].map((width) => (
        <div key={width}>
          {/* The heading's 28px line. */}
          <div className="mb-3 flex h-9 items-center">
            <Skeleton className="h-5" style={{ width: `${width / 4}rem` }} />
          </div>
          <ul className="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:gap-4 sm:px-0">
            <PosterSkeletons />
          </ul>
        </div>
      ))}
    </div>
  )
}

/**
 * Something about the page's rows, said once above them rather than on
 * every row: that they're old, or that some didn't load.
 */
export function RailsNote({
  retry,
  children,
}: {
  retry?: () => void
  children: ReactNode
}) {
  return (
    <div className="text-muted-foreground -mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm max-sm:-mb-1">
      <p className="flex items-center gap-2">
        <CloudOffIcon aria-hidden className="size-4 shrink-0" />
        {children}
      </p>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          <RotateCwIcon />
          {tr("discover.retry")}
        </Button>
      )}
    </div>
  )
}

export function DiscoverEmpty({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="mb-4 size-9 [&_svg]:size-5">
          {icon}
        </EmptyMedia>
        <EmptyTitle className="text-base font-semibold">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  )
}

/** Nothing came back: the catalog is down and nothing was kept. */
function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <DiscoverEmpty
      icon={<CloudOffIcon />}
      title={tr("discover.failed")}
      description={tr("discover.failedHint")}
    >
      <Button variant="outline" onClick={onRetry}>
        <RotateCwIcon />
        {tr("discover.retry")}
      </Button>
    </DiscoverEmpty>
  )
}

/** Every row came back without a title this viewer lacks. */
function Nothing() {
  return (
    <DiscoverEmpty
      icon={<CompassIcon />}
      title={tr("discover.empty")}
      description={tr("discover.emptyHint")}
    />
  )
}

/** Opened from an old link on a server without Discover. */
export function DiscoverOff() {
  const { user } = useRouteContext({ from: "/_authed/_shell" })
  return (
    <DiscoverEmpty
      icon={<CompassIcon />}
      title={tr("discover.off")}
      description={
        user.role === "admin" ? tr("discover.offAdmin") : tr("discover.offHint")
      }
    />
  )
}
