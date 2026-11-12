import type {
  AudioStream,
  ContentLightLevel,
  DolbyVision,
  HdrFormat,
  MediaProbe,
  SubtitleKind,
  SubtitleStream,
  VideoStream,
} from "@matinee/contracts"
import { type SchemaBoundaryInput, t } from "@matinee/contracts/schema"

import { env } from "../env"
import { runProcess } from "./process"

// Probing reads headers and one frame; anything slower is a wedged process
// or a stalled network mount.
const PROBE_TIMEOUT_MS = 30_000

// ffprobe prints most numbers as strings, such as "23.976" or "N/A".
const Numeric = t
  .union([
    t.number(),
    t
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .transform(Number),
  ])
  .optional()
  .catch(undefined)
const Text = t.string().trim().min(1).optional().catch(undefined)

// Side data of a stream or a frame. Each type has its own fields.
const SideData = t.object({
  side_data_type: Text,
  dv_profile: Numeric,
  dv_level: Numeric,
  rpu_present_flag: Numeric,
  el_present_flag: Numeric,
  bl_present_flag: Numeric,
  dv_bl_signal_compatibility_id: Numeric,
  max_content: Numeric,
  max_average: Numeric,
})
type SideData = t.infer<typeof SideData>
const SideDataList = t.array(SideData).optional().catch(undefined)

const FfprobeStream = t.object({
  index: t.number().int().nonnegative(),
  codec_type: Text,
  codec_name: Text,
  codec_tag_string: Text,
  profile: Text,
  level: Numeric,
  width: Numeric,
  height: Numeric,
  avg_frame_rate: Text,
  r_frame_rate: Text,
  bit_rate: Numeric,
  pix_fmt: Text,
  bits_per_raw_sample: Numeric,
  color_range: Text,
  color_space: Text,
  color_transfer: Text,
  color_primaries: Text,
  field_order: Text,
  side_data_list: SideDataList,
  channels: Numeric,
  channel_layout: Text,
  disposition: t
    .object({
      default: Numeric,
      forced: Numeric,
      hearing_impaired: Numeric,
      attached_pic: Numeric,
      timed_thumbnails: Numeric,
    })
    .optional()
    .catch(undefined),
  tags: t.record(t.string(), t.string()).optional().catch(undefined),
})
type FfprobeStream = t.infer<typeof FfprobeStream>

const FfprobeOutput = t.object({
  format: t
    .object({
      format_name: Text,
      duration: Numeric,
      bit_rate: Numeric,
      start_time: Numeric,
    })
    .optional()
    .catch(undefined),
  // Checked one by one, so one odd stream doesn't hide the rest.
  streams: t.array(t.unknown()).catch([]),
})

const FfprobeFrames = t.object({
  frames: t.array(t.object({ side_data_list: SideDataList })).catch([]),
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

const DOVI_RECORD = "DOVI configuration record"
const MASTERING_DISPLAY = "Mastering display metadata"
const CONTENT_LIGHT = "Content light level metadata"
const HDR10_PLUS = "HDR Dynamic Metadata SMPTE2094-40 (HDR10+)"

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

/** A value ffprobe prints when it doesn't know, such as `unknown`, as null. */
function known(value: string | undefined): string | null {
  if (!value || value === "unknown" || value === "unspecified") return null
  return value
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

function sideData(list: SideData[] | undefined, type: string) {
  return list?.find((data) => data.side_data_type === type)
}

function dolbyVision(data: SideData | undefined): DolbyVision | null {
  if (data?.dv_profile === undefined) return null
  return {
    profile: Math.round(data.dv_profile),
    level: integer(data.dv_level),
    rpuPresent: data.rpu_present_flag === 1,
    elPresent: data.el_present_flag === 1,
    blPresent: data.bl_present_flag === 1,
    blCompatibilityId: integer(data.dv_bl_signal_compatibility_id),
  }
}

function contentLight(data: SideData | undefined): ContentLightLevel | null {
  if (data?.max_content === undefined || data.max_average === undefined) {
    return null
  }
  return {
    maxCll: Math.round(data.max_content),
    maxFall: Math.round(data.max_average),
  }
}

/** The stream's own bit rate, or the statistics tag Matroska muxers write. */
function streamBitRate(stream: FfprobeStream): number | null {
  if (stream.bit_rate) return Math.round(stream.bit_rate)
  const bps = Number(tag(stream, "bps") ?? tag(stream, "bps-eng"))
  return Number.isInteger(bps) && bps > 0 ? bps : null
}

function toVideo(stream: FfprobeStream, codec: string): VideoStream | null {
  if (!stream.width || !stream.height) return null
  const side = stream.side_data_list
  const dovi = dolbyVision(sideData(side, DOVI_RECORD))
  const fieldOrder = known(stream.field_order)
  const codecTag = stream.codec_tag_string
  return {
    index: stream.index,
    codec,
    // Unset tags print as "[0][0][0][0]".
    codecTag: codecTag && !codecTag.startsWith("[") ? codecTag : null,
    profile: stream.profile ?? null,
    level: integer(stream.level),
    width: Math.round(stream.width),
    height: Math.round(stream.height),
    frameRate:
      frameRate(stream.avg_frame_rate) ?? frameRate(stream.r_frame_rate),
    bitRate: streamBitRate(stream),
    pixelFormat: stream.pix_fmt ?? null,
    bitDepth: bitDepth(stream),
    colorTransfer: known(stream.color_transfer),
    colorPrimaries: known(stream.color_primaries),
    colorSpace: known(stream.color_space),
    colorRange: known(stream.color_range),
    // As Jellyfin reads it: any field order but progressive.
    interlaced: fieldOrder !== null && fieldOrder !== "progressive",
    hdr: hdrFormat(stream, dovi !== null),
    dolbyVisionProfile: dovi?.profile ?? null,
    dolbyVision: dovi,
    hdr10Plus: false,
    masteringDisplay: sideData(side, MASTERING_DISPLAY) !== undefined,
    contentLightLevel: contentLight(sideData(side, CONTENT_LIGHT)),
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

function readJson(stdout: string) {
  let json: SchemaBoundaryInput
  try {
    json = JSON.parse(stdout)
  } catch {
    throw new Error("ffprobe printed something other than JSON")
  }
  return json
}

/** The summary of ffprobe's `-show_streams -show_format` JSON. */
function readProbe(stdout: string): MediaProbe {
  const output = FfprobeOutput.parse(readJson(stdout))
  const probe: MediaProbe = {
    format: {
      name: output.format?.format_name ?? "unknown",
      durationSeconds:
        output.format?.duration && output.format.duration > 0
          ? output.format.duration
          : null,
      startSeconds: output.format?.start_time ?? null,
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

/**
 * Adds what only frames carry, from ffprobe's `-show_frames` JSON of the
 * video's first frame: HDR10+, and the HDR10 metadata of HEVC in MP4 and
 * TS, which lives in the bitstream rather than the container.
 */
function withFirstFrame(video: VideoStream, stdout: string): VideoStream {
  const [frame] = FfprobeFrames.parse(readJson(stdout)).frames
  const side = frame?.side_data_list
  return {
    ...video,
    hdr10Plus: sideData(side, HDR10_PLUS) !== undefined,
    masteringDisplay:
      video.masteringDisplay || sideData(side, MASTERING_DISPLAY) !== undefined,
    contentLightLevel:
      video.contentLightLevel ?? contentLight(sideData(side, CONTENT_LIGHT)),
  }
}

async function ffprobe(args: string[], signal?: AbortSignal): Promise<string> {
  const lines: string[] = []
  await runProcess({
    name: "ffprobe",
    command: env.MATINEE_FFPROBE_PATH,
    args: ["-v", "error", "-print_format", "json", ...args],
    timeoutMs: PROBE_TIMEOUT_MS,
    signal,
    // Background work; the server's own requests come first.
    priority: 10,
    onStdoutLine: (line) => lines.push(line),
  })
  return lines.join("\n")
}

/** Run ffprobe on a file and summarize its streams. */
export async function runFfprobe(
  path: string,
  signal?: AbortSignal,
): Promise<MediaProbe> {
  const probe = readProbe(
    await ffprobe(["-show_streams", "-show_format", path], signal),
  )
  if (!probe.video) return probe
  // A second run decodes one packet of the video stream alone; reading
  // intervals count packets of every stream.
  try {
    const frames = await ffprobe(
      [
        "-select_streams",
        String(probe.video.index),
        "-read_intervals",
        "%+#1",
        "-show_frames",
        "-show_entries",
        "frame=side_data_list",
        path,
      ],
      signal,
    )
    return { ...probe, video: withFirstFrame(probe.video, frames) }
  } catch (cause) {
    if (signal?.aborted) throw cause
    // A frame that doesn't decode leaves the stream summary as it is.
    return probe
  }
}
