import type {
  GenreStat,
  LiveActivity,
  ServerStats,
  SessionStream,
  StatsInput,
  TitleStat,
  WatchedEntry,
  WatchStats,
} from "@matinee/contracts"
import { mediaItem, playbackSession, title, user } from "@matinee/db"
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { visibleItems, visibleTitles, type Seer } from "../access/visible"
import { profileUser } from "../auth/session"
import { db } from "../db"
import { placeholders } from "../media/artwork"
import { encodingSessions } from "../media/hls"
import {
  publicItems,
  titleArtwork,
  toSummary,
  viewerStates,
} from "../media/items"
import { activityOf, bucketsOf, dated, knownZone, scopeOf } from "./range"
import { methodsOf, namedCounts, transcodingOf, usersOf } from "./server"
import { runningStreams } from "./sessions"
import { isPlay, playCount, watchedSum } from "./sql"

const TOP_TITLES = 10
const TOP_GENRES = 8
// A session that reported this recently is playing. Players report every
// ten seconds while playing and every thirty while paused, but a hidden
// tab's timers can slow to once a minute, so paused ones get longer. A
// player that closed without saying so drops out after these.
const LIVE_SECONDS = 45
const PAUSED_LIVE_SECONDS = 120
const RECENT_TITLES = 12

/** Every title played in the scope, most watched first. */
async function titlesOf(viewer: Seer, where: SQL | undefined) {
  const rows = await db
    .select({ row: title, watchSeconds: watchedSum(), plays: playCount() })
    .from(playbackSession)
    .innerJoin(title, eq(title.id, playbackSession.titleId))
    .where(and(visibleTitles(viewer), where))
    .groupBy(title.id)
  // A stray click isn't watching the title.
  return rows
    .filter((entry) => entry.plays > 0)
    .sort((a, b) => b.watchSeconds - a.watchSeconds)
}

function genresOf(
  titles: { row: { genres: string[] }; watchSeconds: number }[],
): GenreStat[] {
  const seconds = new Map<string, number>()
  for (const entry of titles) {
    for (const genre of entry.row.genres) {
      seconds.set(genre, (seconds.get(genre) ?? 0) + entry.watchSeconds)
    }
  }
  return [...seconds]
    .map(([name, watchSeconds]) => ({ name, watchSeconds }))
    .filter((genre) => genre.watchSeconds > 0)
    .sort((a, b) => b.watchSeconds - a.watchSeconds)
    .slice(0, TOP_GENRES)
}

async function totalsOf(where: SQL | undefined) {
  const kind = playbackSession.titleKind
  const [row] = await db
    .select({
      watchSeconds: watchedSum(),
      plays: playCount(),
      movies:
        sql<number>`count(distinct ${playbackSession.titleId}) filter (where ${playbackSession.completed} and ${kind} = 'movie')`.mapWith(
          Number,
        ),
      episodes:
        sql<number>`count(distinct ${playbackSession.mediaItemId}) filter (where ${playbackSession.completed} and ${kind} = 'show')`.mapWith(
          Number,
        ),
      shows:
        sql<number>`count(distinct ${playbackSession.titleId}) filter (where ${isPlay} and ${kind} = 'show')`.mapWith(
          Number,
        ),
      viewers:
        sql<number>`count(distinct ${playbackSession.userId}) filter (where ${playbackSession.watchedSeconds} > 0)`.mapWith(
          Number,
        ),
    })
    .from(playbackSession)
    .where(where)
  return (
    row ?? {
      watchSeconds: 0,
      plays: 0,
      movies: 0,
      episodes: 0,
      shows: 0,
      viewers: 0,
    }
  )
}

/**
 * What one user, or everyone without `userId`, watched in the range. Titles
 * carry the viewer's own state.
 */
async function collectWatchStats(
  input: StatsInput,
  userId: string | undefined,
  viewer: Viewer,
) {
  const zone = await knownZone(input.timeZone)
  const where = scopeOf(input.range, zone, userId)
  const [{ unit, buckets }, activity, titles, totals] = await Promise.all([
    bucketsOf(input.range, zone, where),
    activityOf(zone, where),
    titlesOf(viewer, where),
    totalsOf(where),
  ])
  const { viewers, ...watchTotals } = totals
  const top = titles.slice(0, TOP_TITLES)
  const [art, states] = await Promise.all([
    placeholders(top.flatMap((entry) => titleArtwork(entry.row))),
    viewerStates(
      top.map((entry) => entry.row.id),
      viewer.id,
    ),
  ])
  const stats: WatchStats = {
    range: input.range,
    unit,
    totals: watchTotals,
    buckets,
    activity,
    genres: genresOf(titles),
    titles: top.map((entry): TitleStat => ({
      title: toSummary(entry.row, art, states),
      watchSeconds: entry.watchSeconds,
      plays: entry.plays,
    })),
  }
  return { stats, viewers, where }
}

export async function watchStats(
  input: StatsInput,
  userId: string,
  viewer: Viewer,
): Promise<WatchStats> {
  const { stats } = await collectWatchStats(input, userId, viewer)
  return stats
}

/** Everyone's watching in the range, and how it played. */
export async function serverStats(
  input: StatsInput,
  viewer: Viewer,
): Promise<ServerStats> {
  const { stats, viewers, where } = await collectWatchStats(
    input,
    undefined,
    viewer,
  )
  const [methods, transcoding, users, clients] = await Promise.all([
    methodsOf(where),
    transcodingOf(where),
    usersOf(where),
    namedCounts(playbackSession.client, where),
  ])
  return {
    ...stats,
    viewers,
    methods,
    transcoding,
    users,
    clients,
  }
}

/** Sessions playing now, or paused a little while ago. */
export async function liveActivity(viewer: Viewer): Promise<LiveActivity> {
  const rows = await db
    .select({ session: playbackSession, owner: user })
    .from(playbackSession)
    .innerJoin(user, eq(user.id, playbackSession.userId))
    .where(
      and(
        isNull(playbackSession.endedAt),
        or(
          gt(
            playbackSession.updatedAt,
            sql`now() - make_interval(secs => ${LIVE_SECONDS})`,
          ),
          and(
            eq(playbackSession.paused, true),
            gt(
              playbackSession.updatedAt,
              sql`now() - make_interval(secs => ${PAUSED_LIVE_SECONDS})`,
            ),
          ),
        ),
      ),
    )
    .orderBy(desc(playbackSession.startedAt))
  const ids = rows.flatMap((row) =>
    row.session.mediaItemId ? [row.session.mediaItemId] : [],
  )
  const files =
    ids.length > 0
      ? await db
          .select()
          .from(mediaItem)
          .where(and(visibleItems(viewer), inArray(mediaItem.id, ids)))
      : []
  const items = new Map(
    (await publicItems(files, viewer.id)).map((item) => [item.id, item]),
  )
  const running = runningStreams()
  const answeredAt = Date.now()
  const encoding = encodingSessions()
  return {
    sessions: rows.map(({ session, owner }) => ({
      user: profileUser(owner),
      item: session.mediaItemId
        ? (items.get(session.mediaItemId) ?? null)
        : null,
      method: session.method,
      videoCodec: session.videoCodec,
      audioCodec: session.audioCodec,
      audioConverted: session.audioConverted,
      audioEncoder: session.audioConverted ? session.audioEncoder : null,
      videoEncoder: session.videoEncoder,
      hardwareEncoding: session.hardwareEncoding,
      hardwareDecoding: session.hardwareDecoding,
      toneMapper: session.toneMapper,
      quality: session.method === "direct" ? null : session.quality,
      positionSeconds: session.positionSeconds,
      reportAgeSeconds: Math.max(
        0,
        (answeredAt - session.updatedAt.getTime()) / 1000,
      ),
      paused: session.paused,
      client: session.client,
      startedAt: session.startedAt,
      streaming: running.sessions.has(session.id) || encoding.has(session.id),
    })),
    streams: running.total,
  }
}

/** What the server does for `userId`'s session `sessionId`. */
export async function sessionStream(
  userId: string,
  sessionId: string,
): Promise<SessionStream | null> {
  const [session] = await db
    .select()
    .from(playbackSession)
    .where(
      and(
        eq(playbackSession.id, sessionId),
        eq(playbackSession.userId, userId),
      ),
    )
  if (!session) return null
  return {
    method: session.method,
    videoEncoder: session.videoEncoder,
    hardwareEncoding: session.hardwareEncoding,
    hardwareDecoding: session.hardwareDecoding,
    toneMapper: session.toneMapper,
    audioEncoder: session.audioConverted ? session.audioEncoder : null,
    streaming:
      runningStreams().sessions.has(session.id) ||
      encodingSessions().has(session.id),
  }
}

/**
 * The latest file of each title a user played, newest first, `limit`
 * titles at most: a dozen for a profile, more for the whole list.
 */
export async function recentlyWatched(
  userId: string,
  viewer: Viewer,
  limit = RECENT_TITLES,
): Promise<WatchedEntry[]> {
  // Enough sessions to find the titles through a binge of one show.
  const rows = await db
    .select({ session: playbackSession, item: mediaItem })
    .from(playbackSession)
    .innerJoin(mediaItem, eq(mediaItem.id, playbackSession.mediaItemId))
    // A play without a day has no place in what was watched last.
    .where(
      and(
        visibleItems(viewer),
        eq(playbackSession.userId, userId),
        isPlay,
        dated,
      ),
    )
    .orderBy(desc(playbackSession.updatedAt))
    .limit(Math.max(200, limit * 20))
  const seen = new Set<string>()
  const picks = rows.filter((row) => {
    const key = row.item.titleId ?? row.item.id
    if (seen.has(key) || seen.size >= limit) return false
    seen.add(key)
    return true
  })
  const items = await publicItems(
    picks.map((row) => row.item),
    viewer.id,
  )
  return items.flatMap((item, index) => {
    const pick = picks[index]
    return pick
      ? [
          {
            item,
            watchedAt: pick.session.updatedAt,
            completed: pick.session.completed,
          },
        ]
      : []
  })
}
