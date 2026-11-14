import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import type { UseQueryResult } from "@tanstack/react-query"

import { posterGrid } from "@/components/media-item"
import { tr } from "@/i18n"

import { CatalogCard } from "./catalog-card"
import {
  type CatalogSummary,
  liveEntry,
  refKey,
  useLiveAvailability,
} from "./catalog-data"

type CatalogResults = UseQueryResult<{
  items: CatalogSummary[]
  stale: boolean
}>

/**
 * The catalog's results someone could ask for. A viewer whose account
 * can't ask gets none, rather than a list of titles they can do nothing
 * with.
 */
export function askable(items: CatalogSummary[] | undefined): CatalogSummary[] {
  return (items ?? []).filter(
    (item) => item.availability.disabledReason !== "off",
  )
}

/**
 * "Not here yet": titles the catalog found that no library here has,
 * under the library's own results with that heading, or straight under
 * the page's heading when the library has none. It loads on its own, so
 * the library's results never wait for the catalog.
 */
export function NotHereSection({
  results,
  first,
}: {
  results: CatalogResults
  /** The library found nothing, so this leads the page, unheaded. */
  first: boolean
}) {
  const items = askable(results.data?.items)
  const live = useLiveAvailability(items.map((item) => ({ ref: item.ref })))
  if (results.isSuccess && items.length === 0) return null
  const id = "results-not-here"
  return (
    <section
      aria-labelledby={first ? undefined : id}
      aria-label={first ? tr("catalog.notHere") : undefined}
      aria-busy={results.isPending || undefined}
    >
      {!first && (
        <h2
          id={id}
          className="mb-3 flex items-baseline gap-2 text-xl font-semibold tracking-tight"
        >
          {tr("catalog.notHere")}
          {items.length > 0 && (
            <span className="text-muted-foreground text-sm font-normal">
              {tr("search.titles", { count: items.length })}
            </span>
          )}
        </h2>
      )}
      {results.isError ? (
        <p className="text-muted-foreground text-sm">
          {tr("catalog.search.failed")}
        </p>
      ) : results.isPending ? (
        <RowSkeleton />
      ) : (
        <>
          {results.data.stale && (
            <p className="text-muted-foreground -mt-1 mb-3 text-sm">
              {tr("catalog.search.stale")}
            </p>
          )}
          <ul className={posterGrid}>
            {items.map((item) => (
              <li key={refKey(item.ref)}>
                <CatalogCard
                  title={item}
                  availability={liveEntry(live, item.ref)?.availability}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** One row of poster placeholders, as many as fit. */
function RowSkeleton() {
  return (
    <ul
      aria-hidden
      className={cn(
        posterGrid,
        "auto-rows-[0px] grid-rows-1 gap-y-0 overflow-hidden",
      )}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <li key={i}>
          <Skeleton className="aspect-[2/3] rounded-md" />
          <Skeleton className="mt-2.5 h-3.5 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </li>
      ))}
    </ul>
  )
}
