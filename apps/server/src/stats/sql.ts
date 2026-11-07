import { mediaItem, playbackSession } from "@matinee/db"
import { type SQL, sql } from "drizzle-orm"

// A session counts as a play past this, or once it reaches the end.
const PLAY_MIN_SECONDS = 60

/** A file's length: the player's measure, else ffprobe's. */
export const fileDuration = sql`coalesce(${mediaItem.durationSeconds}, (${mediaItem.probe} -> 'format' ->> 'durationSeconds')::double precision)`

export const isPlay = sql`(${playbackSession.watchedSeconds} >= ${PLAY_MIN_SECONDS} or ${playbackSession.completed})`

export function watchedSum() {
  return sql<number>`coalesce(sum(${playbackSession.watchedSeconds}), 0)`.mapWith(
    Number,
  )
}

/** Sessions matching `filter` that count as plays. */
export function playCount(filter?: SQL) {
  const where = filter ? sql`${isPlay} and ${filter}` : isPlay
  return sql<number>`count(*) filter (where ${where})`.mapWith(Number)
}
