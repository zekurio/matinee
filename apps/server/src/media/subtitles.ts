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
import { join } from "node:path"

import type {
  MediaProbe,
  Subtitles,
  SubtitleStream,
  SubtitleTrack,
} from "@matinee/contracts"
import {
  type MediaItemRow,
  subtitleFile,
  type SubtitleFileRow,
} from "@matinee/db"
import { and, asc, eq } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { keyedWork } from "./keyed-work"
import { languageTag, trackLabel } from "./language"
import { probeItem } from "./probe"
import { run } from "./process"
import { cleanVtt, decodeText, srtToVtt, vttText } from "./webvtt"

// Sidecar formats that are pictures: PGS and VobSub.
const PICTURE_FORMATS = new Set(["sup", "idx"])
const UUID = /^[0-9a-f-]{36}$/i
const STREAM_ID = /^stream-(\d{1,4})$/
// Pulling one stream out of a large file reads all of it.
const EXTRACT_TIMEOUT_MS = 10 * 60_000
// Bump when the conversion changes, so browsers drop what they cached.
const VERSION = 1

const dir = join(env.dataDir, "subtitles")
// Each extraction reads a whole file; two at a time leaves the disk room
// for the streams people are watching.
const conversions = keyedWork<string>(2)

function sidecarTrack(row: SubtitleFileRow): SubtitleTrack {
  return {
    id: row.id,
    label: trackLabel(row.language, row.title, "Unknown language"),
    language: row.language,
    forced: row.forced,
    sdh: row.sdh,
    default: row.isDefault,
    source: "sidecar",
    available: !PICTURE_FORMATS.has(row.format),
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
    forced: stream.forced || /\bforced\b/.test(words),
    sdh: stream.hearingImpaired || /\b(sdh|cc|hearing impaired)\b/.test(words),
    default: stream.default,
    source: "embedded",
    available: stream.kind === "text",
  }
}

/**
 * What ffprobe read from the file, probing it now if the background probe
 * hasn't reached it yet. Null when ffprobe couldn't read it, and when the
 * file changed since the scan that stored the probe: its stream indexes
 * may be gone, and the next scan probes it again.
 */
async function fileProbe(
  item: MediaItemRow,
  info: Stats,
): Promise<MediaProbe | null> {
  if (
    info.size !== item.sizeBytes ||
    info.mtime.getTime() !== item.modifiedAt.getTime()
  ) {
    return null
  }
  if (item.probedAt !== null) return item.probe
  return probeItem(item).catch(() => null)
}

/**
 * A file's subtitle tracks. Picture-based streams are listed as
 * unavailable, so people can tell the file has them.
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
  const probe = info?.isFile() ? await fileProbe(item, info) : null
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

async function removeStale(name: string, keep: string): Promise<void> {
  const files = await readdir(dir).catch(() => [])
  for (const file of files) {
    if (file.startsWith(`${name}-`) && file.endsWith(".vtt") && file !== keep) {
      await rm(join(dir, file), { force: true })
    }
  }
}

async function extract(
  name: string,
  file: string,
  input: string[],
): Promise<string> {
  await mkdir(dir, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  let text
  try {
    await run(
      env.MATINEE_FFMPEG_PATH,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        ...input,
        "-c:s",
        "webvtt",
        "-f",
        "webvtt",
        "-y",
        tmp,
      ],
      EXTRACT_TIMEOUT_MS,
    )
    text = cleanVtt(await readFile(tmp, "utf8"))
    await writeFile(tmp, text)
    await rename(tmp, file)
  } catch (cause) {
    await rm(tmp, { force: true })
    log.warn(`Couldn't convert subtitles ${name}`, cause)
    throw cause
  }
  await removeStale(name, file.slice(dir.length + 1))
  return text
}

/**
 * ffmpeg's WebVTT for a subtitle file or stream, cached under the data dir.
 * The cache file's name holds the source's modification time and size, so
 * a replaced file is converted again. Null when ffmpeg failed on it.
 */
async function converted(
  name: string,
  info: Stats,
  input: string[],
): Promise<string | null> {
  const key = `${name}-${Math.floor(info.mtimeMs)}-${info.size}`
  const file = join(dir, `${key}.vtt`)
  const cached = await readFile(file, "utf8").catch(() => null)
  if (cached !== null) return cached
  if (conversions.hasFailed(key)) return null
  return conversions
    .run(key, () => extract(name, file, input))
    .catch(() => null)
}

async function sidecarText(
  row: SubtitleFileRow,
  info: Stats,
): Promise<string | null> {
  if (row.format === "srt" || row.format === "vtt") {
    const bytes = await readFile(row.path).catch((cause: unknown) => {
      log.warn(`Couldn't read ${row.path}`, cause)
      return null
    })
    if (!bytes) return null
    const text = decodeText(bytes)
    return row.format === "srt" ? srtToVtt(text) : vttText(text)
  }
  // ASS and SSA lose their styling on the way.
  return converted(`file-${row.id}`, info, ["-i", row.path, "-map", "0:s:0"])
}

export type SubtitleBody = {
  /** Changes whenever the served text would. */
  etag: string
  /** The track as WebVTT. Null when it can't be read or converted. */
  read: () => Promise<string | null>
}

/**
 * Look up a track for the subtitle route. The id is either a row of
 * `subtitle_file` or `stream-<index>` for a text stream inside the file.
 * Null when the item has no such track or it can't be shown.
 */
export async function openSubtitle(
  item: MediaItemRow,
  trackId: string,
): Promise<SubtitleBody | null> {
  const stream = STREAM_ID.exec(trackId)
  if (stream) {
    const index = Number(stream[1])
    const info = await stat(item.path).catch(() => null)
    if (!info?.isFile()) return null
    const probe = await fileProbe(item, info)
    if (
      !probe?.subtitles.some(
        (candidate) => candidate.index === index && candidate.kind === "text",
      )
    ) {
      return null
    }
    const name = `${item.id}-${index}`
    return {
      etag: etagFor(name, info),
      read: () =>
        converted(name, info, ["-i", item.path, "-map", `0:${index}`]),
    }
  }

  if (!UUID.test(trackId)) return null
  const [row] = await db
    .select()
    .from(subtitleFile)
    .where(
      and(eq(subtitleFile.id, trackId), eq(subtitleFile.mediaItemId, item.id)),
    )
  if (!row || PICTURE_FORMATS.has(row.format)) return null
  const info = await stat(row.path).catch(() => null)
  if (!info?.isFile()) return null
  return { etag: etagFor(row.id, info), read: () => sidecarText(row, info) }
}
