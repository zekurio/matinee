import type {
  CatalogRef,
  HomeRecommendations,
  RecommendationSeed,
  DiscoverRail,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  recommendation,
  recommendationDismissal,
  recommendationRun,
  recommendationImpression,
  title,
  type RecommendationRow,
} from "@matinee/db"
import { and, desc, eq, isNull, notExists } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { visibleTitles } from "../access/visible"
import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import {
  placeholders,
  saveArtwork,
  queueArtwork,
  toArtwork,
} from "../media/artwork"
import { toSummaries } from "../media/items"
import { availability } from "../requests/availability"
import { destinations } from "../requests/destinations"

/*
 * The rows Home and Discover show from a viewer's stored recommendations.
 * "Recommended for you" takes the best twenty; the rest that came from
 * one watched title make up to two "Because you watched" rows of at
 * least five. Home takes the titles on the server, under the viewer's
 * library access; Discover the ones to ask for, with their availability
 * read again. Whatever a row shows is logged once a day per title, to
 * measure against what the viewer went on to play or ask for.
 */

const FOR_YOU = 20
const BECAUSE_ROWS = 2
const BECAUSE_MIN = 5
const PAGE = 20

/** A stored reason, as the scoring job wrote it. */
const Reason = t.union([
  t.object({
    kind: t.literal("watched"),
    seed: t.object({
      kind: t.enum(["movie", "show"]),
      tmdbId: t.string(),
      name: t.string(),
    }),
  }),
  t.object({
    kind: t.literal("person"),
    personId: t.string(),
    name: t.string(),
  }),
  t.object({ kind: t.literal("taste") }),
])
const refOf = (row: RecommendationRow): CatalogRef => ({
  provider: "tmdb",
  kind: row.kind,
  providerId: row.tmdbId,
})
function notDismissed(viewer: Viewer) {
  return notExists(
    db
      .select()
      .from(recommendationDismissal)
      .where(
        and(
          eq(recommendationDismissal.userId, viewer.id),
          eq(recommendationDismissal.kind, recommendation.kind),
          eq(recommendationDismissal.tmdbId, recommendation.tmdbId),
        ),
      ),
  )
}
function groups(rows: RecommendationRow[]) {
  const result: {
    id: "forYou" | "becauseWatched"
    seed: RecommendationSeed | null
    rows: RecommendationRow[]
  }[] = []
  if (!rows.length) return result
  result.push({ id: "forYou", seed: null, rows: rows.slice(0, FOR_YOU) })
  const seeds = new Map<
    string,
    { seed: RecommendationSeed; rows: RecommendationRow[] }
  >()
  for (const row of rows.slice(FOR_YOU)) {
    const reason = Reason.parse(row.reason)
    if (reason.kind !== "watched") continue
    const s = reason.seed
    const key = `${s.kind}:${s.tmdbId}`
    let group = seeds.get(key)
    if (!group) {
      group = {
        seed: {
          ref: { provider: "tmdb", kind: s.kind, providerId: s.tmdbId },
          name: s.name,
        },
        rows: [],
      }
      seeds.set(key, group)
    }
    group.rows.push(row)
  }
  for (const group of [...seeds.values()]
    .filter((g) => g.rows.length >= BECAUSE_MIN)
    .slice(0, BECAUSE_ROWS))
    result.push({
      id: "becauseWatched",
      ...group,
      rows: group.rows.slice(0, FOR_YOU),
    })
  return result
}
function impressions(
  viewer: Viewer,
  rows: RecommendationRow[],
  surface: "home" | "discover",
  rail: string,
) {
  if (!rows.length) return
  void db
    .insert(recommendationImpression)
    .values(
      rows.map((row, position) => ({
        userId: viewer.id,
        kind: row.kind,
        tmdbId: row.tmdbId,
        surface,
        rail,
        position,
        score: row.score,
        algorithm: row.algorithm,
        day: new Date().toISOString().slice(0, 10),
      })),
    )
    .onConflictDoNothing()
    .catch((cause) =>
      log.error("Cannot record recommendation impressions", cause),
    )
}
/** Home's rows, of titles in libraries the viewer can see. */
export async function home(
  viewer: Viewer,
): Promise<t.infer<typeof HomeRecommendations>> {
  if (!env.MATINEE_TMDB_API_KEY) return { rails: [], computedAt: null }
  const rows = await db
    .select({ recommendation, title })
    .from(recommendation)
    .innerJoin(title, eq(title.id, recommendation.titleId))
    .where(
      and(
        eq(recommendation.userId, viewer.id),
        visibleTitles(viewer),
        notDismissed(viewer),
      ),
    )
    .orderBy(desc(recommendation.score))
  const summaries = await toSummaries(
    rows.map((r) => r.title),
    viewer.id,
  )
  const byId = new Map(rows.map((row, i) => [row.title.id, summaries[i]]))
  const rails = groups(rows.map((r) => r.recommendation)).map((group) => {
    impressions(viewer, group.rows, "home", group.id)
    return {
      id: group.id,
      seed: group.seed,
      items: group.rows.flatMap((row) => {
        const summary = row.titleId ? byId.get(row.titleId) : null
        if (!summary) return []
        const reason = Reason.parse(row.reason)
        return [
          {
            ref: refOf(row),
            title: summary,
            reason: {
              kind: reason.kind,
              name:
                reason.kind === "watched"
                  ? reason.seed.name
                  : reason.kind === "person"
                    ? reason.name
                    : null,
            },
          },
        ]
      }),
    }
  })
  const [run] = await db
    .select()
    .from(recommendationRun)
    .where(eq(recommendationRun.userId, viewer.id))
  return { rails, computedAt: run?.computedAt ?? null }
}
async function discoverRows(viewer: Viewer) {
  if (!env.MATINEE_TMDB_API_KEY) return []
  const [movies, shows] = await Promise.all([
    destinations(viewer, "movie"),
    destinations(viewer, "show"),
  ])
  const rows = await db
    .select()
    .from(recommendation)
    .where(
      and(
        eq(recommendation.userId, viewer.id),
        isNull(recommendation.titleId),
        notDismissed(viewer),
      ),
    )
    .orderBy(desc(recommendation.score))
  return rows.filter((row) =>
    row.kind === "movie" ? movies.length : shows.length,
  )
}
/** Discover's recommendation rows, first among its rows. */
export async function discoverRails(
  viewer: Viewer,
): Promise<t.infer<typeof DiscoverRail>[]> {
  return groups(await discoverRows(viewer)).map(({ id, seed }) => ({
    id,
    seed,
  }))
}
/** A page of one of Discover's recommendation rows; "For you" pages through all of them. */
export async function discoverPage(
  viewer: Viewer,
  rail: t.infer<typeof DiscoverRail>,
  page: number,
) {
  const rows = await discoverRows(viewer)
  const group = groups(rows).find(
    (g) => g.id === rail.id && sameSeed(g.seed, rail.seed),
  )
  const selected = rail.id === "forYou" ? rows : (group?.rows ?? [])
  const states = await availability(
    viewer,
    selected.map((r) => ({
      ref: refOf(r),
      externalIds: { tmdb: r.tmdbId },
      releaseDate: r.releaseDate,
    })),
  )
  const available = selected.flatMap((row, i) => {
    const state = states[i]?.availability
    return state && state.state !== "here" && state.state !== "unavailable"
      ? [{ row, state }]
      : []
  })
  const start = (page - 1) * PAGE
  const chunk = available.slice(start, start + PAGE)
  const saved = await saveArtwork(chunk.map((r) => r.row.poster))
  const art = await placeholders([...saved.values()])
  queueArtwork([...saved.values()], "low")
  impressions(
    viewer,
    chunk.map((r) => r.row),
    "discover",
    rail.id,
  )
  return {
    items: chunk.map(({ row, state }) => ({
      ref: refOf(row),
      name: row.name,
      year: row.year,
      poster: toArtwork(
        row.poster ? (saved.get(row.poster) ?? null) : null,
        art,
      ),
      availability: state,
    })),
    nextPage: available.length > start + PAGE ? page + 1 : null,
    stale: false,
  }
}
export function sameSeed(
  a: RecommendationSeed | null,
  b: RecommendationSeed | null,
) {
  return (
    a?.ref.provider === b?.ref.provider &&
    a?.ref.kind === b?.ref.kind &&
    a?.ref.providerId === b?.ref.providerId
  )
}
