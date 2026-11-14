import type { CatalogRef } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import { yearOf } from "../types"
import { image, request } from "./client"

/*
 * TMDB's discover endpoints, for browsing the catalog of one kind with
 * filters, and the lists their filters take: genres, age ratings, and
 * languages.
 */

const Result = t.object({
  id: t.number(),
  adult: t.boolean().optional(),
  title: t.string().optional(),
  name: t.string().optional(),
  release_date: t.string().optional(),
  first_air_date: t.string().optional(),
  poster_path: t.string().nullable().optional(),
  vote_average: t.number().optional(),
  vote_count: t.number().optional(),
})
const Page = t.object({ results: t.array(Result), total_pages: t.number() })

export const BrowseItem = t.object({
  id: t.string(),
  name: t.string(),
  year: t.number().nullable(),
  poster: t.string().nullable(),
  releaseDate: t.string().nullable(),
  /** Null before anyone voted. */
  score: t.number().nullable(),
  votes: t.number(),
})

export const BrowseResult = t.object({
  items: t.array(BrowseItem),
  nextPage: t.number().nullable(),
})

/** A browse as TMDB's discover endpoint takes it, already checked. */
export type DiscoverQuery = {
  genres: number[]
  yearFrom: number | null
  yearTo: number | null
  scoreMin: number | null
  scoreMax: number | null
  votesMin: number | null
  /** Every rating that passes, in the country they belong to. */
  ratings: { country: string; ratings: string[] } | null
  language: string | null
  runtimeMin: number | null
  runtimeMax: number | null
  /** TMDB's `sort_by` without the kind's own date and name fields. */
  sort: {
    by: "popularity" | "vote_average" | "vote_count" | "date" | "name"
    direction: "asc" | "desc"
  }
}

/** A page of titles of one kind that match `query`, without adult ones. */
export async function discover(
  kind: CatalogRef["kind"],
  language: string,
  query: DiscoverQuery,
  page: number,
): Promise<t.infer<typeof BrowseResult>> {
  const type = kind === "movie" ? "movie" : "tv"
  const date = kind === "movie" ? "primary_release_date" : "first_air_date"
  const name = kind === "movie" ? "title" : "name"
  const by =
    query.sort.by === "date"
      ? date
      : query.sort.by === "name"
        ? name
        : query.sort.by
  const params = new Map<string, string | number>([
    ["language", language],
    ["page", page],
    ["include_adult", "false"],
    ["sort_by", `${by}.${query.sort.direction}`],
  ])
  // A comma asks for every genre at once, as TMDB's own site does.
  if (query.genres.length) params.set("with_genres", query.genres.join(","))
  if (query.yearFrom !== null)
    params.set(`${date}.gte`, `${query.yearFrom}-01-01`)
  if (query.yearTo !== null) params.set(`${date}.lte`, `${query.yearTo}-12-31`)
  if (query.scoreMin !== null) params.set("vote_average.gte", query.scoreMin)
  if (query.scoreMax !== null) params.set("vote_average.lte", query.scoreMax)
  if (query.votesMin !== null) params.set("vote_count.gte", query.votesMin)
  if (query.ratings) {
    // The ratings by name, joined by "or". `certification.lte` would
    // also let in the titles nobody rated, which TMDB orders below the
    // mildest rating.
    params.set("certification_country", query.ratings.country)
    params.set("certification", query.ratings.ratings.join("|"))
  }
  if (query.language) params.set("with_original_language", query.language)
  if (query.runtimeMin !== null)
    params.set("with_runtime.gte", query.runtimeMin)
  if (query.runtimeMax !== null)
    params.set("with_runtime.lte", query.runtimeMax)
  const data = Page.parse(
    await request(`/discover/${type}`, Object.fromEntries(params)),
  )
  return {
    items: data.results
      .filter((row) => !row.adult)
      .map((row) => ({
        id: String(row.id),
        name: row.title ?? row.name ?? "",
        year: yearOf(row.release_date ?? row.first_air_date),
        poster: image(row.poster_path, "w342"),
        releaseDate: row.release_date || row.first_air_date || null,
        score: row.vote_count ? (row.vote_average ?? null) : null,
        votes: row.vote_count ?? 0,
      })),
    // TMDB serves no page past the 500th.
    nextPage: page < Math.min(data.total_pages, 500) ? page + 1 : null,
  }
}

export const Genres = t.object({
  genres: t.array(t.object({ id: t.number(), name: t.string() })),
})

/** The genres of a kind, named in `language`. */
export async function genres(
  kind: CatalogRef["kind"],
  language: string,
): Promise<t.infer<typeof Genres>> {
  const type = kind === "movie" ? "movie" : "tv"
  return Genres.parse(await request(`/genre/${type}/list`, { language }))
}

const Certification = t.object({
  certification: t.string(),
  order: t.number(),
})

export const Certifications = t.object({
  certifications: t.record(t.string(), t.array(Certification)),
})

/** Every country's age ratings for a kind, each with its place in order. */
export async function certifications(
  kind: CatalogRef["kind"],
): Promise<t.infer<typeof Certifications>> {
  const type = kind === "movie" ? "movie" : "tv"
  return Certifications.parse(await request(`/certification/${type}/list`, {}))
}

export const Languages = t.object({
  languages: t.array(t.object({ id: t.string(), name: t.string() })),
})

/** The languages TMDB knows a title to be made in, with their English names. */
export async function languages(): Promise<t.infer<typeof Languages>> {
  const rows = t
    .array(t.object({ iso_639_1: t.string(), english_name: t.string() }))
    .parse(await request("/configuration/languages", {}))
  return {
    languages: rows.map((row) => ({
      id: row.iso_639_1,
      name: row.english_name,
    })),
  }
}
