import type { PlaybackMethod, PlaybackQuality } from "@matinee/contracts"
import { type MediaItemRow, playbackSession, title } from "@matinee/db"
import { and, eq, isNull, ne, type SQL, sql } from "drizzle-orm"

import { db } from "../db"
import { events } from "../realtime/events"

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
  userAgent: string | undefined
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

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
]

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
]

/**
 * `Firefox on Linux` from a User-Agent header. Apps that aren't browsers get
 * their first word, like `MatineeTV`.
 */
export function clientName(agent: string | undefined): string | null {
  if (!agent) return null
  const browser = BROWSERS.find(([pattern]) => pattern.test(agent))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1]
  if (browser && system) return `${browser} on ${system}`
  const name = browser ?? system ?? agent.split(/[\s/]/)[0]?.slice(0, 40)
  return name || null
}

/** The columns a new session starts with. */
async function startValues(owner: SessionOwner) {
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
    client: clientName(owner.userAgent),
  }
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
 * End the sessions a browser left open on a file when it starts another
 * there, as a reload does. The page that went away may never have sent
 * its closing report, and would show as watching until it timed out. A
 * second tab that's still open reopens its session with its next report.
 */
async function endLeftBehind(owner: SessionOwner): Promise<void> {
  const client = clientName(owner.userAgent)
  await db
    .update(playbackSession)
    .set({ endedAt: new Date() })
    .where(
      and(
        sameOwner(owner),
        ne(playbackSession.id, owner.id),
        isNull(playbackSession.endedAt),
        client === null
          ? isNull(playbackSession.client)
          : eq(playbackSession.client, client),
      ),
    )
}

/** Record a progress report in its session. */
export async function recordReport(
  owner: SessionOwner,
  report: SessionReport,
): Promise<void> {
  const now = new Date()
  const endedAt = report.closed ? now : null
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
        updatedAt: now,
      },
      setWhere: sameOwner(owner),
    })
    .returning({ inserted })
  if (row?.inserted) await endLeftBehind(owner)
  events.publish("playback", undefined)
}

/** Rank of a method, so a session keeps the most the server did. */
function methodRank(method: SQL): SQL {
  return sql`case ${method} when 'transcode' then 2 when 'remux' then 1 else 0 end`
}

/** Record that the server started a stream for the session. */
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
        endedAt: null,
        updatedAt: new Date(),
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
