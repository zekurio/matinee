import { languageTag } from "../../media/language"
import { rankTrailers, youTubeId } from "../trailers"
import {
  type EpisodeDetails,
  isoDate,
  ProviderError,
  type SeasonDetails,
  text,
  type TitleDetails,
  uniqueNames,
  yearOf,
} from "../types"
import { request } from "./client"
import {
  contentRating,
  hasLanguage,
  translated,
  tvdbLanguage,
} from "./language"
import { absolute, credits, pickArtwork, remoteIds } from "./mapping"
import type {
  Episode,
  Movie,
  SeasonRecord,
  Series,
  Trailer,
  Translation,
} from "./payloads"
import { artworkType, seriesStudios } from "./reference"

/** The YouTube ones, in TVDB's order, as `rankTrailers` orders them. */
function trailers(list: Trailer[] | null | undefined, language: string) {
  return rankTrailers(
    (list ?? []).flatMap((trailer) => {
      const key = youTubeId(trailer.url ?? "")
      if (!key) return []
      return [
        {
          key,
          name: text(trailer.name),
          language: languageTag(trailer.language ?? ""),
        },
      ]
    }),
    language,
  )
}

async function seasonTranslation(
  id: number,
  lang: string,
): Promise<Translation | null> {
  try {
    const res = await request<Translation>(
      `/seasons/${id}/translations/${lang}`,
    )
    return res.data
  } catch (error) {
    // The language lists can name a translation TVDB then can't find.
    if (error instanceof ProviderError && error.status === 404) return null
    throw error
  }
}

/**
 * A season's overview in the user's language, else in English like the
 * show's. The series record carries no season overviews.
 */
async function seasonOverview(season: SeasonRecord, lang: string) {
  for (const language of lang === "eng" ? [lang] : [lang, "eng"]) {
    if (!hasLanguage(season.overviewTranslations, language)) continue
    const overview = text(
      (await seasonTranslation(season.id, language))?.overview,
    )
    if (overview) return overview
  }
  return null
}

/** The seasons in the series' default order, each number once. */
function seriesSeasons(series: Series, lang: string): Promise<SeasonDetails[]> {
  return Promise.all(
    (series.seasons ?? [])
      .filter(
        (season) =>
          season.type?.id === series.defaultSeasonType ||
          season.type?.type === "official",
      )
      .filter(
        (season, i, all) =>
          all.findIndex((s) => s.number === season.number) === i,
      )
      .map(async (season) => ({
        number: season.number,
        overview: await seasonOverview(season, lang),
        poster: absolute(season.image),
      })),
  )
}

/** Every episode in the default order, translated where TVDB can. */
async function episodes(id: number, lang: string): Promise<Episode[]> {
  const fetchAll = async (language: string) => {
    const all: Episode[] = []
    for (let page = 0; page < 50; page++) {
      const res = await request<{ episodes?: Episode[] }>(
        `/series/${id}/episodes/default/${language}`,
        { page },
      )
      all.push(...(res.data.episodes ?? []))
      if (!res.links?.next) break
    }
    return all
  }
  const list = await fetchAll(lang)
  // Untranslated episodes come back nameless. Fill them in from English.
  if (lang !== "eng" && list.some((episode) => !episode.name)) {
    const english = new Map(
      (await fetchAll("eng")).map((e) => [`${e.seasonNumber}x${e.number}`, e]),
    )
    for (const episode of list) {
      const fallback = english.get(`${episode.seasonNumber}x${episode.number}`)
      episode.name ||= fallback?.name ?? null
      episode.overview ||= fallback?.overview ?? null
    }
  }
  return list
}

export async function seriesDetails(id: string, language: string) {
  const lang = tvdbLanguage(language)
  const { data: series } = await request<Series>(
    `/series/${encodeURIComponent(id)}/extended`,
    { meta: "translations" },
  )
  const [poster, background, logo, list, studios] = await Promise.all([
    artworkType("series", "poster"),
    artworkType("series", "background"),
    artworkType("series", "clearlogo"),
    episodes(series.id, lang),
    seriesStudios(series.companies),
  ])
  const names = translated(series.translations, lang)
  const name = names.name ?? series.name
  const seasons = await seriesSeasons(series, lang)
  return {
    id: String(series.id),
    name,
    originalName: series.name !== name ? series.name : null,
    originalLanguage: languageTag(series.originalLanguage ?? ""),
    year: Number(series.year) || yearOf(series.firstAired),
    overview: names.overview ?? text(series.overview),
    tagline: null,
    genres: series.genres?.map((genre) => genre.name) ?? [],
    // TVDB's score counts favourites; it isn't a rating.
    rating: null,
    contentRating: contentRating(series.contentRatings, language),
    releaseDate: isoDate(series.firstAired),
    status: text(series.status?.name),
    runtimeMinutes: series.averageRuntime || null,
    externalIds: remoteIds(series.id, series.remoteIds),
    images: {
      poster:
        pickArtwork(series.artworks, poster, lang) ?? absolute(series.image),
      backdrop: pickArtwork(series.artworks, background, lang, true),
      logo: pickArtwork(series.artworks, logo, lang),
    },
    studios,
    credits: credits(series.characters),
    trailers: trailers(series.trailers, language),
    seasons,
    episodes: list.map((episode): EpisodeDetails => ({
      season: episode.seasonNumber,
      episode: episode.number,
      name: text(episode.name),
      overview: text(episode.overview),
      airDate: isoDate(episode.aired),
      runtimeMinutes: episode.runtime || null,
      still: absolute(episode.image),
    })),
  } satisfies TitleDetails
}

export async function movieDetails(id: string, language: string) {
  const lang = tvdbLanguage(language)
  const { data: movie } = await request<Movie>(
    `/movies/${encodeURIComponent(id)}/extended`,
    { meta: "translations" },
  )
  const [poster, background, logo] = await Promise.all([
    artworkType("movie", "poster"),
    artworkType("movie", "background"),
    artworkType("movie", "clearlogo"),
  ])
  const names = translated(movie.translations, lang)
  const name = names.name ?? movie.name
  const tagline = movie.translations?.nameTranslations?.find(
    (t) => t.language === lang,
  )?.tagline
  return {
    id: String(movie.id),
    name,
    originalName: movie.name !== name ? movie.name : null,
    originalLanguage: languageTag(movie.originalLanguage ?? ""),
    year: Number(movie.year) || yearOf(movie.first_release?.date),
    overview: names.overview,
    tagline: text(tagline),
    genres: movie.genres?.map((genre) => genre.name) ?? [],
    rating: null,
    contentRating: contentRating(movie.contentRatings, language),
    releaseDate: isoDate(movie.first_release?.date),
    status: text(movie.status?.name),
    runtimeMinutes: movie.runtime || null,
    externalIds: remoteIds(movie.id, movie.remoteIds),
    images: {
      poster:
        pickArtwork(movie.artworks, poster, lang) ?? absolute(movie.image),
      backdrop: pickArtwork(movie.artworks, background, lang, true),
      logo: pickArtwork(movie.artworks, logo, lang),
    },
    studios: uniqueNames(
      (movie.companies?.studio?.length
        ? movie.companies.studio
        : (movie.companies?.production ?? [])
      ).map((c) => c.name),
    ),
    credits: credits(movie.characters),
    trailers: trailers(movie.trailers, language),
    seasons: [],
    episodes: [],
  } satisfies TitleDetails
}
