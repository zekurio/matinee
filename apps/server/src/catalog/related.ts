import type {
  CatalogRef,
  RelatedPage,
  RelatedRail,
  RelatedRails,
} from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"

import type { Viewer } from "../access/viewer"
import { libraryFor } from "../access/visible"
import { env } from "../env"
import { destinations, lookupLanguage } from "../requests/destinations"
import { collectionProvider, detailProvider, relatedProvider } from "./cache"
import { catalogCards } from "./cards"

/*
 * The rows of titles a catalog title's page shows under it: the rest of
 * the film series it belongs to, and what TMDB recommends with it. They
 * take a catalog reference, so a library title can have them too, by its
 * provider id.
 */

type Input = { ref: CatalogRef; libraryId?: string }
type FeedItem = {
  id: string
  name: string
  year: number | null
  poster: string | null
  releaseDate: string | null
}

/**
 * The title's TMDB id and the language its page reads in. The id is the
 * reference's own for a TMDB one, else the one its details carry, which
 * the page has already read. Null without a TMDB key or a TMDB id.
 */
async function seed(viewer: Viewer, input: Input) {
  if (!env.MATINEE_TMDB_API_KEY) return null
  const candidates = await destinations(viewer, input.ref.kind)
  // The language the title's page reads its details in.
  const chosen = input.libraryId
    ? (candidates.find((row) => row.id === input.libraryId) ??
      (await libraryFor(viewer, input.libraryId)))
    : undefined
  if (input.libraryId && !chosen) return null
  const language = chosen?.metadataLanguage ?? lookupLanguage(candidates)
  if (input.ref.provider === "tmdb")
    return { id: input.ref.providerId, language, stale: false }
  const detail = await detailProvider(input.ref, language)
  const id = detail.value.externalIds.tmdb
  return id ? { id, language, stale: detail.stale } : null
}

/** Recommendations, or the similar titles when TMDB recommends none. */
function moreLikeThis(
  related: { recommendations: FeedItem[]; similar: FeedItem[] },
  self: string,
) {
  const recommended = related.recommendations.filter((row) => row.id !== self)
  return recommended.length > 0
    ? recommended
    : related.similar.filter((row) => row.id !== self)
}

export async function rails(
  viewer: Viewer,
  input: Input,
): Promise<t.infer<typeof RelatedRails>> {
  const from = await seed(viewer, input)
  if (!from) return { rails: [], stale: false }
  const related = await relatedProvider(input.ref.kind, from.language, from.id)
  const result: t.infer<typeof RelatedRail>[] = []
  // Only films belong to collections.
  if (input.ref.kind === "movie" && related.value.collection)
    result.push({ id: "collection", name: related.value.collection.name })
  if (moreLikeThis(related.value, from.id).length > 0)
    result.push({ id: "moreLikeThis", name: null })
  return { rails: result, stale: from.stale || related.stale }
}

export async function titles(
  viewer: Viewer,
  input: Input & { rail: t.infer<typeof RelatedRail>["id"] },
): Promise<t.infer<typeof RelatedPage>> {
  const empty = { items: [], stale: false }
  const from = await seed(viewer, input)
  if (!from) return empty
  const kind = input.ref.kind
  const related = await relatedProvider(kind, from.language, from.id)
  const series =
    kind === "movie" && related.value.collection
      ? related.value.collection
      : null
  let stale = from.stale || related.stale
  let rows: FeedItem[]
  if (input.rail === "collection") {
    if (!series) return empty
    const parts = await collectionProvider(from.language, series.id)
    stale ||= parts.stale
    rows = parts.value.parts.filter((row) => row.id !== from.id)
  } else {
    rows = moreLikeThis(related.value, from.id)
    // The series has its own row, so its parts aren't here twice. A
    // series that won't load leaves them in.
    const parts = series
      ? await collectionProvider(from.language, series.id).catch(() => null)
      : null
    if (parts) {
      const ids = new Set(parts.value.parts.map((row) => row.id))
      const rest = rows.filter((row) => !ids.has(row.id))
      if (rest.length > 0) rows = rest
    }
  }
  const cards = await catalogCards(viewer, kind, rows)
  return { items: cards.map((entry) => entry.card), stale }
}
