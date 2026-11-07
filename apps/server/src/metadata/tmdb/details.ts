import type { ExternalIds } from "@matinee/db"

import { languageTag } from "../../media/language"
import {
  type EpisodeDetails,
  isoDate,
  type SeasonDetails,
  text,
  type TitleDetails,
  uniqueNames,
  yearOf,
} from "../types"
import { image, request } from "./client"
import { billed, credit, movieCrew, showCast, showCrew } from "./credits"
import type { Image, Movie, SeasonResult, Show } from "./payloads"

// append_to_response takes at most 20 entries.
const SEASONS_PER_REQUEST = 20

function languageParts(language: string) {
  const [lang = "en", region] = language.split("-")
  return { lang, region: region ?? (lang === "en" ? "US" : lang.toUpperCase()) }
}

/** The logo in the user's language, then English, then any. Never SVG. */
function pickLogo(logos: Image[] | undefined, lang: string): string | null {
  const usable = (logos ?? []).filter((logo) => logo.file_path.endsWith(".png"))
  const logo =
    usable.find((l) => l.iso_639_1 === lang) ??
    usable.find((l) => l.iso_639_1 === "en") ??
    usable[0]
  return image(logo?.file_path, "w500")
}

function rating(average?: number, count?: number): number | null {
  return average && count ? Math.round(average * 10) / 10 : null
}

export async function movieDetails(id: string, language: string) {
  const { lang, region } = languageParts(language)
  const movie = await request<Movie>(`/movie/${encodeURIComponent(id)}`, {
    language,
    append_to_response: "images,release_dates,credits",
    include_image_language: `${lang},en,null`,
  })
  const releases =
    movie.release_dates?.results.find((r) => r.iso_3166_1 === region) ??
    movie.release_dates?.results.find((r) => r.iso_3166_1 === "US")
  const certification = releases?.release_dates.find((r) => r.certification)
  const externalIds: ExternalIds = { tmdb: String(movie.id) }
  if (movie.imdb_id) externalIds.imdb = movie.imdb_id
  return {
    id: String(movie.id),
    name: movie.title,
    originalName: text(movie.original_title),
    originalLanguage: languageTag(movie.original_language ?? ""),
    year: yearOf(movie.release_date),
    overview: text(movie.overview),
    tagline: text(movie.tagline),
    genres: movie.genres?.map((genre) => genre.name) ?? [],
    rating: rating(movie.vote_average, movie.vote_count),
    contentRating: text(certification?.certification),
    releaseDate: isoDate(movie.release_date),
    status: text(movie.status),
    runtimeMinutes: movie.runtime || null,
    externalIds,
    images: {
      poster: image(movie.poster_path, "w780"),
      backdrop: image(movie.backdrop_path, "w1280"),
      logo: pickLogo(movie.images?.logos, lang),
    },
    studios: uniqueNames(movie.production_companies?.map((c) => c.name) ?? []),
    credits: [
      ...billed(movie.credits?.cast)
        .map((member) => credit(member, "actor", member.character))
        .filter((member) => member !== null),
      ...movieCrew(movie.credits?.crew),
    ],
    seasons: [],
    episodes: [],
  } satisfies TitleDetails
}

/** The show's seasons and their episodes. */
async function showSeasons(path: string, language: string, show: Show) {
  // Episodes come per season. Batch the seasons into as few calls as
  // append_to_response allows.
  const numbers = (show.seasons ?? []).map((season) => season.season_number)
  const seasons: SeasonDetails[] = []
  const episodes: EpisodeDetails[] = []
  for (let i = 0; i < numbers.length; i += SEASONS_PER_REQUEST) {
    const batch = numbers.slice(i, i + SEASONS_PER_REQUEST)
    const data = await request<Record<string, SeasonResult | undefined>>(path, {
      language,
      append_to_response: batch.map((n) => `season/${n}`).join(","),
    })
    for (const n of batch) {
      const season = data[`season/${n}`]
      if (!season) continue
      seasons.push({
        number: n,
        overview: text(season.overview),
        poster: image(season.poster_path, "w780"),
      })
      for (const episode of season.episodes ?? []) {
        episodes.push({
          season: episode.season_number,
          episode: episode.episode_number,
          name: text(episode.name),
          overview: text(episode.overview),
          airDate: isoDate(episode.air_date),
          runtimeMinutes: episode.runtime || null,
          still: image(episode.still_path, "original"),
        })
      }
    }
  }
  return { seasons, episodes }
}

export async function showDetails(id: string, language: string) {
  const { lang, region } = languageParts(language)
  const path = `/tv/${encodeURIComponent(id)}`
  const show = await request<Show>(path, {
    language,
    append_to_response: "images,content_ratings,external_ids,aggregate_credits",
    include_image_language: `${lang},en,null`,
  })
  const { seasons, episodes } = await showSeasons(path, language, show)

  const ageRating =
    show.content_ratings?.results.find((r) => r.iso_3166_1 === region) ??
    show.content_ratings?.results.find((r) => r.iso_3166_1 === "US")
  const externalIds: ExternalIds = { tmdb: String(show.id) }
  if (show.external_ids?.imdb_id) externalIds.imdb = show.external_ids.imdb_id
  if (show.external_ids?.tvdb_id) {
    externalIds.tvdb = String(show.external_ids.tvdb_id)
  }
  return {
    id: String(show.id),
    name: show.name,
    originalName: text(show.original_name),
    originalLanguage: languageTag(show.original_language ?? ""),
    year: yearOf(show.first_air_date),
    overview: text(show.overview),
    tagline: text(show.tagline),
    genres: show.genres?.map((genre) => genre.name) ?? [],
    rating: rating(show.vote_average, show.vote_count),
    contentRating: text(ageRating?.rating),
    releaseDate: isoDate(show.first_air_date),
    status: text(show.status),
    runtimeMinutes: show.episode_run_time?.[0] || null,
    externalIds,
    images: {
      poster: image(show.poster_path, "w780"),
      backdrop: image(show.backdrop_path, "w1280"),
      logo: pickLogo(show.images?.logos, lang),
    },
    studios: uniqueNames(show.production_companies?.map((c) => c.name) ?? []),
    credits: [...showCast(show.aggregate_credits?.cast), ...showCrew(show)],
    seasons,
    episodes,
  } satisfies TitleDetails
}
