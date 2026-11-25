import type { CatalogRef } from "@matinee/contracts"
import { RotateCw } from "lucide"
import { createEffect, Repeat } from "solid-js"

import { refKey } from "@/components/catalog/catalog-data"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"

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
export function useNextPage(options: {
  enabled: () => boolean
  fetch: () => void
  /** How many pages are in, so a page that leaves the end near asks again. */
  pages: () => number
}) {
  let marker: HTMLDivElement | undefined
  // Whether the end is near is the browser's to tell.
  createEffect(
    () => (options.enabled() ? options.pages() : null),
    (pages) => {
      if (pages === null || !marker) return
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) options.fetch()
        },
        { rootMargin: "0px 0px 100% 0px" },
      )
      observer.observe(marker)
      return () => observer.disconnect()
    },
  )
  return (element: HTMLDivElement) => {
    marker = element
  }
}

/** A few cards on their way at the end of the grid. */
export function CardSkeletons() {
  return (
    <Repeat count={6}>
      {() => (
        <li aria-hidden="true">
          <Skeleton class="aspect-[2/3] rounded-md" />
          <Skeleton class="mt-2.5 h-3.5 w-3/4" />
          <Skeleton class="mt-2 h-3 w-1/3" />
        </li>
      )}
    </Repeat>
  )
}

export function Retry(props: { message: string; onRetry: () => void }) {
  return (
    <div class="text-muted-foreground mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-6 text-sm">
      {props.message}
      <Button variant="outline" size="sm" onClick={() => props.onRetry()}>
        <Icon icon={RotateCw} />
        {tr("discover.retry")}
      </Button>
    </div>
  )
}
