import type { ExternalIds } from "@matinee/db"

import { env } from "../../env"
import {
  type Candidate,
  type Lookup,
  type MetadataSource,
  type SearchQuery,
  text,
} from "../types"
import { request } from "./client"
import { movieDetails, seriesDetails } from "./details"
import { tvdbLanguage } from "./language"
import { absolute } from "./mapping"
import type { SearchResult } from "./payloads"

async function search(query: SearchQuery): Promise<Candidate[]> {
  const lang = tvdbLanguage(query.language)
  const run = async (year: number | null) => {
    const res = await request<SearchResult[]>("/search", {
      query: query.name,
      type: query.kind === "movie" ? "movie" : "series",
      year: year ?? undefined,
      limit: 20,
    })
    return res.data.map((result): Candidate => ({
      id: result.tvdb_id,
      name: result.translations?.[lang] ?? result.name,
      aliases: [
        result.name,
        ...Object.values(result.translations ?? {}),
        ...(result.aliases ?? []),
      ],
      year: result.year ? Number(result.year) || null : null,
      overview: text(
        result.overviews?.[lang] ?? result.overviews?.eng ?? result.overview,
      ),
      poster: absolute(result.image_url ?? result.thumbnail),
    }))
  }
  const results = await run(query.year)
  return results.length === 0 && query.year ? run(null) : results
}

async function lookup(ids: ExternalIds, { kind }: Lookup) {
  if (ids.tvdb) return ids.tvdb
  for (const id of [ids.imdb, ids.tmdb]) {
    if (!id) continue
    const res = await request<
      { series?: { id: number }; movie?: { id: number } }[]
    >(`/search/remoteid/${encodeURIComponent(id)}`)
    for (const hit of res.data) {
      const match = kind === "movie" ? hit.movie : hit.series
      if (match) return String(match.id)
    }
  }
  return null
}

export const tvdb: MetadataSource = {
  id: "tvdb",
  name: "TheTVDB",
  description:
    "Shows in the season order Sonarr uses, plus movies, logos, and episode images.",
  episodes: true,
  setup:
    "Set MATINEE_TVDB_API_KEY, and MATINEE_TVDB_PIN if your key needs a subscriber PIN.",
  configured: () => Boolean(env.tvdbApiKey),
  search,
  lookup,
  details: (id, { kind, language }) =>
    kind === "movie" ? movieDetails(id, language) : seriesDetails(id, language),
}
