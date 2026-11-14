import type { CatalogRef } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { library, providerCache } from "@matinee/db"
import { inArray } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { visibleLibraries } from "../access/visible"
import { detailKey, Facts, factsKey } from "../catalog/cache"
import { db } from "../db"
import { type AvailabilityInput, ExternalIds } from "./availability"
import { destinations, lookupLanguage } from "./destinations"
import { loadRouting } from "./fulfilment/connections"
import { factsOf } from "./fulfilment/facts"

const CachedDetail = t.object({
  externalIds: ExternalIds,
  anime: t.boolean().optional(),
  originalLanguage: t.string().nullable().optional(),
  genreIds: t.array(t.number()).optional(),
  keywordIds: t.array(t.number()).optional(),
  releaseDate: t.string().nullable(),
  seasons: t.array(t.object({ number: t.number() })),
  episodes: t.array(
    t.object({ season: t.number(), airDate: t.string().nullable() }),
  ),
})

/** The providers a title can be known by, for its entry at the other one. */
const PROVIDERS = ["tmdb", "tvdb"] satisfies CatalogRef["provider"][]

/**
 * The inputs for `availability`, with what the provider cache knows of
 * each title: its other ids, its release date, its seasons, and what
 * either provider's details, where already read, say for override rules
 * and anime fields: `facts`. Search,
 * the stream, and an ask's answer all read the same, so a title doesn't
 * say "On its way" in one and "Out 16 Dec" in another.
 */
export async function withCachedDetails(
  viewer: Viewer,
  titles: AvailabilityInput[],
): Promise<AvailabilityInput[]> {
  if (!titles.length) return []
  const routing = await loadRouting()
  const [movies, shows] = await Promise.all([
    destinations(viewer, "movie", routing),
    destinations(viewer, "show", routing),
  ])
  const visible = await db
    .select()
    .from(library)
    .where(visibleLibraries(viewer))
  const language = (ref: CatalogRef, libraryId?: string) => {
    const chosen = libraryId
      ? visible.find((row) => row.id === libraryId)
      : undefined
    return (
      chosen?.metadataLanguage ??
      lookupLanguage(ref.kind === "movie" ? movies : shows)
    )
  }
  const keys = titles.map((input) =>
    detailKey(input.ref, language(input.ref, input.libraryId)),
  )
  const cached = await db
    .select()
    .from(providerCache)
    .where(inArray(providerCache.key, keys))
  const details = titles.map((_, index) => {
    const parsed = CachedDetail.safeParse(
      cached.find((row) => row.key === keys[index])?.body,
    )
    return parsed.success ? parsed.data : null
  })
  // The same title at the other provider, as a page resolves a Discover
  // card to a TheTVDB library. Read only if it's already cached.
  const otherKeys = titles.map((input, index) => {
    const provider = PROVIDERS.find((entry) => entry !== input.ref.provider)
    const id = provider ? details[index]?.externalIds[provider] : undefined
    if (!provider || !id) return null
    const ref = { ...input.ref, provider, providerId: id }
    return detailKey(ref, language(ref))
  })
  // And TMDB's facts of a title neither details entry is TMDB's for.
  const factKeys = titles.map((input, index) => {
    const id =
      input.ref.provider === "tmdb"
        ? null
        : (details[index]?.externalIds.tmdb ?? input.externalIds?.tmdb)
    return id ? factsKey(input.ref.kind, id) : null
  })
  const wanted = [...otherKeys, ...factKeys].filter((key) => key !== null)
  const others = wanted.length
    ? await db
        .select()
        .from(providerCache)
        .where(inArray(providerCache.key, wanted))
    : []
  const today = new Date().toISOString().slice(0, 10)
  return titles.map((input, index) => {
    const data = details[index]
    if (!data) return input
    const other = CachedDetail.safeParse(
      others.find((row) => row.key === otherKeys[index])?.body,
    )
    const facts = Facts.safeParse(
      others.find((row) => row.key === factKeys[index])?.body,
    )
    return {
      ...input,
      facts: factsOf(
        input.ref.kind,
        [data, other.success ? other.data : null],
        facts.success ? facts.data : null,
      ),
      externalIds: { ...data.externalIds, ...input.externalIds },
      releaseDate: data.releaseDate,
      seasons: data.seasons.map((season) => {
        const episodes = data.episodes.filter(
          (episode) => episode.season === season.number,
        )
        return {
          number: season.number,
          episodesAired: episodes.filter(
            (episode) => episode.airDate && episode.airDate <= today,
          ).length,
          airDate:
            episodes
              .flatMap((episode) => (episode.airDate ? [episode.airDate] : []))
              .sort()[0] ?? null,
        }
      }),
    }
  })
}
