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
import {
  ALGORITHM,
  diversify,
  rankCandidates,
  type Candidate,
  type Ranked,
} from "./score"
import { rebuildSignals } from "./signals"

/*
 * The scoring job, one viewer at a time: rebuild their signals from watch
 * time and favorites, gather candidates, fetch what's missing of their
 * features, rank them, and store a list of each sort a viewer sees
 * apart: the best hundred on the server, and the best hundred films and
 * the best hundred shows to ask for. Reads only take the stored rows, so
 * Home and Discover never wait on TMDB for recommendations.
 */

/** How long each stored list is: the titles on the server, and each kind's to ask for. */
const KEPT = 100
/**
 * How many of a kind's best titles to ask for have their state read
 * before the list is picked, so the ones here or declined leave it and
 * still leave enough to pick from.
 */
const ASKED = 400
const KINDS = ["movie", "show"] satisfies Candidate["kind"][]

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
    const ranked = rankCandidates(
      candidates,
      signals,
      features,
      new Set([...signals, ...dismissed].map(keyOf)),
      others,
    )
    const lists: Ranked[][] = [
      diversify(
        ranked.filter((r) => r.titleId),
        KEPT,
      ),
    ]
    for (const kind of KINDS) {
      const asked = ranked
        .filter((r) => !r.titleId && r.kind === kind)
        .slice(0, ASKED)
      const states = await availability(
        viewer,
        asked.map((r) => ({
          ref: { provider: "tmdb", kind: r.kind, providerId: r.tmdbId },
          externalIds: { tmdb: r.tmdbId },
          releaseDate: r.releaseDate,
        })),
      )
      lists.push(
        diversify(
          asked.filter((_, i) => {
            const state = states[i]?.availability.state
            return state && state !== "here" && state !== "unavailable"
          }),
          KEPT,
        ),
      )
    }
    // A stored score is a title's place in its list, the best highest, so
    // lists read together fall in turn. The score that ranked it rides
    // along below the point, to tell what a place was worth.
    const values = lists.flatMap((list) =>
      list.map(({ seeds: _seeds, diversity: _diversity, ...row }, index) => ({
        ...row,
        score: KEPT - index + row.score / 1000,
        userId,
        algorithm: ALGORITHM,
      })),
    )
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
