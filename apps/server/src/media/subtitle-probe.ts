import type { Stats } from "node:fs"

import { z } from "zod"

import { env } from "../env"
import { log } from "../log"
import { keyedWork } from "./keyed-work"
import { languageTag } from "./language"
import { run } from "./process"

/** Subtitle codecs ffmpeg can turn into WebVTT. The rest are pictures. */
const TEXT_CODECS = new Set([
  "subrip",
  "srt",
  "ass",
  "ssa",
  "mov_text",
  "webvtt",
  "text",
])
const MAX_CACHED = 1000

export type EmbeddedSubtitle = {
  /** Absolute stream index, for ffmpeg's `-map 0:<index>`. */
  index: number
  codec: string
  /** Text can be extracted. PGS, VobSub, and DVB are pictures and can't. */
  text: boolean
  language: string | null
  title: string | null
  forced: boolean
  sdh: boolean
  isDefault: boolean
}

export type FileStreams = {
  subtitles: EmbeddedSubtitle[]
  /** Language of the default audio stream, or of the first one. */
  audioLanguage: string | null
}

const ProbeStream = z.object({
  index: z.number().int().nonnegative(),
  codec_type: z.string().catch(""),
  codec_name: z.string().catch(""),
  tags: z.record(z.string(), z.string()).catch({}),
  disposition: z.record(z.string(), z.number()).catch({}),
})
type ProbeStream = z.infer<typeof ProbeStream>
const ProbeOutput = z.object({
  // A stream ffprobe describes oddly is skipped, not the whole file.
  streams: z.array(ProbeStream.nullable().catch(null)).catch([]),
})

const EMPTY: FileStreams = { subtitles: [], audioLanguage: null }

type Cached = { mtimeMs: number; size: number; streams: FileStreams }
const cache = new Map<string, Cached>()
const probes = keyedWork<FileStreams>(4)

function tag(stream: ProbeStream, name: string): string | null {
  for (const [key, value] of Object.entries(stream.tags)) {
    if (key.toLowerCase() === name && value.trim()) return value.trim()
  }
  return null
}

function toSubtitle(stream: ProbeStream): EmbeddedSubtitle {
  const title = tag(stream, "title")
  const words = title?.toLowerCase() ?? ""
  return {
    index: stream.index,
    codec: stream.codec_name,
    text: TEXT_CODECS.has(stream.codec_name),
    language: languageTag(tag(stream, "language") ?? ""),
    title,
    forced: stream.disposition.forced === 1 || /\bforced\b/.test(words),
    sdh:
      stream.disposition.hearing_impaired === 1 ||
      /\b(sdh|cc|hearing impaired)\b/.test(words),
    isDefault: stream.disposition.default === 1,
  }
}

async function probe(path: string): Promise<FileStreams> {
  const out = await run(env.MATINEE_FFPROBE_PATH, [
    "-v",
    "error",
    // Subtitle streams, plus the audio to tell which forced track fits.
    "-show_entries",
    "stream=index,codec_type,codec_name:stream_tags=language,title:stream_disposition=default,forced,hearing_impaired",
    "-of",
    "json",
    path,
  ])
  const parsed = ProbeOutput.parse(JSON.parse(out))
  const streams = parsed.streams.filter((stream) => stream !== null)
  const audio = streams.filter((stream) => stream.codec_type === "audio")
  const firstAudio =
    audio.find((stream) => stream.disposition.default === 1) ?? audio[0]
  return {
    subtitles: streams
      .filter((stream) => stream.codec_type === "subtitle")
      .map(toSubtitle),
    audioLanguage: firstAudio
      ? languageTag(tag(firstAudio, "language") ?? "")
      : null,
  }
}

/**
 * The subtitle streams in a file and the language of its audio, from
 * ffprobe. Cached until the file's modification time or size changes, and
 * empty when ffprobe can't read the file.
 *
 * This is the one place that reads streams for subtitles. Once the scan
 * stores ffprobe stream info, it should read that instead.
 */
export async function probeStreams(
  path: string,
  info: Stats,
): Promise<FileStreams> {
  const cached = cache.get(path)
  if (cached?.mtimeMs === info.mtimeMs && cached.size === info.size) {
    return cached.streams
  }
  const key = `${path}:${info.mtimeMs}:${info.size}`
  if (probes.hasFailed(key)) return EMPTY
  try {
    const streams = await probes.run(key, () =>
      probe(path).catch((cause: unknown) => {
        log.warn(`Couldn't read the streams of ${path}`, cause)
        throw cause
      }),
    )
    // Map order is insertion order, so the first key is the oldest.
    cache.delete(path)
    cache.set(path, { mtimeMs: info.mtimeMs, size: info.size, streams })
    if (cache.size > MAX_CACHED) {
      const oldest = cache.keys().next()
      if (!oldest.done) cache.delete(oldest.value)
    }
    return streams
  } catch {
    return EMPTY
  }
}
