import type {
  Availability,
  CatalogBrowsePage,
  CatalogInput,
  CatalogPage,
  CatalogRef,
  CatalogTitleDetail,
  CatalogTitleSummary,
  RelatedRail,
  RelatedTitle,
  SeasonAvailability,
} from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import {
  type InfiniteData,
  type QueryClient,
  skipToken,
  useQuery,
} from "@tanstack/react-query"

import { liveQuery, orpc } from "@/lib/rpc"

/*
 * What the catalog pages and cards share: references, the live stream of
 * availability for the titles on screen, and writing an answer from the
 * server into every place that shows the same title.
 */

export type CatalogDetail = t.infer<typeof CatalogTitleDetail>
export type CatalogSummary = t.infer<typeof CatalogTitleSummary>
export type CatalogSeasonEntry = CatalogDetail["seasons"][number]
export type SeasonState = t.infer<typeof SeasonAvailability>
type Input = t.infer<typeof CatalogInput>
export type RelatedRailInfo = t.infer<typeof RelatedRail>
export type RelatedEntry = t.infer<typeof RelatedTitle>

/** One title's live answer: the title and each of its seasons. */
export type LiveEntry = {
  ref: CatalogRef
  availability: Availability
  seasons: SeasonState[]
}

export function sameRef(a: CatalogRef, b: CatalogRef): boolean {
  return (
    a.kind === b.kind &&
    a.provider === b.provider &&
    a.providerId === b.providerId
  )
}

/** A stable string for a reference, for React keys and card tones. */
export function refKey(ref: CatalogRef): string {
  return `${ref.kind}:${ref.provider}:${ref.providerId}`
}

/** The path params of a catalog title's page. */
export function catalogParams(ref: CatalogRef) {
  return { kind: ref.kind, provider: ref.provider, providerId: ref.providerId }
}

/** A catalog title's page. Without a reference, as from a broken link, nothing loads. */
export function detailsOptions(ref: CatalogRef | null, libraryId?: string) {
  return orpc.catalog.details.queryOptions({
    input: ref ? (libraryId ? { ref, libraryId } : { ref }) : skipToken,
  })
}

function catalogInput(ref: CatalogRef, libraryId?: string): Input {
  return libraryId ? { ref, libraryId } : { ref }
}

/** The rows of titles related to a catalog title, without their titles. */
export function relatedOptions(ref: CatalogRef, libraryId?: string) {
  return orpc.catalog.related.queryOptions({
    input: catalogInput(ref, libraryId),
  })
}

/** One row of related titles. */
export function relatedTitlesOptions(
  ref: CatalogRef,
  rail: RelatedRailInfo["id"],
  libraryId?: string,
) {
  return orpc.catalog.relatedTitles.queryOptions({
    input: { ...catalogInput(ref, libraryId), rail },
  })
}

export function catalogSearchOptions(query: string) {
  return orpc.catalog.search.queryOptions({ input: { query } })
}

/**
 * Availability for the titles on screen, as the server streams it: a new
 * snapshot whenever something about one of them changes, and the current
 * one on every reconnect. Look a title up with {@link liveEntry}.
 */
export function useLiveAvailability(titles: Input[]) {
  const live = useQuery({
    ...orpc.requests.live.experimental_liveOptions({
      input: { titles: titles.slice(0, 100) },
    }),
    ...liveQuery,
    enabled: titles.length > 0,
  })
  return live.data
}

export function liveEntry(
  live: LiveEntry[] | undefined,
  ref: CatalogRef,
): LiveEntry | undefined {
  return live?.find((entry) => sameRef(entry.ref, ref))
}

/**
 * A title's seasons with what the stream last said about each, in place
 * of what the page loaded with.
 */
export function liveSeasons(
  seasons: CatalogSeasonEntry[],
  live: LiveEntry | undefined,
): CatalogSeasonEntry[] {
  if (!live || live.seasons.length === 0) return seasons
  return seasons.map((season) => {
    const fresh = live.seasons.find((entry) => entry.number === season.number)
    return fresh ? { ...season, availability: fresh } : season
  })
}

/**
 * Writes what the server answered for a title into every query that
 * shows it, so its card and page change at once rather than when the
 * stream next speaks.
 */
export function applyAvailability(
  queryClient: QueryClient,
  ref: CatalogRef,
  availability: Availability,
) {
  queryClient.setQueriesData<LiveEntry[]>(
    { queryKey: orpc.requests.live.key() },
    (old) =>
      old?.map((entry) =>
        sameRef(entry.ref, ref) ? { ...entry, availability } : entry,
      ),
  )
  queryClient.setQueriesData<CatalogDetail>(
    { queryKey: orpc.catalog.details.key() },
    (old) => (old && sameRef(old.ref, ref) ? { ...old, availability } : old),
  )
  queryClient.setQueriesData<t.infer<typeof CatalogPage>>(
    { queryKey: orpc.catalog.search.key() },
    (old) => old && withAvailability(old, ref, availability),
  )
  queryClient.setQueriesData<t.infer<typeof CatalogPage>>(
    { queryKey: orpc.discover.page.key({ type: "query" }) },
    (old) => old && withAvailability(old, ref, availability),
  )
  queryClient.setQueriesData<{ items: RelatedEntry[]; stale: boolean }>(
    { queryKey: orpc.catalog.relatedTitles.key() },
    (old) => old && withAvailability(old, ref, availability),
  )
  queryClient.setQueriesData<InfiniteData<t.infer<typeof CatalogPage>>>(
    { queryKey: orpc.discover.page.key({ type: "infinite" }) },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((page) =>
          withAvailability(page, ref, availability),
        ),
      },
  )
  queryClient.setQueriesData<InfiniteData<t.infer<typeof CatalogBrowsePage>>>(
    { queryKey: orpc.discover.browse.key({ type: "infinite" }) },
    (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((page) =>
              withAvailability(page, ref, availability),
            ),
          }
        : old,
  )
}

function withAvailability<P extends { items: CatalogSummary[] }>(
  page: P,
  ref: CatalogRef,
  availability: Availability,
): P {
  return {
    ...page,
    items: page.items.map((item) =>
      sameRef(item.ref, ref) ? { ...item, availability } : item,
    ),
  }
}
