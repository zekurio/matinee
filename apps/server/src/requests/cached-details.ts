import type { CatalogRef } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { library, providerCache } from "@matinee/db"
import { inArray } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { visibleLibraries } from "../access/visible"
import { detailKey } from "../catalog/cache"
import { db } from "../db"
import { type AvailabilityInput, ExternalIds } from "./availability"
import { destinations, lookupLanguage } from "./destinations"

const CachedDetail = t.object({
  externalIds: ExternalIds,
  anime: t.boolean().optional(),
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
 * each title: its other ids, its release date, its seasons, and whether
 * either provider's details, where already read, call it anime. Search,
 * the stream, and an ask's answer all read the same, so a title doesn't
 * say "On its way" in one and "Out 16 Dec" in another.
 */
export async function withCachedDetails(
  viewer: Viewer,
  titles: AvailabilityInput[],
): Promise<AvailabilityInput[]> {
  if (!titles.length) return []
  const [movies, shows] = await Promise.all([
    destinations(viewer, "movie"),
    destinations(viewer, "show"),
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
      lookupLanguage(ref.kind === "movie" ? movies : shows, ref.provider)
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
  const wanted = otherKeys.filter((key) => key !== null)
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
    return {
      ...input,
      anime: !!data.anime || (other.success && !!other.data.anime),
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
