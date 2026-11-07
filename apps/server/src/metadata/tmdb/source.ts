import type { ExternalIds } from "@matinee/db"

import { env } from "../../env"
import {
  type Candidate,
  type Lookup,
  type MetadataSource,
  type SearchQuery,
  text,
  yearOf,
} from "../types"
import { image, request } from "./client"
import { movieDetails, showDetails } from "./details"
import type { Found, MovieResult, SearchResults, ShowResult } from "./payloads"

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
