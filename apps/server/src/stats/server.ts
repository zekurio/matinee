import {
  type MethodStat,
  type NamedCount,
  PLAYBACK_METHODS,
  type TranscodingStats,
  type UserStat,
} from "@matinee/contracts"
import { playbackSession, user } from "@matinee/db"
import { and, count, desc, eq, isNotNull, type SQL, sql } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"

import { profileUser } from "../auth/session"
import { db } from "../db"
import { isPlay, playCount, watchedSum } from "./sql"

const TOP_USERS = 10
const TOP_NAMES = 8

export async function methodsOf(where: SQL | undefined): Promise<MethodStat[]> {
  const rows = await db
    .select({
      method: playbackSession.method,
      plays: playCount(),
      watchSeconds: watchedSum(),
    })
    .from(playbackSession)
    // Files marked watched by hand didn't play here.
    .where(and(where, eq(playbackSession.marked, false)))
    .groupBy(playbackSession.method)
  return PLAYBACK_METHODS.map(
    (method) =>
      rows.find((row) => row.method === method) ?? {
        method,
        plays: 0,
        watchSeconds: 0,
      },
  )
}

/** Plays per value of a text column, most first, leaving out nulls. */
export async function namedCounts(
  column: AnyPgColumn,
  where: SQL | undefined,
): Promise<NamedCount[]> {
  const plays = count()
  const rows = await db
    .select({ name: sql<string | null>`${column}`, plays })
    .from(playbackSession)
    .where(and(where, isPlay, isNotNull(column)))
    .groupBy(column)
    .orderBy(desc(plays))
    .limit(TOP_NAMES)
  return rows.flatMap((row) =>
    row.name ? [{ name: row.name, plays: row.plays }] : [],
  )
}

export async function transcodingOf(
  where: SQL | undefined,
): Promise<TranscodingStats> {
  const transcode = eq(playbackSession.method, "transcode")
  const [[row], encoders, videoCodecs, audioCodecs] = await Promise.all([
    db
      .select({
        videoTranscodes: playCount(transcode),
        hardwareEncodes: playCount(
          sql`${transcode} and ${playbackSession.hardwareEncoding}`,
        ),
        audioConversions: playCount(sql`${playbackSession.audioConverted}`),
        toneMapped: playCount(isNotNull(playbackSession.toneMapper)),
        encodeSeconds:
          sql<number>`coalesce(sum(${playbackSession.encodeSeconds}), 0)`.mapWith(
            Number,
          ),
      })
      .from(playbackSession)
      .where(where),
    namedCounts(playbackSession.videoEncoder, and(where, transcode)),
    namedCounts(playbackSession.videoCodec, and(where, transcode)),
    namedCounts(
      playbackSession.audioCodec,
      and(where, eq(playbackSession.audioConverted, true)),
    ),
  ])
  return {
    videoTranscodes: row?.videoTranscodes ?? 0,
    hardwareEncodes: row?.hardwareEncodes ?? 0,
    audioConversions: row?.audioConversions ?? 0,
    toneMapped: row?.toneMapped ?? 0,
    encodeSeconds: row?.encodeSeconds ?? 0,
    encoders,
    videoCodecs,
    audioCodecs,
  }
}

export async function usersOf(where: SQL | undefined): Promise<UserStat[]> {
  const seconds = watchedSum()
  const rows = await db
    .select({ row: user, watchSeconds: seconds, plays: playCount() })
    .from(playbackSession)
    .innerJoin(user, eq(user.id, playbackSession.userId))
    .where(where)
    .groupBy(user.id)
    .orderBy(desc(seconds))
    .limit(TOP_USERS)
  return rows
    .filter((entry) => entry.watchSeconds > 0)
    .map((entry) => ({
      user: profileUser(entry.row),
      watchSeconds: entry.watchSeconds,
      plays: entry.plays,
    }))
}
