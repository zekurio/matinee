import type { CatalogRef } from "@matinee/contracts"

import { factsProvider, lookupProvider } from "../catalog/cache"
import { sources } from "../metadata/sources"
import { type DetailFacts, factsOf } from "./fulfilment/facts"
import type { TitleFacts } from "./fulfilment/types"

/**
 * A title's facts from details just read. When none of them is TMDB's,
 * as for a title read from TheTVDB, its genres and keywords come from
 * TMDB by its TMDB id, through the provider cache. Without a TMDB key,
 * or when TMDB can't be reached, they stay empty.
 */
export async function titleFacts(
  kind: CatalogRef["kind"],
  details: (DetailFacts | null | undefined)[],
): Promise<TitleFacts> {
  if (
    details.some((detail) => detail?.keywordIds !== undefined) ||
    !sources.tmdb.configured()
  )
    return factsOf(kind, details)
  const ids = Object.fromEntries(
    details.flatMap((detail) => Object.entries(detail?.externalIds ?? {})),
  )
  try {
    const id =
      ids.tmdb ??
      (Object.keys(ids).length
        ? (await lookupProvider({ provider: "tmdb", kind }, "en-US", ids)).value
        : null)
    if (!id) return factsOf(kind, details)
    return factsOf(kind, details, (await factsProvider(kind, id)).value)
  } catch {
    return factsOf(kind, details)
  }
}
