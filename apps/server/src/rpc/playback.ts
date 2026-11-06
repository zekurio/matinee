import { mediaItem, title, watchProgress } from "@matinee/db"
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm"

import { db } from "../db"
import { episodeOrder, publicItems } from "../media/items"
import { authed, notFound } from "./base"

// Past this share of the runtime, a file counts as watched.
const WATCHED_RATIO = 0.92
// Below this, a start doesn't count, so stray clicks stay out of
// "continue watching". Short clips use a share of their length instead.
const RESUME_MIN_SECONDS = 30

function resumeThreshold(duration: number | null): number {
  return duration
    ? Math.min(RESUME_MIN_SECONDS, duration * 0.1)
    : RESUME_MIN_SECONDS
}

// Files without numbers sort after the numbered ones.
const LAST = 2147483647

/** A file's place in its title: season, episode, then path. */
const position = sql`(coalesce(${mediaItem.seasonNumber}, ${LAST}), coalesce(${mediaItem.episodeNumber}, ${LAST}), ${mediaItem.relativePath})`

function positionOf(row: {
  seasonNumber: number | null
  episodeNumber: number | null
  relativePath: string
}) {
  return sql`(${row.seasonNumber ?? LAST}::int, ${row.episodeNumber ?? LAST}::int, ${row.relativePath}::text)`
}

export const playback = {
  report: authed.playback.report.handler(async ({ context, input }) => {
    const [item] = await db
      .select({ id: mediaItem.id, durationSeconds: mediaItem.durationSeconds })
      .from(mediaItem)
      .where(eq(mediaItem.id, input.itemId))
    if (!item) throw notFound("This title isn't in any library.")

    // The player knows the real runtime; keep it for progress bars.
    const reported = input.durationSeconds
    if (
      reported &&
      (item.durationSeconds === null ||
        Math.abs(item.durationSeconds - reported) > 1)
    ) {
      await db
        .update(mediaItem)
        .set({ durationSeconds: reported })
        .where(eq(mediaItem.id, item.id))
    }
    const duration = reported ?? item.durationSeconds
    const completed =
      duration !== null && input.positionSeconds / duration >= WATCHED_RATIO
    if (!completed && input.positionSeconds < resumeThreshold(duration)) return

    await db
      .insert(watchProgress)
      .values({
        userId: context.user.id,
        mediaItemId: item.id,
        positionSeconds: input.positionSeconds,
        completed,
      })
      .onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.mediaItemId],
        set: {
          positionSeconds: input.positionSeconds,
          // Rewatching part of a finished file keeps it watched.
          completed: sql`${watchProgress.completed} or excluded.completed`,
          updatedAt: new Date(),
        },
      })
  }),

  setWatched: authed.playback.setWatched.handler(async ({ context, input }) => {
    if (!input.watched) {
      await db
        .delete(watchProgress)
        .where(
          and(
            eq(watchProgress.userId, context.user.id),
            eq(watchProgress.mediaItemId, input.itemId),
          ),
        )
      return
    }
    const [item] = await db
      .select({ id: mediaItem.id, durationSeconds: mediaItem.durationSeconds })
      .from(mediaItem)
      .where(eq(mediaItem.id, input.itemId))
    if (!item) throw notFound("This title isn't in any library.")
    await db
      .insert(watchProgress)
      .values({
        userId: context.user.id,
        mediaItemId: item.id,
        positionSeconds: item.durationSeconds ?? 0,
        completed: true,
      })
      .onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.mediaItemId],
        set: { completed: true, updatedAt: new Date() },
      })
  }),
}

export const home = {
  continueWatching: authed.home.continueWatching.handler(
    async ({ context, input }) => {
      const rows = await db
        .select({ item: mediaItem })
        .from(watchProgress)
        .innerJoin(mediaItem, eq(mediaItem.id, watchProgress.mediaItemId))
        .where(
          and(
            eq(watchProgress.userId, context.user.id),
            eq(watchProgress.completed, false),
          ),
        )
        .orderBy(desc(watchProgress.updatedAt))
        .limit(input.limit)
      return publicItems(
        rows.map((row) => row.item),
        context.user.id,
      )
    },
  ),

  nextUp: authed.home.nextUp.handler(async ({ context, input }) => {
    // The most recently finished file of each show or folder. Movies have
    // nothing after them.
    const finished = await db
      .selectDistinctOn([mediaItem.titleId], {
        titleId: mediaItem.titleId,
        seasonNumber: mediaItem.seasonNumber,
        episodeNumber: mediaItem.episodeNumber,
        relativePath: mediaItem.relativePath,
        updatedAt: watchProgress.updatedAt,
      })
      .from(watchProgress)
      .innerJoin(mediaItem, eq(mediaItem.id, watchProgress.mediaItemId))
      .innerJoin(title, eq(title.id, mediaItem.titleId))
      .where(
        and(
          eq(watchProgress.userId, context.user.id),
          eq(watchProgress.completed, true),
          ne(title.kind, "movie"),
        ),
      )
      .orderBy(mediaItem.titleId, desc(watchProgress.updatedAt))
    finished.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

    const next = []
    for (const row of finished) {
      if (next.length >= input.limit) break
      if (!row.titleId) continue
      // The files after it. A few extra skip over any the user already
      // watched or started.
      const candidates = await db
        .select()
        .from(mediaItem)
        .where(
          and(
            eq(mediaItem.titleId, row.titleId),
            sql`${position} > ${positionOf(row)}`,
          ),
        )
        .orderBy(...episodeOrder)
        .limit(10)
      if (candidates.length === 0) continue
      const started = await db
        .select({
          id: watchProgress.mediaItemId,
          completed: watchProgress.completed,
        })
        .from(watchProgress)
        .where(
          and(
            eq(watchProgress.userId, context.user.id),
            inArray(
              watchProgress.mediaItemId,
              candidates.map((candidate) => candidate.id),
            ),
          ),
        )
      const state = new Map(started.map((s) => [s.id, s.completed]))
      for (const candidate of candidates) {
        const completed = state.get(candidate.id)
        if (completed === true) continue
        // An episode in progress already shows under "continue watching".
        if (completed === undefined) next.push(candidate)
        break
      }
    }
    return publicItems(next, context.user.id)
  }),
}
