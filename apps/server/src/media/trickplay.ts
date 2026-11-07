import { randomBytes } from "node:crypto"
import { mkdir, readdir, rename, rm } from "node:fs/promises"
import { join } from "node:path"

import type {
  Trickplay,
  TrickplaySettings,
  TrickplayStatus,
  VideoStream,
} from "@matinee/contracts"
import {
  mediaItem,
  type MediaItemRow,
  trickplay,
  type TrickplayRow,
} from "@matinee/db"
import { and, count, desc, eq, isNull, sql } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { defineQueue, type Priority } from "../jobs/queue"
import { log } from "../log"
import { events } from "../realtime/events"
import { currentTranscoding } from "../transcode/capabilities"
import { frameDecoderArgs } from "../transcode/pipeline"
import { thumbnailFilters } from "../transcode/trickplay"
import { probeItem } from "./probe"
import { processFailureKind, run, runProcess } from "./process"
import { trickplaySettings } from "./trickplay-settings"

/*
 * Trickplay images, made the way Jellyfin makes them: ffmpeg writes a
 * thumbnail per interval, then a second ffmpeg lays them out in tiles of
 * 10 by 10, so a player loads a few JPEGs for the whole seek bar. A set of
 * tiles sits in `trickplay/<item>/<key>` in the data dir. Every set gets a
 * new random key, so a tile URL never changes its image.
 */

/** Jellyfin's tile layout. */
const COLUMNS = 10
const ROWS = 10
// ffmpeg's JPEG quality, 2 to 31, lower is better. Each thumbnail is
// encoded twice, so the first encode keeps more. 4 is Jellyfin's.
const FRAME_QUALITY = 2
const TILE_QUALITY = 4
const TILE_TIMEOUT_MS = 5 * 60_000
// A failure is tried again after this, by the next scan or task run.
const RETRY_AFTER_MS = 12 * 60 * 60_000

const root = join(env.dataDir, "trickplay")
// Work in progress, apart from the finished sets the sweep checks.
const workRoot = join(root, ".work")
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FileVersion = Pick<MediaItemRow, "sizeBytes" | "modifiedAt">

type TrickplayJob = FileVersion & { id: string; relativePath: string }

function sameFile(a: FileVersion, b: FileVersion): boolean {
  return (
    a.sizeBytes === b.sizeBytes &&
    a.modifiedAt.getTime() === b.modifiedAt.getTime()
  )
}

/** Whether the images were made from the file as it is, with the settings. */
function fits(
  row: TrickplayRow,
  file: FileVersion,
  settings: TrickplaySettings,
): boolean {
  return (
    sameFile(row, file) &&
    row.width === settings.width &&
    row.intervalSeconds === settings.intervalSeconds &&
    row.keyframesOnly === settings.keyframesOnly &&
    row.columns === COLUMNS &&
    row.rows === ROWS
  )
}

/** `fits` as a join condition between `trickplay` and `media_item`. */
function fitsSql(settings: TrickplaySettings) {
  return and(
    eq(trickplay.mediaItemId, mediaItem.id),
    eq(trickplay.sizeBytes, mediaItem.sizeBytes),
    eq(trickplay.modifiedAt, mediaItem.modifiedAt),
    eq(trickplay.width, settings.width),
    eq(trickplay.intervalSeconds, settings.intervalSeconds),
    eq(trickplay.keyframesOnly, settings.keyframesOnly),
    eq(trickplay.columns, COLUMNS),
    eq(trickplay.rows, ROWS),
  )
}

/** Probed files with a video stream and a length: what can have images. */
const hasVideo = sql`jsonb_typeof(${mediaItem.probe} -> 'video') = 'object' and coalesce((${mediaItem.probe} -> 'format' ->> 'durationSeconds')::float8, ${mediaItem.durationSeconds}) > 0`

/** `hasVideo` for one row. A file not probed yet may have one. */
function mayHaveVideo(item: MediaItemRow): boolean {
  if (item.probedAt === null) return true
  const duration = item.probe?.format.durationSeconds ?? item.durationSeconds
  return Boolean(item.probe?.video) && duration !== null && duration > 0
}

function jobOf(item: MediaItemRow): TrickplayJob {
  return {
    id: item.id,
    relativePath: item.relativePath,
    sizeBytes: item.sizeBytes,
    modifiedAt: item.modifiedAt,
  }
}

/** A changed file is a new job, so a failure doesn't outlive the file. */
function jobKey(job: TrickplayJob): string {
  return `${job.id}:${job.sizeBytes}:${job.modifiedAt.getTime()}`
}

function toTrickplay(row: TrickplayRow): Trickplay {
  return {
    key: row.key,
    width: row.width,
    height: row.height,
    columns: row.columns,
    rows: row.rows,
    count: row.count,
    intervalSeconds: row.intervalSeconds,
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

async function countFrames(dir: string): Promise<number> {
  const names = await readdir(dir)
  return names.filter((name) => name.endsWith(".jpg")).length
}

/** Width and height of an image, as ffprobe reads it. */
async function imageSize(
  path: string,
): Promise<{ width: number; height: number }> {
  const out = await run(env.MATINEE_FFPROBE_PATH, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0:s=x",
    path,
  ])
  const match = /^(\d+)x(\d+)/.exec(out.trim())
  if (!match) throw new Error(`ffprobe didn't read the size of ${path}`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

type Extraction = {
  path: string
  relativePath: string
  video: VideoStream
  durationSeconds: number
  settings: TrickplaySettings
  /** Where the thumbnails go, as `0.jpg` on. */
  dir: string
  signal: AbortSignal
}

/** How one ffmpeg run decodes. */
type Decoding = {
  keyframesOnly: boolean
  /** The GPU's input arguments; empty on the CPU. */
  gpu: string[]
}

/** Write a thumbnail per interval. Resolves with how many ffmpeg wrote. */
async function runExtraction(
  job: Extraction,
  filters: string[],
  decoding: Decoding,
): Promise<number> {
  await rm(job.dir, { recursive: true, force: true })
  await mkdir(job.dir, { recursive: true })
  await runProcess({
    name: "ffmpeg",
    command: env.MATINEE_FFMPEG_PATH,
    args: [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      ...decoding.gpu,
      ...(decoding.keyframesOnly ? ["-skip_frame", "nokey"] : []),
      "-i",
      job.path,
      "-map",
      `0:${job.video.index}`,
      "-an",
      "-sn",
      "-dn",
      "-vf",
      filters.join(","),
      "-c:v",
      "mjpeg",
      "-q:v",
      String(FRAME_QUALITY),
      "-f",
      "image2",
      "-start_number",
      "0",
      join(job.dir, "%d.jpg"),
    ],
    // ffmpeg reads the whole file. This only catches one that hangs, as
    // on a stalled network mount.
    timeoutMs: 10 * 60_000 + job.durationSeconds * 2000,
    signal: job.signal,
    priority: 10,
    idleIo: true,
  })
  return countFrames(job.dir)
}

/**
 * Write the thumbnails the way the settings ask, falling back as Jellyfin
 * does: a GPU run that fails runs again on the CPU, and a keyframes-only
 * run that fails or finds nothing decodes every frame. Resolves with how
 * many thumbnails there are.
 */
async function extractFrames(job: Extraction): Promise<number> {
  const { settings: transcoding, capabilities } = await currentTranscoding()
  const filters = thumbnailFilters(
    job.video,
    job.settings,
    transcoding,
    capabilities,
  )
  const decoding: Decoding = {
    keyframesOnly: job.settings.keyframesOnly,
    gpu: job.settings.hardwareDecoding
      ? frameDecoderArgs(job.video, transcoding, capabilities)
      : [],
  }
  // Each fallback turns one of the two off, so this ends.
  for (;;) {
    let count: number
    try {
      count = await runExtraction(job, filters, decoding)
    } catch (cause) {
      if (processFailureKind(cause) !== "exit") throw cause
      if (decoding.gpu.length > 0) {
        log.warn(
          `GPU decoding failed for ${job.relativePath}; decoding its trickplay images on the CPU`,
          cause,
        )
        decoding.gpu = []
        continue
      }
      if (!decoding.keyframesOnly) throw cause
      decoding.keyframesOnly = false
      continue
    }
    // Some streams have no frames ffmpeg counts as keyframes, like x264's
    // intra refresh, and skipping the rest leaves nothing.
    if (count > 0 || !decoding.keyframesOnly) return count
    decoding.keyframesOnly = false
  }
}

/**
 * Lay the thumbnails out in tiles. The scale holds every thumbnail to the
 * first one's size: a video that changes size midway would otherwise
 * restart the tile filter and shift every thumbnail after it.
 */
async function tileFrames(
  frames: string,
  tiles: string,
  size: { width: number; height: number },
  signal: AbortSignal,
): Promise<void> {
  await runProcess({
    name: "ffmpeg",
    command: env.MATINEE_FFMPEG_PATH,
    args: [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-reinit_filter",
      "0",
      "-start_number",
      "0",
      "-i",
      join(frames, "%d.jpg"),
      "-vf",
      `scale=${size.width}:${size.height},tile=${COLUMNS}x${ROWS}`,
      "-c:v",
      "mjpeg",
      "-q:v",
      String(TILE_QUALITY),
      "-f",
      "image2",
      "-start_number",
      "0",
      join(tiles, "%d.jpg"),
    ],
    timeoutMs: TILE_TIMEOUT_MS,
    signal,
    priority: 10,
  })
}

/** Delete the item's sets of tiles but `keep`. */
async function removeOtherSets(itemId: string, keep: string): Promise<void> {
  const dir = join(root, itemId)
  const sets = await readdir(dir).catch(() => [])
  for (const set of sets) {
    if (set !== keep) await rm(join(dir, set), { recursive: true, force: true })
  }
}

/** Make the file's images, unless it has ones that fit it and the settings. */
async function make(job: TrickplayJob, signal: AbortSignal): Promise<void> {
  const settings = await trickplaySettings()
  const [item] = await db
    .select()
    .from(mediaItem)
    .where(eq(mediaItem.id, job.id))
  if (!item) return
  // A player can ask before the background probe reached the file.
  const probe = item.probedAt === null ? await probeItem(item) : item.probe
  const video = probe?.video
  const durationSeconds =
    probe?.format.durationSeconds ?? item.durationSeconds ?? 0
  if (!video || durationSeconds <= 0) return
  const [existing] = await db
    .select()
    .from(trickplay)
    .where(eq(trickplay.mediaItemId, item.id))
  if (existing && fits(existing, item, settings)) return

  const key = randomBytes(16).toString("hex")
  const work = join(workRoot, `${item.id}-${key}`)
  const frames = join(work, "frames")
  const tiles = join(work, "tiles")
  await mkdir(frames, { recursive: true })
  await mkdir(tiles, { recursive: true })
  try {
    const count = await extractFrames({
      path: item.path,
      relativePath: item.relativePath,
      video,
      durationSeconds,
      settings,
      dir: frames,
      signal,
    })
    if (count === 0) {
      throw new Error(
        "ffmpeg couldn't decode a single frame of the video. The file may be damaged or incomplete.",
      )
    }
    const size = await imageSize(join(frames, "0.jpg"))
    await tileFrames(frames, tiles, size, signal)

    // A scan that saw the file change meanwhile queued it again.
    const [now] = await db
      .select({
        sizeBytes: mediaItem.sizeBytes,
        modifiedAt: mediaItem.modifiedAt,
      })
      .from(mediaItem)
      .where(eq(mediaItem.id, item.id))
    if (!now || !sameFile(now, item)) return

    await mkdir(join(root, item.id), { recursive: true })
    await rename(tiles, join(root, item.id, key))
    const values = {
      mediaItemId: item.id,
      key,
      sizeBytes: item.sizeBytes,
      modifiedAt: item.modifiedAt,
      width: size.width,
      height: size.height,
      columns: COLUMNS,
      rows: ROWS,
      count,
      intervalSeconds: settings.intervalSeconds,
      keyframesOnly: settings.keyframesOnly,
      createdAt: new Date(),
    }
    await db
      .insert(trickplay)
      .values(values)
      .onConflictDoUpdate({ target: trickplay.mediaItemId, set: values })
    await removeOtherSets(item.id, key)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/**
 * Trickplay images, a file at a time by default: each job reads the whole
 * file and keeps a core busy, for about 20 seconds per episode and a few
 * minutes per movie. Players that open a file without images move it to
 * the front.
 */
export const trickplays = defineQueue<TrickplayJob, void>({
  id: "trickplay",
  name: "Trickplay images",
  description: "Make the thumbnails the seek bar shows while scrubbing.",
  concurrency: 1,
  tuning: {
    max: 4,
    note: "Videos getting seek bar previews at once. An episode takes about 20 seconds, a movie a few minutes.",
  },
  key: jobKey,
  label: (job) => job.relativePath,
  group: (job) => job.id,
  retryAfterMs: RETRY_AFTER_MS,
  failure: (job) => `Couldn't make trickplay images for ${job.relativePath}`,
  // Without ffmpeg or ffprobe no file can have images.
  fatal: (cause) =>
    processFailureKind(cause) === "start"
      ? {
          message: `Skipping trickplay images: ${messageOf(cause)}`,
          drop: () => true,
        }
      : null,
  // Jobs for files that had images already count too.
  summary: ({ completed, failed, ms }) =>
    completed + failed > 1
      ? `Trickplay images: ${completed} file${completed === 1 ? "" : "s"} done in ${Math.round(ms / 1000)} s${failed > 0 ? `, ${failed} failed` : ""}`
      : null,
  run: async (job, { signal }) => {
    try {
      await make(job, signal)
    } finally {
      // Players waiting on the file look again, whether it worked or not.
      events.publish("trickplay", undefined)
    }
  },
})

/**
 * Whether the file has images. One without them goes to the front of the
 * queue, unless trickplay is off or it can't have any.
 */
export async function trickplayStatus(
  item: MediaItemRow,
): Promise<TrickplayStatus> {
  const [row] = await db
    .select()
    .from(trickplay)
    .where(eq(trickplay.mediaItemId, item.id))
  // Images at other settings still show until new ones replace them.
  if (row && sameFile(row, item)) {
    return { status: "ready", images: toTrickplay(row) }
  }
  const settings = await trickplaySettings()
  const job = jobOf(item)
  if (
    !settings.enabled ||
    !mayHaveVideo(item) ||
    trickplays.hasFailed(jobKey(job))
  ) {
    return { status: "unavailable" }
  }
  trickplays.push(job, { priority: "high" })
  return { status: "pending" }
}

/** Where a tile of a set is. The caller checks that it exists. */
export function trickplayTileFile(
  itemId: string,
  key: string,
  tile: number,
): string {
  return join(root, itemId, key, `${tile}.jpg`)
}

/** Up to three decimals, as HLS durations go. */
function seconds(value: number): string {
  return String(Number(value.toFixed(3)))
}

/**
 * The images as an HLS image playlist (Apple's image media playlists, as
 * Roku reads them and Jellyfin writes them). Each entry is a tile, as long
 * as the thumbnails in it. Tile URLs are relative to the playlist's,
 * `trickplayPlaylistPath()`.
 */
export function trickplayPlaylist(images: Trickplay): string {
  const perTile = images.columns * images.rows
  const tiles = Math.ceil(images.count / perTile)
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    // Jellyfin writes the tile count here; HLS wants the longest entry.
    `#EXT-X-TARGETDURATION:${Math.ceil(Math.min(perTile, images.count) * images.intervalSeconds)}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-IMAGES-ONLY",
  ]
  for (let tile = 0; tile < tiles; tile++) {
    const thumbnails = Math.min(perTile, images.count - tile * perTile)
    lines.push(
      `#EXTINF:${seconds(thumbnails * images.intervalSeconds)},`,
      `#EXT-X-TILES:RESOLUTION=${images.width}x${images.height},LAYOUT=${images.columns}x${images.rows},DURATION=${seconds(images.intervalSeconds)}`,
      `${images.key}/${tile}.jpg`,
    )
  }
  lines.push("#EXT-X-ENDLIST", "")
  return lines.join("\n")
}

/**
 * Queue images for every file without ones that fit it and the settings,
 * in a library or all of them, newest files first. Resolves once those
 * jobs end. Does nothing while trickplay is off.
 */
export async function makeMissingTrickplay(
  options: {
    libraryId?: string
    priority?: Priority
    signal?: AbortSignal
    progress?: (fraction: number) => void
  } = {},
): Promise<void> {
  const settings = await trickplaySettings()
  if (!settings.enabled) return
  const rows = await db
    .select({
      id: mediaItem.id,
      relativePath: mediaItem.relativePath,
      sizeBytes: mediaItem.sizeBytes,
      modifiedAt: mediaItem.modifiedAt,
    })
    .from(mediaItem)
    .leftJoin(trickplay, fitsSql(settings))
    .where(
      and(
        isNull(trickplay.mediaItemId),
        hasVideo,
        options.libraryId
          ? eq(mediaItem.libraryId, options.libraryId)
          : undefined,
      ),
    )
    .orderBy(desc(mediaItem.createdAt))
  let done = 0
  const jobs = rows.map((row) =>
    trickplays
      .run(row, { priority: options.priority ?? "low" })
      .catch(() => {
        // Logged by the queue.
      })
      .finally(() => options.progress?.(++done / rows.length)),
  )
  options.signal?.addEventListener("abort", () => {
    for (const row of rows) trickplays.cancel(jobKey(row))
  })
  await Promise.all(jobs)
}

/** Queue the images a library's new files need and leave them to the queue. */
export function queueTrickplay(libraryId: string): void {
  makeMissingTrickplay({ libraryId, priority: "normal" }).catch(
    (cause: unknown) =>
      log.error(
        `Couldn't queue trickplay images for library ${libraryId}`,
        cause,
      ),
  )
}

/** Files that can have images, and how many have ones that fit. */
export async function trickplayCoverage(
  settings: TrickplaySettings,
): Promise<{ videos: number; ready: number }> {
  const [[videos], [ready]] = await Promise.all([
    db.select({ n: count() }).from(mediaItem).where(hasVideo),
    db
      .select({ n: count() })
      .from(mediaItem)
      .innerJoin(trickplay, fitsSql(settings))
      .where(hasVideo),
  ])
  return { videos: videos?.n ?? 0, ready: ready?.n ?? 0 }
}

/**
 * Delete the tiles of files that are gone, sets that were replaced, and
 * work a crash left behind, and forget sets whose tiles are gone, so they
 * get made again. A file with a job waiting or running is left alone,
 * since its job writes there.
 */
export async function sweepTrickplay(): Promise<void> {
  const rows = await db
    .select({ id: trickplay.mediaItemId, key: trickplay.key })
    .from(trickplay)
  const keys = new Map(rows.map((row) => [row.id, row.key]))
  // `<item>/<key>` of every set on disk.
  const present = new Set<string>()
  let removed = 0
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.name === ".work") continue
    const dir = join(root, entry.name)
    if (!entry.isDirectory() || !UUID.test(entry.name)) {
      await rm(dir, { recursive: true, force: true })
      removed++
      continue
    }
    const sets = await readdir(dir).catch(() => [])
    for (const set of sets) present.add(`${entry.name}/${set}`)
    const kept = keys.get(entry.name)
    if (kept !== undefined && sets.every((set) => set === kept)) continue
    // A job may have finished since the rows were read.
    if (trickplays.busy(entry.name)) continue
    const [row] = await db
      .select({ key: trickplay.key })
      .from(trickplay)
      .where(eq(trickplay.mediaItemId, entry.name))
    if (!row) {
      await rm(dir, { recursive: true, force: true })
      removed++
      continue
    }
    for (const set of sets) {
      if (set === row.key) continue
      await rm(join(dir, set), { recursive: true, force: true })
      removed++
    }
  }
  for (const name of await readdir(workRoot).catch(() => [])) {
    if (trickplays.busy(name.slice(0, 36))) continue
    await rm(join(workRoot, name), { recursive: true, force: true })
  }
  // Matching the key leaves rows a job replaced meanwhile.
  const lost = rows.filter((row) => !present.has(`${row.id}/${row.key}`))
  for (const row of lost) {
    await db
      .delete(trickplay)
      .where(and(eq(trickplay.mediaItemId, row.id), eq(trickplay.key, row.key)))
  }
  if (removed > 0) {
    log.info(`Deleted ${removed} unused sets of trickplay images`)
  }
  if (lost.length > 0) {
    log.warn(
      `${lost.length} sets of trickplay images were missing from ${root}; they'll be made again`,
    )
  }
}
