import type {
  PlaybackBusyData,
  PlaybackMethod,
  PlaybackQuality,
} from "@matinee/contracts"
import { type MediaItemRow, playbackSession, title } from "@matinee/db"
import { and, eq, isNull, ne, type SQL, sql } from "drizzle-orm"

import { db } from "../db"
import { events } from "../realtime/events"
import { queueRecommendations } from "../recommendations/enqueue"
import { mayGoLive, otherLiveSessions } from "./live"
import { presenceOpen } from "./presence"

/*
 * Playback sessions, for statistics. The player names a session with a
 * UUID it makes and sends it with progress reports and stream requests;
 * whichever arrives first creates the row. Ids are only trusted for the
 * user and file that created them.
 */

// A report adds at most the time since the session began, plus this. The
// first report comes after about ten seconds of play.
const PLAYED_SLACK_S = 30

/** Who is playing what, from the request. */
export type SessionOwner = {
  id: string
  userId: string
  item: MediaItemRow
  /** What the signed-in client called itself; see `SessionUser`. */
  client: string | null
  /** The sign-in the request came with: its session, or its API token. */
  authSessionId: string
}

export type SessionReport = {
  positionSeconds: number
  /** Seconds spent playing since the session began, by the player's count. */
  playedSeconds: number
  completed: boolean
  paused: boolean
  /** The player closed. */
  closed: boolean
}

/** What a stream did, from `openPlayback`. */
export type StreamPlan = {
  method: Exclude<PlaybackMethod, "direct">
  audioConverted: boolean
  videoCodec: string | null
  audioCodec: string
  videoEncoder: string | null
  hardwareEncoding: boolean
  hardwareDecoding: boolean
  toneMapper: string | null
  audioEncoder: string | null
  quality: PlaybackQuality
}

/** The columns a new session starts with. */
async function startValues(owner: SessionOwner) {
  // ACCESS: The title is keyed by the visible item passed by the playback route.
  const [owning] = owner.item.titleId
    ? await db
        .select({ kind: title.kind })
        .from(title)
        .where(eq(title.id, owner.item.titleId))
    : []
  const probe = owner.item.probe
  const audio = probe?.audio.find((stream) => stream.default) ?? probe?.audio[0]
  return {
    id: owner.id,
    userId: owner.userId,
    mediaItemId: owner.item.id,
    titleId: owning ? owner.item.titleId : null,
    titleKind: owning?.kind ?? null,
    videoCodec: probe?.video?.codec ?? null,
    audioCodec: audio?.codec ?? null,
    client: owner.client,
    authSessionId: owner.authSessionId,
  }
}

/**
 * On a row that's already there: its client's name and sign-in, kept, or
 * filled in when it had none. The first request of a play can arrive
 * before the client has named itself.
 */
const ownerColumns = {
  client: sql`coalesce(${playbackSession.client}, excluded.client)`,
  authSessionId: sql`coalesce(${playbackSession.authSessionId}, excluded.auth_session_id)`,
}

/** Updates only touch a session of the same user and file. */
function sameOwner(owner: SessionOwner): SQL | undefined {
  return and(
    eq(playbackSession.userId, owner.userId),
    eq(playbackSession.mediaItemId, owner.item.id),
  )
}

// In `returning`, true when the upsert inserted the row rather than
// updating it: Postgres leaves a new row's xmax at 0.
const inserted = sql<boolean>`xmax = 0`

/**
 * `leftAt` after a report or a stream, a sign the player is there. With
 * one of its presence connections open, it's cleared. Without one, a
 * session whose connection dropped gets `LEFT_GRACE_SECONDS` from now
 * rather than being taken for there for good: its player may be gone a
 * moment later, and nothing else would mark it again. A player that never
 * opened a connection keeps null, and goes by its reports.
 */
function leftAtOnSign(owner: SessionOwner): SQL | null {
  if (presenceOpen(owner.userId, owner.id)) return null
  return sql`case when ${playbackSession.leftAt} is null then null else now() end`
}

/**
 * Why a guarded write to the session changed nothing: the account plays
 * on as many devices as it may. Null when the row is another user's or
 * file's, which a write never touches, or a place came free meanwhile.
 */
async function refusal(
  owner: SessionOwner,
  limit: number,
): Promise<PlaybackBusyData | null> {
  const [mine] = await db
    .select({ id: playbackSession.id })
    .from(playbackSession)
    .where(and(eq(playbackSession.id, owner.id), sameOwner(owner)))
  if (!mine) return null
  const playing = await otherLiveSessions(owner.userId, owner.id)
  return playing >= limit ? { playing } : null
}

/**
 * End the sessions a client left open on a file when it starts another
 * there, as a reload does. The page that went away may never have sent
 * its closing report, and would show as watching until it timed out. A
 * second tab that's still open reopens its session with its next report.
 * It goes by the sign-in, not the client's name, which two devices share.
 */
async function endLeftBehind(owner: SessionOwner): Promise<void> {
  await db
    .update(playbackSession)
    .set({ endedAt: new Date() })
    .where(
      and(
        sameOwner(owner),
        ne(playbackSession.id, owner.id),
        isNull(playbackSession.endedAt),
        eq(playbackSession.authSessionId, owner.authSessionId),
      ),
    )
}

/**
 * Record a progress report in its session. A session that doesn't play
 * now, as after a closing report or once its player left, comes back
 * with a report only while the account is under its stream `limit`;
 * otherwise nothing changes and this returns why. A session that plays
 * now is never refused, and pays nothing for the check. Neither is a
 * closing report, which only ends it. A session's first report creates
 * it unchecked: `playback.start` let it in.
 */
export async function recordReport(
  owner: SessionOwner,
  report: SessionReport,
  limit: number | null,
): Promise<PlaybackBusyData | null> {
  const now = new Date()
  const endedAt = report.closed ? now : null
  const guard = report.closed
    ? undefined
    : mayGoLive(owner.userId, owner.id, limit)
  const [row] = await db
    .insert(playbackSession)
    .values({
      ...(await startValues(owner)),
      positionSeconds: report.positionSeconds,
      watchedSeconds: Math.min(report.playedSeconds, PLAYED_SLACK_S),
      completed: report.completed,
      paused: report.paused,
      endedAt,
    })
    .onConflictDoUpdate({
      target: playbackSession.id,
      set: {
        positionSeconds: report.positionSeconds,
        // The player's count, but no more than the time that has passed.
        // A report that arrives late never takes time away.
        watchedSeconds: sql`greatest(${playbackSession.watchedSeconds}, least(${report.playedSeconds}::double precision, extract(epoch from now() - ${playbackSession.startedAt})::double precision + ${PLAYED_SLACK_S}))`,
        completed: sql`${playbackSession.completed} or ${report.completed}`,
        paused: report.paused,
        endedAt,
        leftAt: leftAtOnSign(owner),
        updatedAt: now,
        ...ownerColumns,
      },
      setWhere: and(sameOwner(owner), guard),
    })
    .returning({ inserted })
  if (!row) return guard && limit !== null ? refusal(owner, limit) : null
  if (row.inserted) await endLeftBehind(owner)
  if (report.closed || report.completed) queueRecommendations(owner.userId)
  events.publish("playback", undefined)
  return null
}

/** A play a player had offline, as `playback.offline` takes it. */
export type OfflineReport = {
  startedAt: Date
  endedAt: Date
  positionSeconds: number
  playedSeconds: number
  completed: boolean
}

/**
 * Record a play the player had while the server was out of reach, at the
 * time it happened. It counts no more than the time between its start
 * and end; one that goes on a session already here, which lost its
 * connection, extends that session, and one sent again changes nothing.
 */
export async function recordOfflinePlay(
  owner: SessionOwner,
  report: OfflineReport,
): Promise<void> {
  const span = (report.endedAt.getTime() - report.startedAt.getTime()) / 1000
  const watched = Math.min(report.playedSeconds, span + PLAYED_SLACK_S)
  await db
    .insert(playbackSession)
    .values({
      ...(await startValues(owner)),
      startedAt: report.startedAt,
      updatedAt: report.endedAt,
      endedAt: report.endedAt,
      positionSeconds: report.positionSeconds,
      watchedSeconds: watched,
      completed: report.completed,
      paused: false,
    })
    .onConflictDoUpdate({
      target: playbackSession.id,
      set: {
        positionSeconds: report.positionSeconds,
        // From the session's own start, which came with its first report.
        watchedSeconds: sql`greatest(${playbackSession.watchedSeconds}, least(${report.playedSeconds}::double precision, extract(epoch from ${report.endedAt}::timestamptz - ${playbackSession.startedAt})::double precision + ${PLAYED_SLACK_S}))`,
        completed: sql`${playbackSession.completed} or ${report.completed}`,
        paused: false,
        endedAt: sql`greatest(${playbackSession.endedAt}, ${report.endedAt}::timestamptz)`,
        updatedAt: sql`greatest(${playbackSession.updatedAt}, ${report.endedAt}::timestamptz)`,
      },
      setWhere: sameOwner(owner),
    })
  queueRecommendations(owner.userId)
}

/** Rank of a method, so a session keeps the most the server did. */
function methodRank(method: SQL): SQL {
  return sql`case ${method} when 'transcode' then 2 when 'remux' then 1 else 0 end`
}

/**
 * A stream is about to start for the session: count it as playing, as a
 * report would, before the server does the work. Refused, with why, like
 * `recordReport`, when the session doesn't play now and the account is
 * at its stream `limit`. A session that plays now always gets its stream.
 * A new session is created unchecked: `playback.start` let it in.
 */
export async function admitStream(
  owner: SessionOwner,
  limit: number | null,
): Promise<PlaybackBusyData | null> {
  const guard = mayGoLive(owner.userId, owner.id, limit)
  const [row] = await db
    .insert(playbackSession)
    .values(await startValues(owner))
    .onConflictDoUpdate({
      target: playbackSession.id,
      set: {
        endedAt: null,
        leftAt: leftAtOnSign(owner),
        updatedAt: new Date(),
        ...ownerColumns,
      },
      setWhere: and(sameOwner(owner), guard),
    })
    .returning({ inserted })
  if (!row) return guard && limit !== null ? refusal(owner, limit) : null
  if (row.inserted) await endLeftBehind(owner)
  events.publish("playback", undefined)
  return null
}

/**
 * Record what the server does for a stream `admitStream` let through.
 * The session's liveness is `admitStream`'s; this only fills in the plan,
 * and creates the row should that have failed.
 */
export async function recordStream(
  owner: SessionOwner,
  plan: StreamPlan,
): Promise<void> {
  const current = sql`${playbackSession.method}`
  const incoming = sql`excluded.method`
  const [row] = await db
    .insert(playbackSession)
    .values({ ...(await startValues(owner)), ...plan })
    .onConflictDoUpdate({
      target: playbackSession.id,
      set: {
        method: sql`case when ${methodRank(incoming)} > ${methodRank(current)} then ${incoming} else ${current} end`,
        audioConverted: sql`${playbackSession.audioConverted} or excluded.audio_converted`,
        audioCodec: sql`excluded.audio_codec`,
        videoEncoder: sql`coalesce(excluded.video_encoder, ${playbackSession.videoEncoder})`,
        hardwareEncoding: sql`${playbackSession.hardwareEncoding} or excluded.hardware_encoding`,
        hardwareDecoding: sql`${playbackSession.hardwareDecoding} or excluded.hardware_decoding`,
        toneMapper: sql`coalesce(excluded.tone_mapper, ${playbackSession.toneMapper})`,
        audioEncoder: sql`coalesce(excluded.audio_encoder, ${playbackSession.audioEncoder})`,
        quality: sql`excluded.quality`,
        ...ownerColumns,
      },
      setWhere: sameOwner(owner),
    })
    .returning({ inserted })
  if (row?.inserted) await endLeftBehind(owner)
  events.publish("playback", undefined)
}

/** Add the time ffmpeg spent encoding a stream of the session. */
export async function addEncodeSeconds(
  owner: SessionOwner,
  seconds: number,
): Promise<void> {
  await db
    .update(playbackSession)
    .set({
      encodeSeconds: sql`${playbackSession.encodeSeconds} + ${seconds}`,
    })
    .where(and(eq(playbackSession.id, owner.id), sameOwner(owner)))
}

// ffmpeg processes playing now, by session. Streams without a session
// count only in the total.
const running = new Map<string, number>()
let runningTotal = 0

/** Count a stream as running until the returned function is called. */
export function trackStream(sessionId: string | null): () => void {
  runningTotal++
  if (sessionId) running.set(sessionId, (running.get(sessionId) ?? 0) + 1)
  events.publish("playback", undefined)
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    runningTotal--
    if (sessionId) {
      const left = (running.get(sessionId) ?? 1) - 1
      if (left > 0) running.set(sessionId, left)
      else running.delete(sessionId)
    }
    events.publish("playback", undefined)
  }
}

/** The streams running now: how many, and for which sessions. */
export function runningStreams() {
  return { total: runningTotal, sessions: new Set(running.keys()) }
}
