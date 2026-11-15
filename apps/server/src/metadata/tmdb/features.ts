import type { TitleKind } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import type { FeaturePerson, FeatureRating } from "@matinee/db"

import { yearOf } from "../types"
import { request } from "./client"

const Named = t.object({ id: t.number(), name: t.string() })
const Payload = t.object({
  adult: t.boolean().optional(),
  genres: t.array(Named),
  keywords: t.object({
    keywords: t.array(Named).optional(),
    results: t.array(Named).optional(),
  }),
  credits: t.object({
    cast: t.array(Named.extend({ order: t.number() })),
    crew: t.array(Named.extend({ job: t.string(), department: t.string() })),
  }),
  created_by: t.array(Named).optional(),
  production_companies: t.array(Named),
  original_language: t.string(),
  release_date: t.string().optional(),
  first_air_date: t.string().optional(),
  runtime: t.number().nullable().optional(),
  episode_run_time: t.array(t.number()).optional(),
  last_episode_to_air: t
    .object({ runtime: t.number().nullable().optional() })
    .nullable()
    .optional(),
  release_dates: t
    .object({
      results: t.array(
        t.object({
          iso_3166_1: t.string(),
          release_dates: t.array(t.object({ certification: t.string() })),
        }),
      ),
    })
    .optional(),
  content_ratings: t
    .object({
      results: t.array(
        t.object({ iso_3166_1: t.string(), rating: t.string() }),
      ),
    })
    .optional(),
  vote_average: t.number(),
  vote_count: t.number(),
  popularity: t.number(),
})
/**
 * What recommendations compare a title by, in one call: its genres,
 * keywords, directors, up to three writers, a show's creators, the top
 * eight of the cast, its companies, language, year, score and
 * popularity, with its runtime and age ratings for browsing them. Null
 * for an adult title.
 */
export async function fetchFeatures(kind: TitleKind, tmdbId: string) {
  const row = Payload.parse(
    await request(
      `/${kind === "movie" ? "movie" : "tv"}/${encodeURIComponent(tmdbId)}`,
      {
        append_to_response: `keywords,credits,${kind === "movie" ? "release_dates" : "content_ratings"}`,
      },
    ),
  )
  if (row.adult) return null
  const people: FeaturePerson[] = []
  for (const person of row.credits.crew.filter((p) => p.job === "Director"))
    people.push({ id: String(person.id), name: person.name, role: "director" })
  for (const person of row.credits.crew
    .filter((p) => p.department === "Writing")
    .slice(0, 3))
    people.push({ id: String(person.id), name: person.name, role: "writer" })
  for (const person of row.created_by ?? [])
    people.push({ id: String(person.id), name: person.name, role: "creator" })
  for (const person of row.credits.cast
    .sort((a, b) => a.order - b.order)
    .slice(0, 8))
    people.push({ id: String(person.id), name: person.name, role: "actor" })
  // A film's first rating in each country, of all its releases there.
  const ratings: FeatureRating[] = []
  for (const entry of row.release_dates?.results ?? []) {
    const rating = entry.release_dates.find((r) => r.certification)
    if (rating)
      ratings.push({ country: entry.iso_3166_1, rating: rating.certification })
  }
  for (const entry of row.content_ratings?.results ?? [])
    if (entry.rating)
      ratings.push({ country: entry.iso_3166_1, rating: entry.rating })
  const runtime =
    kind === "movie"
      ? row.runtime
      : (row.episode_run_time?.[0] ?? row.last_episode_to_air?.runtime)
  return {
    kind,
    tmdbId,
    runtimeMinutes: runtime ? Math.round(runtime) : null,
    ratings,
    genreIds: row.genres.map((p) => p.id),
    keywordIds: (row.keywords.keywords ?? row.keywords.results ?? []).map(
      (p) => p.id,
    ),
    people,
    companyIds: row.production_companies.map((p) => p.id),
    originalLanguage: row.original_language,
    year: yearOf(row.release_date ?? row.first_air_date),
    rating: row.vote_average,
    votes: row.vote_count,
    popularity: row.popularity,
    fetchedAt: new Date(),
  }
}
