import type {
  CatalogRef,
  CatalogTitleDetail,
  CatalogTitleSummary,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { ORPCError } from "@orpc/server"

import type { Viewer } from "../access/viewer"
import { libraryFor, titleFor } from "../access/visible"
import { placeholders, saveArtwork, toArtwork } from "../media/artwork"
import { youTubeUrl } from "../metadata/trailers"
import { availability } from "../requests/availability"
import { withCachedDetails } from "../requests/cached-details"
import {
  choices,
  defaultDestination,
  destinations,
  lookupLanguage,
  requestedIn,
  routeTo,
} from "../requests/destinations"
import { detailProvider, lookupProvider, searchProvider } from "./cache"

async function artwork(urls: (string | null)[]) {
  const saved = await saveArtwork(urls)
  const art = await placeholders([...saved.values()])
  return (url: string | null) =>
    toArtwork(url ? (saved.get(url) ?? null) : null, art)
}

export async function search(
  viewer: Viewer,
  input: {
    query: string
    kind?: CatalogRef["kind"]
    libraryId?: string
    page: number
  },
) {
  // One list per kind, each in the provider's order of relevance.
  const lists: t.infer<typeof CatalogTitleSummary>[][] = []
  let stale = false
  for (const kind of input.kind
    ? [input.kind]
    : (["movie", "show"] satisfies CatalogRef["kind"][])) {
    const candidates = await destinations(viewer, kind)
    // Search goes through the library a title that isn't anime goes to.
    // Which results are anime isn't known until their details are read.
    const destination = input.libraryId
      ? candidates.find((row) => row.id === input.libraryId)
      : defaultDestination(candidates, { anime: false })?.library
    if (!destination?.metadataProvider) continue
    const provider = destination.metadataProvider
    const result = await searchProvider(
      { provider: destination.metadataProvider, kind },
      destination.metadataLanguage,
      input.query,
    )
    stale ||= result.stale
    const refs = result.value.map((row) => ({
      ref: {
        kind,
        provider: provider,
        providerId: row.id,
      },
      libraryId: input.libraryId,
    }))
    const states = await availability(
      viewer,
      await withCachedDetails(viewer, refs),
    )
    const art = await artwork(result.value.map((row) => row.poster))
    const items: t.infer<typeof CatalogTitleSummary>[] = []
    lists.push(items)
    result.value.forEach((row, index) => {
      const state = states[index]
      const ref = refs[index]?.ref
      if (state && ref && state.availability.state !== "here")
        items.push({
          ref,
          name: row.name,
          year: row.year,
          poster: art(row.poster),
          availability: state.availability,
        })
    })
  }
  // Films and shows take turns, so the best match of each kind leads
  // rather than every film coming before the first show.
  const longest = Math.max(0, ...lists.map((list) => list.length))
  const items = Array.from({ length: longest }, (_, index) =>
    lists.flatMap((list) => list.slice(index, index + 1)),
  ).flat()
  const start = (input.page - 1) * 40
  return {
    items: items.slice(start, start + 40),
    nextPage: items.length > start + 40 ? input.page + 1 : null,
    stale,
  }
}

export async function details(
  viewer: Viewer,
  input: { ref: CatalogRef; libraryId?: string },
): Promise<t.infer<typeof CatalogTitleDetail>> {
  return (await routedDetails(viewer, input)).detail
}

/**
 * A title's details, and how an ask for it is sent: `animeFrom` names
 * the library whose mapping's options for anime it takes, or is null.
 */
export async function routedDetails(
  viewer: Viewer,
  input: { ref: CatalogRef; libraryId?: string },
): Promise<{
  detail: t.infer<typeof CatalogTitleDetail>
  animeFrom: string | null
}> {
  const candidates = await destinations(viewer, input.ref.kind)
  // A library the viewer chose, which may hold the title without taking
  // asks; it's then in no list of destinations.
  const destination = input.libraryId
    ? candidates.find((row) => row.id === input.libraryId)
    : undefined
  const chosen = input.libraryId
    ? (destination ?? (await libraryFor(viewer, input.libraryId)))
    : undefined
  if (input.libraryId && !chosen)
    throw new ORPCError("NOT_FOUND", {
      message: "This title isn't in any library.",
    })
  const firstLanguage =
    chosen?.metadataLanguage ?? lookupLanguage(candidates, input.ref.provider)
  const first = await detailProvider(input.ref, firstLanguage)
  // The title at a library's provider. A reference from Discover is
  // resolved once on opening, not per feed card.
  const resolve = async (library: typeof chosen) => {
    const language = library?.metadataLanguage ?? "en-US"
    const provider = library?.metadataProvider ?? input.ref.provider
    if (provider === input.ref.provider)
      return {
        ref: input.ref,
        result:
          language === firstLanguage
            ? first
            : await detailProvider(input.ref, language),
      }
    const lookup = await lookupProvider(
      { provider, kind: input.ref.kind },
      language,
      first.value.externalIds,
    )
    const id = lookup.value
    if (!id)
      throw new ORPCError("NOT_FOUND", {
        message:
          "This title couldn't be matched at the destination library's metadata provider.",
      })
    const ref = { ...input.ref, provider, providerId: id }
    const resolved = await detailProvider(ref, language)
    return {
      ref,
      result: {
        value: resolved.value,
        stale: first.stale || lookup.stale || resolved.stale,
      },
    }
  }
  const requested = chosen
    ? []
    : await requestedIn(viewer, input.ref, first.value.externalIds)
  const pick = (anime: boolean) =>
    defaultDestination(candidates, {
      anime,
      requestedIn: requested,
      provider: input.ref.provider,
    })
  let route = chosen ? undefined : pick(first.value.anime ?? false)
  let target = chosen ?? route?.library
  let { ref, result } = await resolve(target)
  // A title is anime if either provider says so. The destination's
  // provider is only read once the title is resolved to it.
  const anime = !!first.value.anime || !!result.value.anime
  if (!chosen && !first.value.anime && anime) {
    route = pick(true)
    if (route && route.library.id !== target?.id) {
      target = route.library
      ;({ ref, result } = await resolve(target))
    }
  }
  const animeFrom = destination
    ? routeTo(destination, anime).animeFrom
    : (route?.animeFrom ?? null)
  const data = result.value
  const today = new Date().toISOString().slice(0, 10)
  const listed = data.seasons
    .toSorted((a, b) => a.number - b.number)
    .map((season) => {
      const episodes = data.episodes.filter(
        (episode) => episode.season === season.number,
      )
      const dates = episodes
        .flatMap((episode) => (episode.airDate ? [episode.airDate] : []))
        .sort()
      return {
        ...season,
        episodeCount: episodes.length,
        airDate: dates[0] ?? null,
        episodesAired: episodes.filter(
          (episode) => episode.airDate && episode.airDate <= today,
        ).length,
      }
    })
  const seasons = gettableSeasons(listed, data.status)
  const [state] = await availability(viewer, [
    {
      ref,
      libraryId: target?.id,
      externalIds: data.externalIds,
      releaseDate: data.releaseDate,
      seasons,
    },
  ])
  if (!state) throw new Error("Missing availability result")
  const credits = data.credits ?? []
  const art = await artwork([
    data.images.poster,
    data.images.backdrop,
    ...seasons.map((season) => season.poster),
    ...credits.map((credit) => credit.photo),
  ])
  const defaultScope =
    ref.kind === "show"
      ? {
          seasons: seasons
            .filter((season) => season.number > 0 && season.episodesAired > 0)
            .map((season) => season.number),
          future: true,
        }
      : null
  const detail = {
    ref,
    stale: result.stale,
    name: data.name,
    year: data.year,
    poster: art(data.images.poster),
    availability: state.availability,
    overview: data.overview,
    genres: data.genres,
    rating: data.rating,
    contentRating: data.contentRating,
    backdrop: art(data.images.backdrop),
    credits: credits.map((credit) => ({
      kind: credit.kind,
      name: credit.name,
      role: credit.role,
      photo: art(credit.photo),
    })),
    studios: data.studios ?? [],
    trailers: (data.trailers ?? []).map((trailer) => ({
      url: youTubeUrl(trailer.key),
      name: trailer.name,
      language: trailer.language,
    })),
    seasons: seasons.flatMap((season, index) => {
      const availability = state.seasons[index]
      return availability
        ? [
            {
              number: season.number,
              overview: season.overview,
              poster: art(season.poster),
              episodeCount: season.episodeCount,
              airDate: season.airDate,
              availability,
              selected: defaultScope?.seasons.includes(season.number) ?? false,
            },
          ]
        : []
    }),
    defaultScope,
    destinations: candidates
      .filter(
        (row) => row.id === target?.id || choices([row], anime).length > 0,
      )
      .map((row) => ({
        id: row.id,
        name: row.name,
        selected: row.id === target?.id,
      })),
  }
  return { detail, animeFrom }
}

/**
 * The seasons someone can get. TheTVDB lists a season with no episodes in
 * its default order for some shows, like a second one for Monster, which
 * ended with one. Such a season is left out, unless the show still runs
 * and it comes right after the last season with episodes: an announced
 * next season, whose episodes aren't listed yet. A provider that lists no
 * episodes keeps its seasons.
 */
function gettableSeasons<T extends { number: number; episodeCount: number }>(
  seasons: T[],
  status: string | null | undefined,
): T[] {
  const listed = seasons.filter((season) => season.episodeCount > 0)
  if (!listed.length) return seasons
  const last = Math.max(...listed.map((season) => season.number))
  const running = !/^(ended|canceled|cancelled)$/i.test(status ?? "")
  return seasons.filter(
    (season) =>
      season.episodeCount > 0 || (running && season.number === last + 1),
  )
}

export async function missingSeasons(viewer: Viewer, titleId: string) {
  const row = await titleFor(viewer, titleId)
  if (!row || row.kind !== "show" || !row.provider || !row.providerId)
    throw new ORPCError("NOT_FOUND", {
      message: "This title isn't in any library.",
    })
  const detail = await details(viewer, {
    ref: { kind: "show", provider: row.provider, providerId: row.providerId },
    libraryId: row.libraryId,
  })
  const last = Math.max(
    0,
    ...detail.seasons
      .filter((season) => season.availability.episodesHere > 0)
      .map((season) => season.number),
  )
  const missing = detail.seasons.filter(
    (season) => season.availability.episodesHere === 0,
  )
  return {
    ref: detail.ref,
    stale: detail.stale,
    seasons: missing,
    partialSeasons: detail.seasons.filter(
      (season) =>
        season.availability.episodesHere > 0 &&
        season.availability.episodesHere < season.availability.episodesAired,
    ),
    nextSeason: missing.find((season) => season.number > last) ?? null,
    defaultScope: detail.defaultScope ?? { seasons: [], future: true },
    destinations: detail.destinations,
  }
}
