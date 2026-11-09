import { randomUUID } from "node:crypto"

import type { WatchedAt } from "@matinee/contracts"
import {
  episode,
  mediaItem,
  playbackSession,
  title,
  watchProgress,
} from "@matinee/db"
import { and, eq, inArray, type SQL, sql } from "drizzle-orm"

import type { Tx } from "../auth/users"
import { db } from "../db"
import { fileDuration } from "../stats/sql"

/*
 * Marking files watched by hand. Statistics count a mark as Trakt does, as
 * a play at the time the user gives: a playback session with `marked` set,
 * holding the runtime the player didn't cover. Unmarking takes those plays
 * back; what the player recorded stays.
 */

// Rows per insert, well under Postgres's limit of 65535 parameters.
const INSERT_BATCH = 1000

/** The file's runtime in seconds: its own, else the provider's, else 0. */
const runtime =
  sql<number>`coalesce(${fileDuration}, ${episode.runtimeMinutes} * 60, ${title.runtimeMinutes} * 60, 0)`.mapWith(
    Number,
  )

/** A YYYY-MM-DD day at noon UTC, which is that date on nearly every clock. */
function noonOf(day: string): Date {
  return new Date(`${day}T12:00:00Z`)
}

/**
 * When the user watched a file, as `watchedAt` asks, and whether that's
 * its release date. `released` is the episode's air date or the movie's
 * release date.
 */
function watchedTime(
  watchedAt: WatchedAt | undefined,
  released: string | null,
  now: Date,
) {
  if (watchedAt instanceof Date) {
    return { at: watchedAt > now ? now : watchedAt, releaseDated: false }
  }
  if (watchedAt === "released" && released) {
    const at = noonOf(released)
    if (at <= now) return { at, releaseDated: true }
  }
  return { at: now, releaseDated: false }
}

/**
 * Add a marked play for each of the user's files in `files` that isn't
 * watched yet. It holds the runtime past the resume point; the player
 * counted any time before it.
 */
async function addMarkedPlays(
  tx: Tx,
  userId: string,
  files: SQL | undefined,
  watchedAt: WatchedAt | undefined,
): Promise<void> {
  const rows = await tx
    .select({
      itemId: mediaItem.id,
      titleId: title.id,
      kind: title.kind,
      runtime,
      position: watchProgress.positionSeconds,
      airDate: episode.airDate,
      releaseDate: title.releaseDate,
    })
    .from(mediaItem)
    .leftJoin(title, eq(title.id, mediaItem.titleId))
    .leftJoin(
      episode,
      and(
        eq(episode.titleId, mediaItem.titleId),
        eq(episode.seasonNumber, mediaItem.seasonNumber),
        eq(episode.episodeNumber, mediaItem.episodeNumber),
      ),
    )
    .leftJoin(
      watchProgress,
      and(
        eq(watchProgress.mediaItemId, mediaItem.id),
        eq(watchProgress.userId, userId),
      ),
    )
    .where(and(files, sql`${watchProgress.completed} is not true`))
  const now = new Date()
  const plays = rows.map((row) => {
    const released = row.kind === "show" ? row.airDate : row.releaseDate
    const { at, releaseDated } = watchedTime(watchedAt, released, now)
    const seconds = Math.max(0, row.runtime - (row.position ?? 0))
    return {
      id: randomUUID(),
      userId,
      mediaItemId: row.itemId,
      titleId: row.titleId,
      titleKind: row.kind,
      positionSeconds: row.runtime,
      watchedSeconds: seconds,
      completed: true,
      marked: true,
      releaseDated,
      startedAt: new Date(at.getTime() - seconds * 1000),
      updatedAt: at,
      endedAt: at,
    }
  })
  for (let start = 0; start < plays.length; start += INSERT_BATCH) {
    await tx
      .insert(playbackSession)
      .values(plays.slice(start, start + INSERT_BATCH))
  }
}

/** Mark the user's files in `files` watched, each at `watchedAt`. */
export async function markWatched(
  userId: string,
  files: SQL | undefined,
  watchedAt: WatchedAt | undefined,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Two marks at once would both find the files unwatched and add a
    // play each.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`marks:${userId}`}, 0))`,
    )
    await addMarkedPlays(tx, userId, files, watchedAt)
    // One statement, so every file gets the same time; reverseEpisodeOrder
    // then counts the last one as the latest for Play and next up.
    await tx
      .insert(watchProgress)
      .select(
        tx
          .select({
            userId: sql`${userId}::uuid`.as("user_id"),
            mediaItemId: mediaItem.id,
            positionSeconds: sql`coalesce(${mediaItem.durationSeconds}, 0)`.as(
              "position_seconds",
            ),
            completed: sql`true`.as("completed"),
            updatedAt: sql`now()`.as("updated_at"),
          })
          .from(mediaItem)
          .where(files),
      )
      .onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.mediaItemId],
        set: { completed: true, updatedAt: sql`now()` },
      })
  })
}

/**
 * Mark the user's files in `files` unwatched: forget where they were, and
 * take back the plays marking them added.
 */
export async function markUnwatched(
  userId: string,
  files: SQL | undefined,
): Promise<void> {
  const ids = db.select({ id: mediaItem.id }).from(mediaItem).where(files)
  await db.transaction(async (tx) => {
    await tx
      .delete(watchProgress)
      .where(
        and(
          eq(watchProgress.userId, userId),
          inArray(watchProgress.mediaItemId, ids),
        ),
      )
    await tx
      .delete(playbackSession)
      .where(
        and(
          eq(playbackSession.userId, userId),
          eq(playbackSession.marked, true),
          inArray(playbackSession.mediaItemId, ids),
        ),
      )
  })
}
