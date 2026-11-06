import type { ExternalIds } from "@matinee/db"

import { env } from "../env"
import { limiter } from "../media/process"
import { fetchJson } from "./http"
import {
  type Candidate,
  type EpisodeDetails,
  isoDate,
  type Lookup,
  type MetadataSource,
  type SearchQuery,
  type SeasonDetails,
  text,
  type TitleDetails,
  yearOf,
} from "./types"

const API = "https://api.themoviedb.org/3"
const IMAGES = "https://image.tmdb.org/t/p/"
// TMDB allows about 50 requests a second; stay well below.
const limit = limiter(6)
// append_to_response takes at most 20 entries.
const SEASONS_PER_REQUEST = 20

type Named = { name: string }
type Image = { file_path: string; iso_639_1: string | null }
type Images = { logos?: Image[]; posters?: Image[]; backdrops?: Image[] }

type SearchResults<T> = { results: T[] }
type MovieResult = {
  id: number
  title: string
  original_title?: string
  release_date?: string
  overview?: string
  poster_path?: string | null
}
type ShowResult = {
  id: number
  name: string
  original_name?: string
  first_air_date?: string
  overview?: string
  poster_path?: string | null
}

type Movie = MovieResult & {
  tagline?: string
  genres?: Named[]
  vote_average?: number
  vote_count?: number
  runtime?: number | null
  status?: string
  imdb_id?: string | null
  backdrop_path?: string | null
  images?: Images
  release_dates?: {
    results: {
      iso_3166_1: string
      release_dates: { certification: string; type: number }[]
    }[]
  }
}

type Episode = {
  season_number: number
  episode_number: number
  name?: string
  overview?: string
  air_date?: string | null
  runtime?: number | null
  still_path?: string | null
}
type SeasonResult = {
  season_number: number
  name?: string
  overview?: string
  poster_path?: string | null
  episodes?: Episode[]
}

type Show = ShowResult & {
  tagline?: string
  genres?: Named[]
  vote_average?: number
  vote_count?: number
  episode_run_time?: number[]
  status?: string
  backdrop_path?: string | null
  images?: Images
  seasons?: SeasonResult[]
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] }
  external_ids?: { imdb_id?: string | null; tvdb_id?: number | null }
}

type Found = { movie_results: { id: number }[]; tv_results: { id: number }[] }

function apiKey(): string {
  if (!env.tmdbApiKey) throw new Error("MATINEE_TMDB_API_KEY isn't set")
  return env.tmdbApiKey
}

function request<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${API}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  const key = apiKey()
  const headers: Record<string, string> = {}
  // Read access tokens are JWTs; v3 keys are 32 hex characters.
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`
  else url.searchParams.set("api_key", key)
  return limit(() => fetchJson<T>("TMDB", url, { headers }))
}

function image(path: string | null | undefined, size: string): string | null {
  return path ? `${IMAGES}${size}${path}` : null
}

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

function toMovieCandidate(result: MovieResult): Candidate {
  return {
    id: String(result.id),
    name: result.title,
    aliases: result.original_title ? [result.original_title] : [],
    year: yearOf(result.release_date),
    overview: text(result.overview),
    poster: image(result.poster_path, "w342"),
  }
}

function toShowCandidate(result: ShowResult): Candidate {
  return {
    id: String(result.id),
    name: result.name,
    aliases: result.original_name ? [result.original_name] : [],
    year: yearOf(result.first_air_date),
    overview: text(result.overview),
    poster: image(result.poster_path, "w342"),
  }
}

async function search(query: SearchQuery): Promise<Candidate[]> {
  const run = async (year: number | null) => {
    if (query.kind === "movie") {
      const data = await request<SearchResults<MovieResult>>("/search/movie", {
        query: query.name,
        year: year ?? undefined,
        language: query.language,
        include_adult: "false",
      })
      return data.results.map(toMovieCandidate)
    }
    const data = await request<SearchResults<ShowResult>>("/search/tv", {
      query: query.name,
      first_air_date_year: year ?? undefined,
      language: query.language,
      include_adult: "false",
    })
    return data.results.map(toShowCandidate)
  }
  const results = await run(query.year)
  // Folder years are often a year off from TMDB's release date.
  return results.length === 0 && query.year ? run(null) : results
}

async function lookup(ids: ExternalIds, { kind }: Lookup) {
  if (ids.tmdb) return ids.tmdb
  const sources: [string | undefined, string][] = [
    [ids.imdb, "imdb_id"],
    [ids.tvdb, "tvdb_id"],
  ]
  for (const [id, source] of sources) {
    if (!id) continue
    const found = await request<Found>(`/find/${encodeURIComponent(id)}`, {
      external_source: source,
    })
    const match = kind === "movie" ? found.movie_results : found.tv_results
    if (match[0]) return String(match[0].id)
  }
  return null
}

async function movieDetails(id: string, language: string) {
  const { lang, region } = languageParts(language)
  const movie = await request<Movie>(`/movie/${encodeURIComponent(id)}`, {
    language,
    append_to_response: "images,release_dates",
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
    seasons: [],
    episodes: [],
  } satisfies TitleDetails
}

async function showDetails(id: string, language: string) {
  const { lang, region } = languageParts(language)
  const path = `/tv/${encodeURIComponent(id)}`
  const show = await request<Show>(path, {
    language,
    append_to_response: "images,content_ratings,external_ids",
    include_image_language: `${lang},en,null`,
  })

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
        name: text(season.name),
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
    seasons,
    episodes,
  } satisfies TitleDetails
}

export const tmdb: MetadataSource = {
  id: "tmdb",
  name: "TMDB",
  description:
    "The Movie Database. Movies and shows, with episode stills and logos. Radarr uses it.",
  episodes: true,
  setup: "Set MATINEE_TMDB_API_KEY to an API key or read access token.",
  configured: () => Boolean(env.tmdbApiKey),
  search,
  lookup,
  details: (id, { kind, language }) =>
    kind === "movie" ? movieDetails(id, language) : showDetails(id, language),
}
