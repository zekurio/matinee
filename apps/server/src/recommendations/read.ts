import {
  NO_CATALOG_FILTERS,
  type HomeRecommendations,
  type RecommendationSeed,
  type DiscoverRail,
  type TitleKind,
  type CatalogRef,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  recommendation,
  recommendationDismissal,
  recommendationRun,
  recommendationImpression,
  title,
  userTitleSignal,
  type RecommendationRow,
} from "@matinee/db"
import { and, desc, eq, isNull, notExists } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { visibleTitles } from "../access/visible"
import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { toSummaries } from "../media/items"

/*
 * The rows Home and Discover show from a viewer's stored
 * recommendations. "Recommended for you" takes the best twenty; the
 * rest that came from one watched title make up to two "Because you
 * watched" rows of at least five, for the titles watched last. Home
 * takes the titles on the server, under the viewer's library access;
 * Discover the ones to ask for, its "For you" as a browse that
 * `browse.ts` reads. Whatever a row shows is logged once a day per
 * title, to measure against what the viewer went on to play or ask for.
 */

const FOR_YOU = 20
const BECAUSE_ROWS = 2
const BECAUSE_MIN = 5

type Rail = t.infer<typeof DiscoverRail>

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
export function notDismissed(viewer: Viewer) {
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
type Group = {
  id: "forYou" | "becauseWatched"
  seed: RecommendationSeed | null
  rows: RecommendationRow[]
}
/**
 * The rows of `rows`, best first. "Recommended for you" takes the best
 * twenty. Of the rest, five or more that came from one title the viewer
 * watched make a "Because you watched" row, up to two, for the titles
 * they watched last.
 */
async function groups(viewer: Viewer, rows: RecommendationRow[]) {
  if (!rows.length) return []
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
  const enough = [...seeds.values()].filter((g) => g.rows.length >= BECAUSE_MIN)
  const watched = enough.length
    ? await db
        .select()
        .from(userTitleSignal)
        .where(eq(userTitleSignal.userId, viewer.id))
    : []
  const last = new Map(
    watched.map((w) => [
      `${w.kind}:${w.tmdbId}`,
      w.lastWatchedAt?.getTime() ?? 0,
    ]),
  )
  const lastOf = (g: { seed: RecommendationSeed }) =>
    last.get(`${g.seed.ref.kind}:${g.seed.ref.providerId}`) ?? 0
  const result: Group[] = [
    { id: "forYou", seed: null, rows: rows.slice(0, FOR_YOU) },
  ]
  for (const group of enough
    .toSorted((a, b) => lastOf(b) - lastOf(a))
    .slice(0, BECAUSE_ROWS))
    result.push({
      id: "becauseWatched",
      seed: group.seed,
      rows: group.rows.slice(0, FOR_YOU),
    })
  return result
}
export function impressions(
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
  const rails = (
    await groups(
      viewer,
      rows.map((r) => r.recommendation),
    )
  ).map((group) => {
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
/** The viewer's recommendations to ask for, of `kinds`, best first. */
async function discoverRows(viewer: Viewer, kinds: TitleKind[]) {
  if (!env.MATINEE_TMDB_API_KEY || !kinds.length) return []
  // ACCESS: titles to ask for only, which no library holds.
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
  return rows.filter((row) => kinds.includes(row.kind))
}
/**
 * Discover's recommendation rows, first among its rows, of the kinds
 * the viewer can ask for. "For you" is a browse of their
 * recommendations to ask for; "Because you watched" holds what came
 * from one title, with no browse behind it.
 */
export async function discoverRails(
  viewer: Viewer,
  kinds: TitleKind[],
): Promise<Rail[]> {
  const rows = await discoverRows(viewer, kinds)
  const held = kinds.filter((kind) => rows.some((row) => row.kind === kind))
  return (await groups(viewer, rows)).map((group) => ({
    id: group.id,
    seed: group.seed,
    browse:
      group.id === "forYou"
        ? {
            kinds: held,
            filters: {
              ...NO_CATALOG_FILTERS,
              recommended: true,
              requestable: true,
            },
            sort: "forYou",
          }
        : null,
  }))
}
/** What a "Because you watched" row of Discover holds, best first; none for a title it isn't for. */
export async function discoverBecause(
  viewer: Viewer,
  kinds: TitleKind[],
  seed: RecommendationSeed,
) {
  const group = (await groups(viewer, await discoverRows(viewer, kinds))).find(
    (g) => g.id === "becauseWatched" && sameSeed(g.seed, seed),
  )
  return group?.rows ?? []
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
