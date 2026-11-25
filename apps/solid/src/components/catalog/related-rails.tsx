import type { CatalogInput, CatalogRef } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { type QueryObserverResult, useQuery } from "@tanstack/solid-query"
import { createMemo, For, Match, Show, Switch } from "solid-js"

import {
  PosterSkeletons,
  RailsNote,
} from "@/components/discover/discover-rails"
import { useFollowedQueries } from "@/components/discover/followed-queries"
import { RailFailed } from "@/components/discover/rail-failed"
import { PosterCard } from "@/components/media-item"
import { Rail, RailItem } from "@/components/rail"
import { tr } from "@/i18n"
import { Skeleton } from "@/kit/skeleton"

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

type Page = QueryObserverResult<{ items: RelatedEntry[]; stale: boolean }>

export type Related = {
  rails: ReturnType<typeof useRelatedRails>
  /** Each row's answer, in the order of the rails. */
  pages: () => Page[]
  /**
   * The titles the rows show that aren't here, for the page's one stream
   * of what changes. Empty until every row has loaded, so the stream
   * opens again once rather than once a row.
   */
  followed: () => t.infer<typeof CatalogInput>[]
}

function useRelatedRails(
  ref: () => CatalogRef,
  libraryId: () => string | undefined,
) {
  return useQuery(() => relatedOptions(ref(), libraryId()))
}

/** The rows of titles related to `ref`, each loading on its own. */
export function useRelated(
  ref: () => CatalogRef,
  libraryId: () => string | undefined,
): Related {
  const rails = useRelatedRails(ref, libraryId)
  const list = () => (rails.isSuccess ? rails.data.rails : [])
  const results = useFollowedQueries(() =>
    list().map((rail) => relatedTitlesOptions(ref(), rail.id, libraryId())),
  )
  const pages = (): Page[] => results() ?? []
  const followed = createMemo(() => {
    const settled =
      rails.isSuccess &&
      results() !== undefined &&
      pages().every((page) => !page.isPending)
    if (!settled) return []
    const seen = new Map<string, { ref: CatalogRef }>()
    for (const page of pages()) {
      for (const item of page.data?.items ?? []) {
        if (item.availability.state !== "here")
          seen.set(refKey(item.ref), { ref: item.ref })
      }
    }
    return [...seen.values()]
  })
  return { rails, pages, followed }
}

export function RelatedRails(props: {
  related: Related
  live: LiveEntry[] | undefined
}) {
  const rails = () => props.related.rails
  const rows = createMemo(() => {
    const query = rails()
    if (!query.isSuccess) return []
    return query.data.rails.flatMap((rail, index) => {
      const page = props.related.pages()[index]
      if (!page || (page.isSuccess && page.data.items.length === 0)) return []
      return [{ rail, page }]
    })
  })
  const stale = () =>
    (rails().isSuccess && rails().data?.stale) ||
    props.related.pages().some((page) => page.data?.stale)
  return (
    <Switch>
      <Match when={rails().isPending}>
        <RowSkeleton />
      </Match>
      {/* The page is whole without them; a failed list of rows leaves no gap. */}
      <Match when={rails().isSuccess}>
        <Show when={stale() && rows().length > 0}>
          <RailsNote>{tr("catalog.related.stale")}</RailsNote>
        </Show>
        <For each={rows()} keyed={(row) => row.rail.id}>
          {(row) => (
            <RelatedRow rail={row().rail} page={row().page} live={props.live} />
          )}
        </For>
      </Match>
    </Switch>
  )
}

function railTitle(rail: RelatedRailInfo): string {
  return rail.id === "collection" && rail.name
    ? rail.name
    : tr("catalog.related.moreLikeThis")
}

function RelatedRow(props: {
  rail: RelatedRailInfo
  page: Page
  live: LiveEntry[] | undefined
}) {
  const items = () => (props.page.isSuccess ? props.page.data.items : [])
  return (
    <Rail title={railTitle(props.rail)}>
      <Switch>
        <Match
          when={
            props.page.isPending ||
            (props.page.isError && props.page.isFetching)
          }
        >
          <PosterSkeletons />
        </Match>
        <Match when={props.page.isError}>
          <RailFailed onRetry={() => void props.page.refetch()} />
        </Match>
        <Match when>
          <For each={items()} keyed={(item) => refKey(item.ref)}>
            {(item) => (
              <RailItem artwork="poster">
                <RelatedCard item={item()} live={props.live} />
              </RailItem>
            )}
          </For>
        </Match>
      </Switch>
    </Rail>
  )
}

/**
 * A title the viewer can watch is the library's card, with Play. The
 * rest are catalog cards, with what the stream says now; one that
 * arrives while on screen turns into the library's card in place.
 */
function RelatedCard(props: {
  item: RelatedEntry
  live: LiveEntry[] | undefined
}) {
  const availability = createMemo(
    () => liveEntry(props.live, props.item.ref)?.availability,
  )
  const watchable = () => {
    const title = props.item.title
    const current = availability() ?? props.item.availability
    return title &&
      current.state === "here" &&
      current.libraryTitleId === title.id
      ? title
      : undefined
  }
  return (
    <Show
      when={watchable()}
      fallback={
        <CatalogCard title={props.item} availability={availability()} />
      }
    >
      {(title) => <PosterCard title={title()} />}
    </Show>
  )
}

/** A row on its way, before the page knows which rows it gets. */
function RowSkeleton() {
  return (
    <div aria-hidden="true">
      {/* The heading's 28px line. */}
      <div class="mb-3 flex h-9 items-center">
        <Skeleton class="h-5 w-40" />
      </div>
      <ul class="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:gap-4 sm:px-0">
        <PosterSkeletons />
      </ul>
    </div>
  )
}
