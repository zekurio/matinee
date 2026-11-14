import type { CatalogRef } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { RotateCwIcon } from "lucide-react"
import { useEffect, useRef } from "react"

import { refKey } from "@/components/catalog/catalog-data"
import { tr } from "@/i18n"

/*
 * What Discover's long grids share: a row's full grid and a browse of
 * the catalog both load more as they scroll.
 */

/**
 * Titles once each. The provider's pages can overlap when its order
 * shifts between two of them.
 */
export function unique<T extends { ref: CatalogRef }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = refKey(item.ref)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Loads the next page as the end of the grid comes near. Returns the ref
 * for a marker at the end.
 */
export function useNextPage({
  enabled,
  fetch,
  pages,
}: {
  enabled: boolean
  fetch: () => Promise<object>
  pages: number
}) {
  const marker = useRef<HTMLDivElement>(null)
  // Whether the end is near is the browser's to tell.
  useEffect(() => {
    const el = marker.current
    if (!el || !enabled) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void fetch()
      },
      { rootMargin: "0px 0px 100% 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [enabled, fetch, pages])
  return marker
}

/** A few cards on their way at the end of the grid. */
export function CardSkeletons() {
  return Array.from({ length: 6 }, (_, i) => (
    <li key={i} aria-hidden>
      <Skeleton className="aspect-[2/3] rounded-md" />
      <Skeleton className="mt-2.5 h-3.5 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/3" />
    </li>
  ))
}

export function Retry({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="text-muted-foreground mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-6 text-sm">
      {message}
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCwIcon />
        {tr("discover.retry")}
      </Button>
    </div>
  )
}
