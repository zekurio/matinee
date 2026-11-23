import type { MediaSegmentKind, PlaybackStart } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  mediaItem,
  type MediaItemRow,
  mediaSegments,
  type MediaSegmentsRow,
  type StoredSegment,
  title,
} from "@matinee/db"
import { and, eq, isNull, sql } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { defineQueue, type Priority } from "../jobs/queue"
import { log } from "../log"
import { episodeOrder } from "./items"
import { keyframesNear } from "./playback"
import { processFailureKind, runProcess } from "./process"
import { sharedAudio } from "./segment-match"

/*
 * The intro, credits, recap, and preview of each episode, for a player's
 * Skip button and for offering the next episode while the credits roll.
 * Chapters named for them come first, as many releases have them. Where
 * they don't, the opening and closing audio of an episode is compared
 * with its season's other episodes, and what they share is the intro or
 * the credits. A season is one job, so its episodes are fingerprinted
 * once each. The end of what they share then moves to the silence or the
 * cut nearest it, where the episode goes on.
 */

/** Raise to look at every episode again, after a change to the search. */
const VERSION = 2
/** Episodes each one is compared with, the nearest in the season first. */
const MAX_PEERS = 3
/** The share of an episode at each end whose audio is compared. */
const REGION_SHARE = 0.25
/** And the most seconds of it. */
const REGION_MAX_SECONDS = 600
const INTRO_SECONDS = { min: 15, max: 120 }
const CREDITS_SECONDS = { min: 15, max: 450 }
/** Credits that end this close to the end of the file run to the end. */
const END_SLACK_SECONDS = 5
/** Audio this quiet for this long is a silence, as in Intro Skipper. */
const SILENCE_DB = -50
const SILENCE_SECONDS = 0.33
/** How far from where the audio stops matching a silence may start. */
const SILENCE_REACH_SECONDS = 2
/** And a cut, without a silence. */
const CUT_REACH_SECONDS = 1
const FINGERPRINT_TIMEOUT_MS = 5 * 60_000
const CHAPTERS_TIMEOUT_MS = 30_000
const SILENCE_TIMEOUT_MS = 30_000
// A failure is tried again after this, by the next scan or task run.
const RETRY_AFTER_MS = 12 * 60 * 60_000

type SeasonJob = { titleId: string; seasonNumber: number; label: string }

type FileVersion = Pick<MediaItemRow, "sizeBytes" | "modifiedAt">

function sameFile(a: FileVersion, b: FileVersion): boolean {
  return (
    a.sizeBytes === b.sizeBytes &&
    a.modifiedAt.getTime() === b.modifiedAt.getTime()
  )
}

function durationOf(item: MediaItemRow): number {
  return item.probe?.format.durationSeconds ?? item.durationSeconds ?? 0
}

/** The track a player starts with, which every episode shares. */
function audioOf(item: MediaItemRow) {
  const audio = item.probe?.audio ?? []
  return audio.find((stream) => stream.default) ?? audio[0] ?? null
}

/*
 * Chapters
 */

const Chapters = t.object({
  chapters: t
    .array(
      t.object({
        start_time: t.coerce.number().optional().catch(undefined),
        end_time: t.coerce.number().optional().catch(undefined),
        tags: t
          .object({ title: t.string().optional().catch(undefined) })
          .optional()
          .catch(undefined),
      }),
    )
    .catch([]),
})

/** Chapter names for each kind, after `chapterName` tidied them. */
const CHAPTER_KINDS: [MediaSegmentKind, RegExp][] = [
  [
    "recap",
    /^(recap|previously( on\b.*)?|last time( on\b.*)?|zusammenfassung|rückblick|was bisher geschah)$/,
  ],
  [
    "intro",
    /^(intro(duction)?|op ?\d*|opening( (credits|theme|titles|song|sequence))?|main titles?|title sequence|vorspann)$/,
  ],
  [
    "credits",
    /^(ed ?\d*|ending( (credits|theme|song))?|end(ing)? credits|credits|closing( credits)?|outro|abspann)$/,
  ],
  ["preview", /^(preview|next episode( preview)?|next time|vorschau)$/],
]

/** Lowercase, without the numbering and punctuation around the name. */
function chapterName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^[\s\d.:)\]\-–—]+/, "")
    .replace(/[\s.:\-–—]+$/, "")
    .replace(/\s+/g, " ")
}

/** The segments the file's chapters name. */
async function chapterSegments(
  item: MediaItemRow,
  signal: AbortSignal,
): Promise<StoredSegment[]> {
  const lines: string[] = []
  await runProcess({
    name: "ffprobe",
    command: env.MATINEE_FFPROBE_PATH,
    args: ["-v", "error", "-print_format", "json", "-show_chapters", item.path],
    timeoutMs: CHAPTERS_TIMEOUT_MS,
    signal,
    onStdoutLine: (line) => lines.push(line),
  })
  let json: unknown
  try {
    json = JSON.parse(lines.join("\n"))
  } catch {
    return []
  }
  const duration = durationOf(item)
  const found: StoredSegment[] = []
  for (const chapter of Chapters.parse(json).chapters) {
    const start = chapter.start_time
    const end = chapter.end_time
    const name = chapter.tags?.title
    if (start === undefined || end === undefined || !name) continue
    const kind = CHAPTER_KINDS.find(([, pattern]) =>
      pattern.test(chapterName(name)),
    )?.[0]
    if (!kind || end - start < 3) continue
    // An intro or recap at the start, credits or a preview at the end.
    const early = kind === "intro" || kind === "recap"
    if (early !== start < duration / 2) continue
    // The first chapter of a kind; a later one is usually a mislabel.
    if (found.some((segment) => segment.kind === kind)) continue
    found.push({
      kind,
      start,
      end: Math.min(end, duration),
      source: "chapters",
    })
  }
  return found
}

/*
 * Audio
 */

type Fingerprints = {
  head: Uint32Array
  tail: Uint32Array
  /** Seconds into the file the tail starts at. */
  tailStart: number
}

/** Chromaprint's raw points for a stretch of the file's audio. */
async function fingerprint(
  item: MediaItemRow,
  audioIndex: number,
  start: number,
  seconds: number,
  signal: AbortSignal,
): Promise<Uint32Array> {
  const chunks: Buffer[] = []
  await runProcess({
    name: "ffmpeg",
    command: env.MATINEE_FFMPEG_PATH,
    args: [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      ...(start > 0 ? ["-ss", String(start)] : []),
      "-t",
      String(seconds),
      "-i",
      item.path,
      "-map",
      `0:${audioIndex}`,
      "-ac",
      "2",
      "-f",
      "chromaprint",
      "-fp_format",
      "raw",
      "-",
    ],
    timeoutMs: FINGERPRINT_TIMEOUT_MS,
    signal,
    priority: 10,
    idleIo: true,
    onStdoutData: (chunk) => chunks.push(chunk),
  })
  const bytes = Buffer.concat(chunks)
  const points = new Uint32Array(Math.floor(bytes.length / 4))
  for (let i = 0; i < points.length; i++) points[i] = bytes.readUInt32LE(i * 4)
  return points
}

async function fingerprints(
  item: MediaItemRow,
  signal: AbortSignal,
): Promise<Fingerprints | null> {
  const audio = audioOf(item)
  const duration = durationOf(item)
  if (!audio || duration <= 0) return null
  const seconds = Math.min(duration * REGION_SHARE, REGION_MAX_SECONDS)
  const tailStart = duration - seconds
  const head = await fingerprint(item, audio.index, 0, seconds, signal)
  const tail = await fingerprint(item, audio.index, tailStart, seconds, signal)
  return { head, tail, tailStart }
}

/** The intro both episodes share, in seconds into `a`. */
function sharedIntro(a: Fingerprints, b: Fingerprints): StoredSegment | null {
  const shared = sharedAudio(a.head, b.head)?.a
  if (!shared) return null
  const length = shared.end - shared.start
  if (length < INTRO_SECONDS.min || length > INTRO_SECONDS.max) return null
  // Within a second of the start is the start.
  const start = shared.start < 1 ? 0 : shared.start
  return { kind: "intro", start, end: shared.end, source: "audio" }
}

/** The credits both episodes share, in seconds into `a`. */
function sharedCredits(
  a: Fingerprints,
  b: Fingerprints,
  duration: number,
): StoredSegment | null {
  const shared = sharedAudio(a.tail, b.tail)?.a
  if (!shared) return null
  const length = shared.end - shared.start
  if (length < CREDITS_SECONDS.min || length > CREDITS_SECONDS.max) return null
  const end = a.tailStart + shared.end
  return {
    kind: "credits",
    start: a.tailStart + shared.start,
    end: duration - end < END_SLACK_SECONDS ? duration : end,
    source: "audio",
  }
}

/*
 * Edges
 */

type Span = { start: number; end: number }

const SILENCE_START = /silence_start: (-?[\d.]+)/
const SILENCE_END = /silence_end: (-?[\d.]+)/

/** The silences in `seconds` of the file's audio from `from`. */
async function silences(
  item: MediaItemRow,
  audioIndex: number,
  from: number,
  seconds: number,
  signal: AbortSignal,
): Promise<Span[]> {
  const found: Span[] = []
  let start: number | null = null
  // The filter counts from the seek.
  const at = (match: RegExpExecArray | null) =>
    match ? from + Math.max(0, Number(match[1])) : null
  await runProcess({
    name: "ffmpeg",
    command: env.MATINEE_FFMPEG_PATH,
    args: [
      "-hide_banner",
      "-nostats",
      "-nostdin",
      ...(from > 0 ? ["-ss", String(from)] : []),
      "-t",
      String(seconds),
      "-i",
      item.path,
      "-map",
      `0:${audioIndex}`,
      "-af",
      `silencedetect=noise=${SILENCE_DB}dB:duration=${SILENCE_SECONDS}`,
      "-f",
      "null",
      "-",
    ],
    timeoutMs: SILENCE_TIMEOUT_MS,
    signal,
    priority: 10,
    idleIo: true,
    onStderrLine: (line) => {
      // The filter prints at the info level.
      start = at(SILENCE_START.exec(line)) ?? start
      const end = at(SILENCE_END.exec(line))
      if (end !== null && start !== null) {
        found.push({ start, end })
        start = null
      }
    },
  })
  // A silence still going when the audio ran out.
  if (start !== null) found.push({ start, end: from + seconds })
  return found
}

function closest<T>(
  list: readonly T[],
  to: number,
  time: (value: T) => number,
): T | undefined {
  let best: T | undefined
  for (const value of list) {
    if (
      best === undefined ||
      Math.abs(time(value) - to) < Math.abs(time(best) - to)
    ) {
      best = value
    }
  }
  return best
}

/**
 * Where the episode goes on after audio that stops matching at `end`: at
 * the silence that starts nearest it, or at a cut in that silence, else
 * at the cut nearest it. A cut is a keyframe, which a seek in a copied
 * stream lands on, so Skip lands there too.
 */
async function edgeAfter(
  item: MediaItemRow,
  audioIndex: number,
  end: number,
  signal: AbortSignal,
): Promise<number> {
  const from = Math.max(0, end - SILENCE_REACH_SECONDS)
  const quiet = await silences(
    item,
    audioIndex,
    from,
    end + SILENCE_REACH_SECONDS - from,
    signal,
  )
  const silence = closest(quiet, end, (span) => span.start)
  signal.throwIfAborted()
  const keyframes = await keyframesNear(item, silence?.start ?? end)
  const cuts = keyframes
    ? [keyframes.before, keyframes.after].filter((cut) => cut !== null)
    : []
  if (silence) {
    return (
      cuts.find(
        (cut) => cut >= silence.start - 0.001 && cut <= silence.end + 0.001,
      ) ?? silence.start
    )
  }
  const cut = closest(cuts, end, (cut) => cut)
  return cut !== undefined && Math.abs(cut - end) <= CUT_REACH_SECONDS
    ? cut
    : end
}

/** The segment the fingerprints found, ending where the episode goes on. */
async function settled(
  item: MediaItemRow,
  segment: StoredSegment,
  signal: AbortSignal,
): Promise<StoredSegment> {
  const audio = audioOf(item)
  // Credits that run to the end of the file stay there.
  if (!audio || durationOf(item) - segment.end < END_SLACK_SECONDS) {
    return segment
  }
  const end = await edgeAfter(item, audio.index, segment.end, signal).catch(
    unreadable(item, segment.end),
  )
  return end > segment.start ? { ...segment, end } : segment
}

/*
 * Seasons
 */

/**
 * For a file ffmpeg can't read: logs it and goes on without it, so one
 * broken episode doesn't hold up its season. Anything else stops the job.
 */
function unreadable<T>(item: MediaItemRow, instead: T) {
  return (cause: unknown): T => {
    if (processFailureKind(cause) !== "exit") throw cause
    log.warn(
      `Couldn't read ${item.relativePath} for its intro and credits`,
      cause,
    )
    return instead
  }
}

/** The season's files, in episode order, with what was found in them. */
async function seasonFiles(job: SeasonJob) {
  // ACCESS: A background job over every library, for any viewer later.
  return db
    .select({ item: mediaItem, found: mediaSegments })
    .from(mediaItem)
    .leftJoin(mediaSegments, eq(mediaSegments.mediaItemId, mediaItem.id))
    .where(
      and(
        eq(mediaItem.titleId, job.titleId),
        eq(mediaItem.seasonNumber, job.seasonNumber),
      ),
    )
    .orderBy(...episodeOrder)
}

/** Whether the row holds what a look at the file now would find. */
function current(
  found: MediaSegmentsRow | null,
  item: MediaItemRow,
  peers: number,
): boolean {
  return (
    found !== null &&
    found.version === VERSION &&
    sameFile(found, item) &&
    found.peers >= peers
  )
}

/**
 * The intro and credits the episode shares with its peers: the longest
 * each of them shares, since one may have its credits cut short.
 */
async function sharedWithPeers(
  item: MediaItemRow,
  peers: MediaItemRow[],
  printsOf: (item: MediaItemRow) => Promise<Fingerprints | null>,
): Promise<StoredSegment[]> {
  const own = await printsOf(item)
  if (!own) return []
  const length = (segment: StoredSegment | null) =>
    segment ? segment.end - segment.start : 0
  let intro: StoredSegment | null = null
  let credits: StoredSegment | null = null
  for (const peer of peers) {
    const theirs = await printsOf(peer)
    if (!theirs) continue
    const nextIntro = sharedIntro(own, theirs)
    if (length(nextIntro) > length(intro)) intro = nextIntro
    const nextCredits = sharedCredits(own, theirs, durationOf(item))
    if (length(nextCredits) > length(credits)) credits = nextCredits
  }
  return [intro, credits].filter((segment) => segment !== null)
}

/** Look at the season's episodes that changed, or that have more to compare with now. */
async function findSeason(job: SeasonJob, signal: AbortSignal): Promise<void> {
  const rows = await seasonFiles(job)
  // Unprobed files wait for their probe, which queues the season again.
  const files = rows.filter(
    (row) => row.item.probe !== null && durationOf(row.item) > 0,
  )
  const audible = files.filter((row) => audioOf(row.item) !== null)
  const peersFor = (item: MediaItemRow) =>
    audioOf(item) ? Math.min(MAX_PEERS, audible.length - 1) : 0
  const due = files.filter(
    (row) => !current(row.found, row.item, peersFor(row.item)),
  )
  if (due.length === 0) return

  const prints = new Map<string, Promise<Fingerprints | null>>()
  const printsOf = (item: MediaItemRow) => {
    let pending = prints.get(item.id)
    if (!pending) {
      pending = fingerprints(item, signal).catch(unreadable(item, null))
      prints.set(item.id, pending)
    }
    return pending
  }

  for (const { item } of due) {
    signal.throwIfAborted()
    const segments = await chapterSegments(item, signal).catch(
      unreadable<StoredSegment[]>(item, []),
    )
    const has = (kind: MediaSegmentKind) =>
      segments.some((segment) => segment.kind === kind)
    const index = audible.findIndex((row) => row.item.id === item.id)
    // The nearest episodes first, those before on a tie.
    const peers = audible
      .map((row, at) => ({ row, distance: Math.abs(at - index) }))
      .filter(({ distance }) => index >= 0 && distance > 0)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_PEERS)
      .map(({ row }) => row.item)
    if (peers.length > 0 && (!has("intro") || !has("credits"))) {
      const shared = await sharedWithPeers(item, peers, printsOf)
      for (const segment of shared) {
        if (has(segment.kind)) continue
        segments.push(await settled(item, segment, signal))
      }
    }
    segments.sort((a, b) => a.start - b.start)

    // A scan that saw the file change meanwhile queued the season again.
    // ACCESS: The file is one of the season's above.
    const [now] = await db
      .select({
        sizeBytes: mediaItem.sizeBytes,
        modifiedAt: mediaItem.modifiedAt,
      })
      .from(mediaItem)
      .where(eq(mediaItem.id, item.id))
    if (!now || !sameFile(now, item)) continue
    const values = {
      mediaItemId: item.id,
      sizeBytes: item.sizeBytes,
      modifiedAt: item.modifiedAt,
      version: VERSION,
      segments,
      peers: peers.length,
      analyzedAt: new Date(),
    }
    await db
      .insert(mediaSegments)
      .values(values)
      .onConflictDoUpdate({ target: mediaSegments.mediaItemId, set: values })
  }
}

function jobKey(job: SeasonJob): string {
  return `${job.titleId}:${job.seasonNumber}`
}

/**
 * A season at a time: chapters for each episode, and chromaprint over
 * a few minutes at each end of the ones without them, which takes a few
 * seconds an episode.
 */
export const segmentSearches = defineQueue<SeasonJob, void>({
  id: "media-segments",
  name: "Intros and credits",
  description:
    "Find the intro and credits of each episode, for Skip intro and for offering the next episode while the credits roll.",
  concurrency: 1,
  key: jobKey,
  label: (job) => job.label,
  group: (job) => job.titleId,
  retryAfterMs: RETRY_AFTER_MS,
  failure: (job) => `Couldn't find the intros and credits of ${job.label}`,
  // Without ffmpeg or ffprobe no file can be read.
  fatal: (cause) =>
    processFailureKind(cause) === "start"
      ? {
          message: `Skipping intros and credits: ${cause instanceof Error ? cause.message : String(cause)}`,
          drop: () => true,
        }
      : null,
  summary: ({ completed, failed, ms }) =>
    completed + failed > 1
      ? `Intros and credits: ${completed} season${completed === 1 ? "" : "s"} done in ${Math.round(ms / 1000)} s${failed > 0 ? `, ${failed} failed` : ""}`
      : null,
  run: (job, { signal }) => findSeason(job, signal),
})

/** Seasons with an episode that wasn't looked at as it is now. */
async function dueSeasons(libraryId?: string): Promise<SeasonJob[]> {
  // ACCESS: A background job over every library, for any viewer later.
  const rows = await db
    .selectDistinct({
      titleId: title.id,
      name: title.name,
      seasonNumber: mediaItem.seasonNumber,
    })
    .from(mediaItem)
    .innerJoin(title, eq(title.id, mediaItem.titleId))
    .leftJoin(
      mediaSegments,
      and(
        eq(mediaSegments.mediaItemId, mediaItem.id),
        eq(mediaSegments.sizeBytes, mediaItem.sizeBytes),
        eq(mediaSegments.modifiedAt, mediaItem.modifiedAt),
        eq(mediaSegments.version, VERSION),
      ),
    )
    .where(
      and(
        eq(title.kind, "show"),
        isNull(mediaSegments.mediaItemId),
        sql`${mediaItem.seasonNumber} is not null`,
        sql`${mediaItem.probe} is not null`,
        sql`coalesce((${mediaItem.probe} -> 'format' ->> 'durationSeconds')::float8, ${mediaItem.durationSeconds}) > 0`,
        libraryId ? eq(mediaItem.libraryId, libraryId) : undefined,
      ),
    )
  return rows.flatMap((row) =>
    row.seasonNumber === null
      ? []
      : [
          {
            titleId: row.titleId,
            seasonNumber: row.seasonNumber,
            label: `${row.name}, season ${row.seasonNumber}`,
          },
        ],
  )
}

/**
 * Queue every season with an episode not looked at yet, in a library or
 * all of them. Resolves once those jobs end.
 */
export async function findMissingSegments(
  options: {
    libraryId?: string
    priority?: Priority
    signal?: AbortSignal
    progress?: (fraction: number) => void
  } = {},
): Promise<void> {
  const seasons = await dueSeasons(options.libraryId)
  let done = 0
  const jobs = seasons.map((job) =>
    segmentSearches
      .run(job, { priority: options.priority ?? "low" })
      .catch(() => {
        // Logged by the queue.
      })
      .finally(() => options.progress?.(++done / seasons.length)),
  )
  options.signal?.addEventListener("abort", () => {
    for (const job of seasons) segmentSearches.cancel(jobKey(job))
  })
  await Promise.all(jobs)
}

/** Queue the seasons a library's new files are in and leave them to the queue. */
export function queueSegments(libraryId: string): void {
  findMissingSegments({ libraryId, priority: "normal" }).catch(
    (cause: unknown) =>
      log.error(
        `Couldn't queue intros and credits for library ${libraryId}`,
        cause,
      ),
  )
}

/** What a player offers for an episode. */
export type Offer = Pick<PlaybackStart, "segments" | "upNextAt">

/**
 * What a player offers for an episode: the parts to skip, and where to
 * start offering the next episode. An episode not looked at yet goes to
 * the front of the queue, for the next time it plays or is downloaded.
 */
export async function playerSegments(
  item: MediaItemRow,
  show: { id: string; name: string } | null,
  hasNext: boolean,
): Promise<Offer> {
  const duration = durationOf(item)
  let found: StoredSegment[] = []
  if (show && item.seasonNumber !== null) {
    const [row] = await db
      .select()
      .from(mediaSegments)
      .where(eq(mediaSegments.mediaItemId, item.id))
    if (row && sameFile(row, item)) found = row.segments
    if (!row || row.version !== VERSION || !sameFile(row, item)) {
      const job = {
        titleId: show.id,
        seasonNumber: item.seasonNumber,
        label: `${show.name}, season ${item.seasonNumber}`,
      }
      if (!segmentSearches.hasFailed(jobKey(job))) {
        segmentSearches.push(job, { priority: "high" })
      }
    }
  }
  return offer(found, duration, hasNext)
}

/**
 * Jellyfin's rule without credits to go by: the next episode shows this
 * long before the end, longer for longer episodes, and not for short
 * files.
 */
function upNextLead(duration: number): number | null {
  if (duration < 10 * 60) return null
  if (duration >= 50 * 60) return 40
  if (duration >= 40 * 60) return 35
  return 30
}

/** What a player offers, from what was found in the file. */
export function offer(
  found: readonly StoredSegment[],
  duration: number,
  hasNext: boolean,
): Offer {
  const valid = found.filter(
    (segment) => segment.end > segment.start && segment.start < duration,
  )
  // The credits at the end of the file, if any: the last ones, in its
  // last part.
  const credits = valid.findLast(
    (segment) => segment.kind === "credits" && segment.start >= duration * 0.5,
  )
  const lead = upNextLead(duration)
  const upNextAt = !hasNext
    ? null
    : credits
      ? credits.start
      : lead === null
        ? null
        : duration - lead
  const segments = valid
    // Skipping credits that run to the end skips to the end, which the
    // next episode, or nothing, does better.
    .filter(
      (segment) =>
        segment.kind !== "credits" ||
        duration - segment.end >= END_SLACK_SECONDS,
    )
    .map(({ kind, start, end }) => ({ kind, start, end }))
  return { segments, upNextAt }
}
