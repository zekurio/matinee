import {
  user,
  recommendation,
  recommendationRun,
  recommendationDismissal,
  userTitleSignal,
  playbackSession,
} from "@matinee/db"
import { eq, ne, and, gt, sql, or, isNull, lt } from "drizzle-orm"

import { viewerOf } from "../access/viewer"
import { db } from "../db"
import { env } from "../env"
import { defineQueue } from "../jobs/queue"
import { events } from "../realtime/events"
import { availability } from "../requests/availability"
import { candidatesFor } from "./candidates"
import { featuresFor, keyOf } from "./features"
import { ALGORITHM, scoreCandidates } from "./score"
import { rebuildSignals } from "./signals"

/*
 * The scoring job, one viewer at a time: rebuild their signals from watch
 * time and favorites, gather candidates, fetch what's missing of their
 * features, rank them, and store the best hundred on the server and the
 * best hundred to ask for. Reads only take the stored rows, so Home and
 * Discover never wait on TMDB for recommendations.
 */

/** How many of each kind of row a viewer keeps: on the server, and to ask for. */
const KEPT = 100

export const recommendations = defineQueue({
  id: "recommendations",
  name: "Recommendations",
  description: "Work out each person's recommendations from what they watched.",
  concurrency: 1,
  retryAfterMs: 60000,
  key: (userId: string) => userId,
  label: (userId: string) => userId,
  joinsRunning: () => false,
  run: async (userId: string) => {
    if (!env.MATINEE_TMDB_API_KEY) return
    const [account] = await db.select().from(user).where(eq(user.id, userId))
    if (!account) return
    const viewer = await viewerOf({
      ...account,
      // Nobody signed in: the task runs for the account on its own.
      credential: { kind: "session", id: "" },
      clientName: null,
    })
    const { signals, signalsAt } = await rebuildSignals(viewer)
    const candidates = signals.some((s) => s.score > 0)
      ? await candidatesFor(viewer, signals)
      : []
    const features = await featuresFor([...signals, ...candidates], true)
    const dismissed = await db
      .select()
      .from(recommendationDismissal)
      .where(eq(recommendationDismissal.userId, userId))
    const otherRows = await db
      .select()
      .from(userTitleSignal)
      .where(
        and(ne(userTitleSignal.userId, userId), gt(userTitleSignal.score, 0)),
      )
    const others = new Map<string, number>()
    for (const row of otherRows)
      others.set(keyOf(row), (others.get(keyOf(row)) ?? 0) + row.score)
    const ranked = scoreCandidates(
      candidates,
      signals,
      features,
      new Set([...signals, ...dismissed].map(keyOf)),
      others,
    )
    const requestable = ranked.filter((r) => !r.titleId)
    const states = await availability(
      viewer,
      requestable.map((r) => ({
        ref: { provider: "tmdb", kind: r.kind, providerId: r.tmdbId },
        externalIds: { tmdb: r.tmdbId },
        releaseDate: r.releaseDate,
      })),
    )
    const allowed = new Set(
      requestable
        .filter((_, i) => {
          const state = states[i]?.availability.state
          return state && state !== "here" && state !== "unavailable"
        })
        .map(keyOf),
    )
    let local = 0
    let remote = 0
    const values = ranked
      .filter((r) =>
        r.titleId ? local++ < KEPT : allowed.has(keyOf(r)) && remote++ < KEPT,
      )
      .map(({ seeds: _seeds, diversity: _diversity, ...row }) => ({
        ...row,
        userId,
        algorithm: ALGORITHM,
      }))
    const run = {
      userId,
      signalsAt,
      algorithm: ALGORITHM,
      computedAt: new Date(),
    }
    await db.transaction(async (tx) => {
      await tx.delete(recommendation).where(eq(recommendation.userId, userId))
      if (values.length) await tx.insert(recommendation).values(values)
      await tx
        .insert(recommendationRun)
        .values(run)
        .onConflictDoUpdate({ target: recommendationRun.userId, set: run })
    })
  },
})
// Playback and watched marks publish this rather than import the queue,
// which would make an import cycle through sessions and statistics.
events.subscribe("recommendations", ({ userId }) =>
  queueRecommendations(userId),
)

/** Works the viewer's recommendations out again, soon but behind other work. */
export function queueRecommendations(userId: string) {
  if (env.MATINEE_TMDB_API_KEY)
    recommendations.push(userId, { priority: "low" })
}
/**
 * Queues everyone without recommendations yet, with a day-old list, or
 * who played something since their list was worked out.
 */
export async function queueStaleRecommendations() {
  if (!env.MATINEE_TMDB_API_KEY) return
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .leftJoin(recommendationRun, eq(recommendationRun.userId, user.id))
    .where(
      or(
        isNull(recommendationRun.userId),
        lt(recommendationRun.computedAt, new Date(Date.now() - 86400000)),
        sql`exists (select 1 from ${playbackSession} where ${playbackSession.userId} = ${user.id} and (${recommendationRun.signalsAt} is null or ${playbackSession.updatedAt} > ${recommendationRun.signalsAt}))`,
      ),
    )
  for (const row of rows) queueRecommendations(row.id)
}
