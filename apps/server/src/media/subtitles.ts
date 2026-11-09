import type { Stats } from "node:fs"
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { basename, join } from "node:path"

import type {
  SubtitleDelivery,
  Subtitles,
  SubtitleStream,
  SubtitleTrack,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  type MediaItemRow,
  subtitleFile,
  type SubtitleFileRow,
} from "@matinee/db"
import { and, asc, eq } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { defineQueue } from "../jobs/queue"
import { log } from "../log"
import { languageTag, trackLabel } from "./language"
import { currentProbe } from "./probe"
import { run } from "./process"
import { cleanVtt, decodeText, srtToVtt, vttText } from "./webvtt"

// Display names for ffmpeg's codec names and sidecar extensions.
const FORMAT_NAMES = new Map([
  ["subrip", "SRT"],
  ["srt", "SRT"],
  ["ass", "ASS"],
  ["ssa", "SSA"],
  ["webvtt", "WebVTT"],
  ["vtt", "WebVTT"],
  ["mov_text", "TX3G"],
  ["hdmv_pgs_subtitle", "PGS"],
  ["sup", "PGS"],
  ["dvd_subtitle", "VobSub"],
  ["idx", "VobSub"],
  ["dvb_subtitle", "DVB"],
  ["dvb_teletext", "Teletext"],
])
const UUID = /^[0-9a-f-]{36}$/i
const STREAM_ID = /^stream-(\d{1,4})$/
// Pulling one stream out of a large file reads all of it.
const EXTRACT_TIMEOUT_MS = 10 * 60_000
const START_TIMEOUT_MS = 15_000
// Bump when the conversion changes, so browsers drop what they cached.
const VERSION = 2

const dir = join(env.dataDir, "subtitles")

/** What the cache holds: WebVTT, or PGS copied out of a video. */
type Output = "vtt" | "sup"

const OUTPUT_ARGS = {
  vtt: ["-c:s", "webvtt", "-f", "webvtt"],
  sup: ["-c:s", "copy", "-f", "sup"],
} satisfies Record<Output, string[]>

function formatName(codec: string): string {
  return FORMAT_NAMES.get(codec) ?? codec.toUpperCase()
}

/** Sidecars by extension: PGS goes out as it is, VobSub only burns in. */
function sidecarDelivery(format: string): SubtitleDelivery {
  if (format === "sup") return "pgs"
  if (format === "idx") return "burn-in"
  return "webvtt"
}

function streamDelivery(stream: SubtitleStream): SubtitleDelivery | null {
  if (stream.kind === "text") return "webvtt"
  if (stream.codec === "hdmv_pgs_subtitle") return "pgs"
  if (stream.kind === "bitmap") return "burn-in"
  return null
}

function sidecarTrack(row: SubtitleFileRow): SubtitleTrack {
  return {
    id: row.id,
    label: trackLabel(row.language, row.title, "Unknown language"),
    language: row.language,
    title: row.title,
    forced: row.forced,
    sdh: row.sdh,
    default: row.isDefault,
    source: "sidecar",
    format: formatName(row.format),
    delivery: sidecarDelivery(row.format),
  }
}

function embeddedTrack(
  stream: SubtitleStream,
  position: number,
): SubtitleTrack {
  const language = languageTag(stream.language ?? "")
  const words = stream.title?.toLowerCase() ?? ""
  return {
    id: `stream-${stream.index}`,
    label: trackLabel(language, stream.title, `Track ${position + 1}`),
    language,
    title: stream.title ?? null,
    forced: stream.forced || /\bforced\b/.test(words),
    sdh: stream.hearingImpaired || /\b(sdh|cc|hearing impaired)\b/.test(words),
    default: stream.default,
    source: "embedded",
    format: formatName(stream.codec),
    delivery: streamDelivery(stream),
  }
}

/**
 * A file's subtitle tracks. Streams nothing can show, like teletext, are
 * listed too, so people can tell the file has them.
 */
export async function listSubtitles(item: MediaItemRow): Promise<Subtitles> {
  const [files, info] = await Promise.all([
    db
      .select()
      .from(subtitleFile)
      .where(eq(subtitleFile.mediaItemId, item.id))
      .orderBy(asc(subtitleFile.path)),
    stat(item.path).catch(() => null),
  ])
  const probe = info?.isFile() ? await currentProbe(item, info) : null
  // The default audio plays first, else the first audio stream.
  const audio = probe?.audio.find((stream) => stream.default) ?? probe?.audio[0]
  return {
    tracks: [
      // By language, so a file's English tracks sit together.
      ...files.map(sidecarTrack).sort((a, b) => a.label.localeCompare(b.label)),
      ...(probe?.subtitles ?? []).map(embeddedTrack),
    ],
    audioLanguage: languageTag(audio?.language ?? ""),
  }
}

function etagFor(name: string, info: Stats): string {
  return `"v${VERSION}-${name}-${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
}

async function removeStale(
  name: string,
  output: Output,
  keep: string,
): Promise<void> {
  const files = await readdir(dir).catch(() => [])
  for (const file of files) {
    if (
      file.startsWith(`${name}-`) &&
      file.endsWith(`.${output}`) &&
      file !== keep
    ) {
      await rm(join(dir, file), { force: true })
    }
  }
}

type Conversion = {
  key: string
  name: string
  file: string
  input: string[]
  output: Output
}

async function extract(job: Conversion): Promise<void> {
  await mkdir(dir, { recursive: true })
  const tmp = `${job.file}.${process.pid}.tmp`
  try {
    await run(
      env.MATINEE_FFMPEG_PATH,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        ...job.input,
        ...OUTPUT_ARGS[job.output],
        "-y",
        tmp,
      ],
      EXTRACT_TIMEOUT_MS,
    )
    if (job.output === "vtt") {
      await writeFile(tmp, cleanVtt(await readFile(tmp, "utf8")))
    }
    await rename(tmp, job.file)
  } catch (cause) {
    await rm(tmp, { force: true })
    throw cause
  }
  await removeStale(job.name, job.output, basename(job.file))
}

/**
 * Subtitles turned into WebVTT, and PGS tracks copied out of videos. Each
 * extraction of an embedded track reads the whole file; two at a time
 * leaves the disk room for the streams people are watching. One that
 * failed isn't tried again until the source changes, which changes its
 * key.
 */
const conversions = defineQueue<Conversion, void>({
  id: "subtitles",
  name: "Subtitles",
  description:
    "Convert subtitles to WebVTT, and copy PGS subtitles out of videos.",
  concurrency: 2,
  key: (job) => job.key,
  label: (job) => job.name,
  retryAfterMs: Number.POSITIVE_INFINITY,
  failure: (job) => `Couldn't convert subtitles ${job.name}`,
  run: extract,
})

/**
 * The path of ffmpeg's output for a subtitle file or stream, cached under
 * the data dir. The cache file's name holds the source's modification time
 * and size, so a replaced file is converted again. Null when ffmpeg failed
 * on it.
 */
async function converted(
  name: string,
  info: Stats,
  input: string[],
  output: Output,
): Promise<string | null> {
  const key = `${name}-${Math.floor(info.mtimeMs)}-${info.size}.${output}`
  const file = join(dir, key)
  const cached = await stat(file).catch(() => null)
  if (cached?.isFile()) return file
  return conversions
    .run({ key, name, file, input, output }, { priority: "high" })
    .then(
      () => file,
      () => null,
    )
}

/** A track's bytes, as the subtitle route sends them. */
type SubtitleContent =
  | { kind: "webvtt"; text: string }
  | { kind: "pgs"; path: string }

async function webvtt(file: string | null): Promise<SubtitleContent | null> {
  if (file === null) return null
  const text = await readFile(file, "utf8").catch(() => null)
  // Cleaned again: files cached before a fix to it keep their faults.
  return text === null ? null : { kind: "webvtt", text: cleanVtt(text) }
}

async function sidecarText(
  row: SubtitleFileRow,
  info: Stats,
): Promise<SubtitleContent | null> {
  if (row.format === "srt" || row.format === "vtt") {
    const bytes = await readFile(row.path).catch((cause: unknown) => {
      log.warn(`Couldn't read ${row.path}`, cause)
      return null
    })
    if (!bytes) return null
    const text = decodeText(bytes)
    return {
      kind: "webvtt",
      text: cleanVtt(row.format === "srt" ? srtToVtt(text) : vttText(text)),
    }
  }
  // ASS and SSA lose their styling on the way.
  return webvtt(
    await converted(
      `file-${row.id}`,
      info,
      ["-i", row.path, "-map", "0:s:0"],
      "vtt",
    ),
  )
}

export type SubtitleBody = {
  /** Changes whenever the served bytes would. */
  etag: string
  /** The track's bytes. Null when it can't be read or converted. */
  read: () => Promise<SubtitleContent | null>
}

function sidecarRow(
  item: MediaItemRow,
  trackId: string,
): Promise<SubtitleFileRow | undefined> {
  return db
    .select()
    .from(subtitleFile)
    .where(
      and(eq(subtitleFile.id, trackId), eq(subtitleFile.mediaItemId, item.id)),
    )
    .then(([row]) => row)
}

/** The probed stream of a `stream-<index>` track, if the file has it. */
async function embeddedStream(
  item: MediaItemRow,
  index: number,
): Promise<{ stream: SubtitleStream; info: Stats } | null> {
  const info = await stat(item.path).catch(() => null)
  if (!info?.isFile()) return null
  const probe = await currentProbe(item, info)
  const stream = probe?.subtitles.find((candidate) => candidate.index === index)
  return stream ? { stream, info } : null
}

/**
 * Look up a track for the subtitle route. The id is either a row of
 * `subtitle_file` or `stream-<index>` for a stream inside the file. Null
 * when the item has no such track or only an encode can show it.
 */
export async function openSubtitle(
  item: MediaItemRow,
  trackId: string,
): Promise<SubtitleBody | null> {
  const match = STREAM_ID.exec(trackId)
  if (match) {
    const index = Number(match[1])
    const found = await embeddedStream(item, index)
    if (!found) return null
    const { stream, info } = found
    const delivery = streamDelivery(stream)
    const name = `${item.id}-${index}`
    const input = ["-i", item.path, "-map", `0:${index}`]
    if (delivery === "webvtt") {
      return {
        etag: etagFor(name, info),
        read: async () => webvtt(await converted(name, info, input, "vtt")),
      }
    }
    if (delivery === "pgs") {
      return {
        etag: etagFor(name, info),
        read: async () => {
          const path = await converted(name, info, input, "sup")
          return path === null ? null : { kind: "pgs", path }
        },
      }
    }
    return null
  }

  if (!UUID.test(trackId)) return null
  const row = await sidecarRow(item, trackId)
  if (!row) return null
  const delivery = sidecarDelivery(row.format)
  if (delivery === "burn-in") return null
  const info = await stat(row.path).catch(() => null)
  if (!info?.isFile()) return null
  return {
    etag: etagFor(row.id, info),
    read:
      delivery === "pgs"
        ? () => Promise.resolve({ kind: "pgs", path: row.path })
        : () => sidecarText(row, info),
  }
}

/**
 * A picture subtitle to burn into an encode: a stream of the file, or a
 * subtitle file read as an input of its own.
 */
export type BurnInSource =
  | { kind: "stream"; index: number }
  | {
      kind: "file"
      path: string
      size: number
      modified: number
      /** The time of its first picture, which ffmpeg reads as its start. */
      startSeconds: number
    }

const StartTime = t.object({
  format: t
    .object({ start_time: t.coerce.number().optional().catch(undefined) })
    .optional()
    .catch(undefined),
})

/** Where ffmpeg says a subtitle file starts: its first cue or picture. */
async function startSeconds(path: string): Promise<number> {
  const stdout = await run(
    env.MATINEE_FFPROBE_PATH,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "format=start_time",
      path,
    ],
    START_TIMEOUT_MS,
  )
  let json
  try {
    json = JSON.parse(stdout)
  } catch {
    return 0
  }
  const start = StartTime.parse(json).format?.start_time ?? 0
  return Number.isFinite(start) && start > 0 ? start : 0
}

/**
 * A picture track for an encode to burn in. Null when the item has no
 * such track, it's text, or its file can't be read.
 */
export async function burnInSource(
  item: MediaItemRow,
  trackId: string,
): Promise<BurnInSource | null> {
  const match = STREAM_ID.exec(trackId)
  if (match) {
    const index = Number(match[1])
    const found = await embeddedStream(item, index)
    return found?.stream.kind === "bitmap" ? { kind: "stream", index } : null
  }
  if (!UUID.test(trackId)) return null
  const row = await sidecarRow(item, trackId)
  if (!row || sidecarDelivery(row.format) === "webvtt") return null
  const info = await stat(row.path).catch(() => null)
  if (!info?.isFile()) return null
  let start
  try {
    start = await startSeconds(row.path)
  } catch (cause) {
    log.warn(`Couldn't read ${row.path}`, cause)
    return null
  }
  return {
    kind: "file",
    path: row.path,
    size: info.size,
    modified: info.mtimeMs,
    startSeconds: start,
  }
}

/**
 * A subtitle track to put in a Matroska file as it is: a stream of the
 * file, or a subtitle file read as an input of its own.
 */
export type MuxSource =
  | { kind: "stream"; index: number; codec: string }
  | {
      kind: "file"
      path: string
      /** The time of its first cue or picture, which ffmpeg reads as its start. */
      startSeconds: number
      /** For ffmpeg's `-sub_charenc`, when a text file isn't UTF-8. */
      charset: string | null
    }

/** Whether text bytes need a character set other than UTF-8 to read. */
function legacyText(bytes: Uint8Array): boolean {
  const bom =
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  if (bom) return false
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return false
  } catch {
    return true
  }
}

/**
 * A track for a Matroska download. Null when the item has no such track,
 * nothing can show it, or its file can't be read.
 */
export async function muxSource(
  item: MediaItemRow,
  trackId: string,
): Promise<MuxSource | null> {
  const match = STREAM_ID.exec(trackId)
  if (match) {
    const found = await embeddedStream(item, Number(match[1]))
    if (!found || streamDelivery(found.stream) === null) return null
    return {
      kind: "stream",
      index: found.stream.index,
      codec: found.stream.codec,
    }
  }
  if (!UUID.test(trackId)) return null
  const row = await sidecarRow(item, trackId)
  if (!row) return null
  const info = await stat(row.path).catch(() => null)
  if (!info?.isFile()) return null
  const text = sidecarDelivery(row.format) === "webvtt"
  try {
    const bytes = text ? await readFile(row.path) : null
    return {
      kind: "file",
      path: row.path,
      startSeconds: await startSeconds(row.path),
      charset: bytes && legacyText(bytes) ? "WINDOWS-1252" : null,
    }
  } catch (cause) {
    log.warn(`Couldn't read ${row.path}`, cause)
    return null
  }
}
