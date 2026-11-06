import type {
  AudioStream,
  HdrFormat,
  MediaProbe,
  SubtitleKind,
  SubtitleStream,
  VideoStream,
} from "@matinee/contracts"
import { z } from "zod"

import { env } from "../env"
import { runProcess } from "./process"

// Probing reads headers only; anything slower is a wedged process or a
// stalled network mount.
const PROBE_TIMEOUT_MS = 30_000

// ffprobe prints most numbers as strings, such as "23.976" or "N/A".
const Numeric = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .transform(Number),
  ])
  .optional()
  .catch(undefined)
const Text = z.string().trim().min(1).optional().catch(undefined)

const FfprobeStream = z.object({
  index: z.number().int().nonnegative(),
  codec_type: Text,
  codec_name: Text,
  profile: Text,
  level: Numeric,
  width: Numeric,
  height: Numeric,
  avg_frame_rate: Text,
  r_frame_rate: Text,
  pix_fmt: Text,
  bits_per_raw_sample: Numeric,
  color_transfer: Text,
  side_data_list: z
    .array(z.object({ side_data_type: Text, dv_profile: Numeric }))
    .optional()
    .catch(undefined),
  channels: Numeric,
  channel_layout: Text,
  disposition: z
    .object({
      default: Numeric,
      forced: Numeric,
      hearing_impaired: Numeric,
      attached_pic: Numeric,
      timed_thumbnails: Numeric,
    })
    .optional()
    .catch(undefined),
  tags: z.record(z.string(), z.string()).optional().catch(undefined),
})
type FfprobeStream = z.infer<typeof FfprobeStream>

const FfprobeOutput = z.object({
  format: z
    .object({ format_name: Text, duration: Numeric, bit_rate: Numeric })
    .optional()
    .catch(undefined),
  // Checked one by one, so one odd stream doesn't hide the rest.
  streams: z.array(z.unknown()).catch([]),
})

const TEXT_SUBTITLES = new Set([
  "subrip",
  "srt",
  "ass",
  "ssa",
  "mov_text",
  "webvtt",
  "text",
  "microdvd",
  "mpl2",
  "realtext",
  "sami",
  "subviewer",
  "subviewer1",
  "jacosub",
  "pjs",
  "vplayer",
  "stl",
])
const BITMAP_SUBTITLES = new Set([
  "hdmv_pgs_subtitle",
  "dvd_subtitle",
  "dvb_subtitle",
  "xsub",
])

function subtitleKind(codec: string): SubtitleKind | null {
  if (TEXT_SUBTITLES.has(codec)) return "text"
  if (BITMAP_SUBTITLES.has(codec)) return "bitmap"
  return null
}

/** A tag by name; Matroska and MP4 disagree on case. */
function tag(stream: FfprobeStream, name: string): string | null {
  for (const [key, value] of Object.entries(stream.tags ?? {})) {
    if (key.toLowerCase() === name) return value.trim() || null
  }
  return null
}

function language(stream: FfprobeStream): string | null {
  const code = tag(stream, "language")?.toLowerCase()
  return code && code !== "und" ? code : null
}

function integer(value: number | undefined): number | null {
  return value === undefined ? null : Math.round(value)
}

/** "24000/1001" as 23.976. Null for "0/0" and other unknowns. */
function frameRate(value: string | undefined): number | null {
  if (!value) return null
  const [numerator, denominator = 1] = value.split("/", 2).map(Number)
  if (
    numerator === undefined ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return null
  }
  return Math.round((numerator / denominator) * 1000) / 1000
}

/** From the codec when it says, else the `10le` in `yuv420p10le`. */
function bitDepth(stream: FfprobeStream): number | null {
  if (stream.bits_per_raw_sample) return stream.bits_per_raw_sample
  if (!stream.pix_fmt) return null
  const depth = Number(/(\d+)[lb]e$/.exec(stream.pix_fmt)?.[1])
  return depth >= 9 && depth <= 16 ? depth : 8
}

function hdrFormat(
  stream: FfprobeStream,
  dolbyVision: boolean,
): HdrFormat | null {
  if (dolbyVision) return "dolby-vision"
  if (stream.color_transfer === "smpte2084") return "hdr10"
  if (stream.color_transfer === "arib-std-b67") return "hlg"
  return null
}

function toVideo(stream: FfprobeStream, codec: string): VideoStream | null {
  if (!stream.width || !stream.height) return null
  const dovi = stream.side_data_list?.find(
    (data) => data.side_data_type === "DOVI configuration record",
  )
  return {
    index: stream.index,
    codec,
    profile: stream.profile ?? null,
    level: integer(stream.level),
    width: Math.round(stream.width),
    height: Math.round(stream.height),
    frameRate:
      frameRate(stream.avg_frame_rate) ?? frameRate(stream.r_frame_rate),
    pixelFormat: stream.pix_fmt ?? null,
    bitDepth: bitDepth(stream),
    colorTransfer: stream.color_transfer ?? null,
    hdr: hdrFormat(stream, dovi !== undefined),
    dolbyVisionProfile: integer(dovi?.dv_profile),
  }
}

function toAudio(stream: FfprobeStream, codec: string): AudioStream {
  return {
    index: stream.index,
    codec,
    profile: stream.profile ?? null,
    channels: integer(stream.channels),
    channelLayout: stream.channel_layout ?? null,
    language: language(stream),
    title: tag(stream, "title"),
    default: stream.disposition?.default === 1,
  }
}

function toSubtitle(stream: FfprobeStream, codec: string): SubtitleStream {
  return {
    index: stream.index,
    codec,
    kind: subtitleKind(codec),
    language: language(stream),
    title: tag(stream, "title"),
    default: stream.disposition?.default === 1,
    forced: stream.disposition?.forced === 1,
    hearingImpaired: stream.disposition?.hearing_impaired === 1,
  }
}

/** The summary of ffprobe's `-show_streams -show_format` JSON. */
export function readProbe(stdout: string): MediaProbe {
  let json: Parameters<typeof FfprobeOutput.parse>[0]
  try {
    json = JSON.parse(stdout)
  } catch {
    throw new Error("ffprobe printed something other than JSON")
  }
  const output = FfprobeOutput.parse(json)
  const probe: MediaProbe = {
    format: {
      name: output.format?.format_name ?? "unknown",
      durationSeconds:
        output.format?.duration && output.format.duration > 0
          ? output.format.duration
          : null,
      bitRate: integer(output.format?.bit_rate),
    },
    video: null,
    audio: [],
    subtitles: [],
  }
  for (const value of output.streams) {
    const parsed = FfprobeStream.safeParse(value)
    if (!parsed.success) continue
    const stream = parsed.data
    const codec = stream.codec_name
    if (!codec) continue
    if (stream.codec_type === "video") {
      // Cover art in Matroska and MP4 is a one-frame video stream.
      const still =
        stream.disposition?.attached_pic === 1 ||
        stream.disposition?.timed_thumbnails === 1
      if (!still) probe.video ??= toVideo(stream, codec)
    } else if (stream.codec_type === "audio") {
      probe.audio.push(toAudio(stream, codec))
    } else if (stream.codec_type === "subtitle") {
      probe.subtitles.push(toSubtitle(stream, codec))
    }
  }
  if (!probe.video && probe.audio.length === 0) {
    throw new Error("ffprobe found no video or audio streams")
  }
  return probe
}

/** Run ffprobe once on a file and summarize its streams. */
export async function runFfprobe(
  path: string,
  signal?: AbortSignal,
): Promise<MediaProbe> {
  const lines: string[] = []
  await runProcess({
    name: "ffprobe",
    command: env.MATINEE_FFPROBE_PATH,
    args: [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      path,
    ],
    timeoutMs: PROBE_TIMEOUT_MS,
    signal,
    // Background work; the server's own requests come first.
    priority: 10,
    onStdoutLine: (line) => lines.push(line),
  })
  return readProbe(lines.join("\n"))
}
