import type { TitleKind } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { titleFeatures } from "@matinee/db"
import { and, eq, or } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { defineQueue } from "../jobs/queue"
import { fetchFeatures } from "../metadata/tmdb/features"
import { keyOf } from "./keys"

export { keyOf } from "./keys"

export const Feature = t.object({
  kind: t.enum(["movie", "show"]),
  tmdbId: t.string(),
  genreIds: t.array(t.number()),
  keywordIds: t.array(t.number()),
  companyIds: t.array(t.number()),
  people: t.array(
    t.object({
      id: t.string(),
      name: t.string(),
      role: t.enum(["director", "creator", "writer", "actor"]),
    }),
  ),
  originalLanguage: t.string().nullable(),
  year: t.number().nullable(),
  rating: t.number().nullable(),
  votes: t.number(),
  popularity: t.number(),
  fetchedAt: t.date(),
})
/** How long a title's features stay before they're fetched again. */
const FRESH_MS = 30 * 86400000
/** Titles read from `title_features` per query, to stay under Postgres's parameter limit. */
const CHUNK = 500

/** Fetches a title's features from TMDB into `title_features`. */
export const featureJobs = defineQueue({
  id: "title-features",
  name: "Title features",
  description:
    "Fetch the genres, keywords, and people of titles from TMDB, for recommendations.",
  concurrency: 2,
  retryAfterMs: 3600000,
  key: keyOf,
  label: keyOf,
  run: async (ref: { kind: TitleKind; tmdbId: string }) => {
    if (!env.MATINEE_TMDB_API_KEY) return null
    const value = await fetchFeatures(ref.kind, ref.tmdbId)
    if (value)
      await db
        .insert(titleFeatures)
        .values(value)
        .onConflictDoUpdate({
          target: [titleFeatures.kind, titleFeatures.tmdbId],
          set: value,
        })
    return value
  },
})
/**
 * The stored features of `refs`, by `keyOf`. Missing and month-old ones
 * are fetched: waited for with `wait`, which a job of another queue may
 * do, or else queued for next time.
 */
export async function featuresFor(
  refs: { kind: TitleKind; tmdbId: string }[],
  wait = false,
) {
  const unique = [...new Map(refs.map((ref) => [keyOf(ref), ref])).values()]
  const stored = []
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK)
    stored.push(
      ...(await db
        .select()
        .from(titleFeatures)
        .where(
          or(
            ...chunk.map((ref) =>
              and(
                eq(titleFeatures.kind, ref.kind),
                eq(titleFeatures.tmdbId, ref.tmdbId),
              ),
            ),
          ),
        )),
    )
  }
  const result = new Map(stored.map((row) => [keyOf(row), Feature.parse(row)]))
  await Promise.all(
    unique.map(async (ref) => {
      const old = result.get(keyOf(ref))
      if (old && old.fetchedAt.getTime() > Date.now() - FRESH_MS) return
      if (wait) {
        try {
          const value = await featureJobs.run(ref, { priority: "low" })
          if (value) result.set(keyOf(ref), value)
        } catch {
          // The feature queue logs the failure. Keep stale features, or skip this title.
        }
      } else featureJobs.push(ref, { priority: "low" })
    }),
  )
  return result
}
