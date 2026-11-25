import { cn } from "@matinee/ui/lib/utils"
import { For, Repeat, Show } from "solid-js"

import { posterGrid } from "@/components/library/library-states"
import { tr } from "@/i18n"
import { Skeleton } from "@/kit/skeleton"

import { CatalogCard } from "./catalog-card"
import {
  type CatalogSummary,
  liveEntry,
  refKey,
  useLiveAvailability,
} from "./catalog-data"

/**
 * What the section reads of the catalog's search, as a query gives it.
 * `data` is read only once `isSuccess` says it's there.
 */
export type CatalogResults = {
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  data: { items: CatalogSummary[]; stale: boolean } | undefined
}

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
export function NotHereSection(props: {
  results: CatalogResults
  /** The library found nothing, so this leads the page, unheaded. */
  first: boolean
}) {
  const items = () =>
    askable(props.results.isSuccess ? props.results.data?.items : undefined)
  const live = useLiveAvailability(() =>
    items().map((item) => ({ ref: item.ref })),
  )
  const id = "results-not-here"
  return (
    <Show when={!(props.results.isSuccess && items().length === 0)}>
      <section
        aria-labelledby={props.first ? undefined : id}
        aria-label={props.first ? tr("catalog.notHere") : undefined}
        aria-busy={props.results.isPending ? "true" : undefined}
      >
        <Show when={!props.first}>
          <h2
            id={id}
            class="mb-3 flex items-baseline gap-2 text-xl font-semibold tracking-tight"
          >
            {tr("catalog.notHere")}
            <Show when={items().length > 0}>
              <span class="text-muted-foreground text-sm font-normal">
                {tr("search.titles", { count: items().length })}
              </span>
            </Show>
          </h2>
        </Show>
        <Show
          when={!props.results.isError}
          fallback={
            <p class="text-muted-foreground text-sm">
              {tr("catalog.search.failed")}
            </p>
          }
        >
          <Show when={!props.results.isPending} fallback={<RowSkeleton />}>
            <Show when={props.results.isSuccess && props.results.data?.stale}>
              <p class="text-muted-foreground -mt-1 mb-3 text-sm">
                {tr("catalog.search.stale")}
              </p>
            </Show>
            <ul class={posterGrid}>
              <For each={items()} keyed={(item) => refKey(item.ref)}>
                {(item) => (
                  <li>
                    <CatalogCard
                      title={item()}
                      availability={liveEntry(live(), item().ref)?.availability}
                    />
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </section>
    </Show>
  )
}

/** One row of poster placeholders, as many as fit. */
function RowSkeleton() {
  return (
    <ul
      aria-hidden="true"
      class={cn(
        posterGrid,
        "auto-rows-[0px] grid-rows-1 gap-y-0 overflow-hidden",
      )}
    >
      <Repeat count={10}>
        {() => (
          <li>
            <Skeleton class="aspect-[2/3] rounded-md" />
            <Skeleton class="mt-2.5 h-3.5 w-3/4" />
            <Skeleton class="mt-2 h-3 w-1/3" />
          </li>
        )}
      </Repeat>
    </ul>
  )
}
