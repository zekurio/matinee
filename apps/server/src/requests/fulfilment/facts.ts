import type { CatalogRef } from "@matinee/contracts"

import type { TitleFacts } from "./types"

/** What a provider's details, fresh or cached, say about a title. */
export type DetailFacts = {
  anime?: boolean
  genreIds?: number[]
  keywordIds?: number[]
  originalLanguage?: string | null
  externalIds?: Record<string, string>
}

/** A title of a kind nothing is known about, as before its details are read. */
export function noFacts(kind: CatalogRef["kind"]): TitleFacts {
  return { kind, anime: false, genres: [], language: null, keywords: [] }
}

/**
 * A title's facts from the details read of it, at either provider, and
 * its facts at TMDB when those were read on their own. It's anime if any
 * says so. Genres and keywords are TMDB's, so only its details have them.
 */
export function factsOf(
  kind: CatalogRef["kind"],
  details: (DetailFacts | null | undefined)[],
  tmdb?: DetailFacts | null,
): TitleFacts {
  const known = details.filter((detail) => !!detail)
  const fromTmdb = known.find((detail) => detail.keywordIds !== undefined)
  return {
    kind,
    anime: known.some((detail) => !!detail.anime) || !!tmdb?.anime,
    genres: fromTmdb?.genreIds ?? tmdb?.genreIds ?? [],
    keywords: fromTmdb?.keywordIds ?? tmdb?.keywordIds ?? [],
    language:
      known.find((detail) => detail.originalLanguage)?.originalLanguage ??
      tmdb?.originalLanguage ??
      null,
  }
}
