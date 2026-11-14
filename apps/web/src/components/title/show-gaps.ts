import type { Title } from "@matinee/contracts"
import { skipToken, useQuery } from "@tanstack/react-query"

import {
  type CatalogSeasonEntry,
  liveEntry,
  liveSeasons,
  useLiveAvailability,
} from "@/components/catalog/catalog-data"
import { orpc } from "@/lib/rpc"

/** The seasons of a library show the server lacks, or has only part of. */
export function missingSeasonsOptions(titleId: string | null) {
  return orpc.catalog.missingSeasons.queryOptions({
    input: titleId ? { titleId } : skipToken,
  })
}

// Numbered seasons in order, then the specials, as the catalog page has them.
function bySeason(a: CatalogSeasonEntry, b: CatalogSeasonEntry) {
  return (a.number || Infinity) - (b.number || Infinity)
}

/**
 * What the server lacks of a show in the library, as its provider lists
 * it, with each season's state as the server streams it: the seasons that
 * aren't here, those only partly here, and the one after the last season
 * that is. Null for a film, until it loads, and when the provider can't
 * say, so the page shows only what's here.
 */
export function useShowGaps(title: Title) {
  const gaps = useQuery({
    ...missingSeasonsOptions(title.kind === "show" ? title.id : null),
    retry: 1,
  })
  const data = gaps.data
  const live = useLiveAvailability(
    data ? [{ ref: data.ref, libraryId: title.libraryId }] : [],
  )
  if (!data) return null
  const entry = liveEntry(live, data.ref)
  const missing = liveSeasons(data.seasons, entry).toSorted(bySeason)
  const partial = liveSeasons(data.partialSeasons, entry)
  const next = data.nextSeason
    ? (missing.find((season) => season.number === data.nextSeason?.number) ??
      null)
    : null
  return {
    ref: data.ref,
    libraryId: title.libraryId,
    missing,
    partial,
    next,
    /** Nothing of the show is asked for yet, so Undo may take back an ask. */
    first: [...missing, ...partial].every(
      (season) => season.availability.requestId === null,
    ),
  }
}

export type ShowGaps = NonNullable<ReturnType<typeof useShowGaps>>
