import { spawn } from "node:child_process"
import { stat } from "node:fs/promises"

import {
  type AudioStream,
  type AudioTrack,
  audioFormatName,
  channelLayoutName,
  type Keyframes,
  type MediaProbe,
  PLAYBACK_QUALITIES,
  type PlaybackAudioCodec,
  type PlaybackQuality,
  TRANSCODE_VIDEO_CODECS,
  type TranscodeVideoCodec,
  type TranscodingCapabilities,
  type TranscodingSettings,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import type { MediaItemRow } from "@matinee/db"

import { env } from "../env"
import { log } from "../log"
import type { StreamPlan } from "../stats/sessions"
import { type AudioPipeline, buildAudioPipeline } from "../transcode/audio"
import { currentTranscoding } from "../transcode/capabilities"
import {
  buildVideoPipeline,
  encodeCodecFor,
  videoMapArgs,
} from "../transcode/pipeline"
import { softwareEncoderName } from "../transcode/video/encoders"
import type { VideoPipeline } from "../transcode/video/types"
import { languageTag, trackLabel } from "./language"
import { currentProbe } from "./probe"
import { runProcess } from "./process"

/*
 * Playback other than the file as it is: one audio track, copied or
 * encoded, and the video copied or encoded to a codec the player takes, as
 * fragmented MP4 on a
 * pipe. Browsers play that progressively without byte ranges, so the
 * player seeks by asking for a new start. TCP back pressure stalls ffmpeg
 * once the browser has buffered enough, which is all the throttling a pipe
 * needs.
 */

// Keyframes after the point, for `Keyframes.after`. Long GOPs are rarely
// over ten seconds.
const KEYFRAME_WINDOW_S = 20
const KEYFRAME_TIMEOUT_MS = 15_000
// Encoded keyframes, and so MP4 fragments, this many seconds apart.
const ENCODE_GOP_S = 2
const STDERR_LINES = 20

/** What ffprobe read from the file, or null when it changed or can't be read. */
export async function probeOf(item: MediaItemRow): Promise<MediaProbe | null> {
  const info = await stat(item.path).catch(() => null)
  if (!info?.isFile()) return null
  return currentProbe(item, info)
}

/** The track browsers play by themselves: the default one, else the first. */
function primaryAudio(probe: MediaProbe): AudioStream | undefined {
  return probe.audio.find((stream) => stream.default) ?? probe.audio[0]
}

export async function listAudio(item: MediaItemRow): Promise<AudioTrack[]> {
  const probe = await probeOf(item)
  if (!probe) return []
  const primary = primaryAudio(probe)
  return probe.audio.map((stream, position) => {
    const language = languageTag(stream.language ?? "")
    return {
      index: stream.index,
      label: trackLabel(language, stream.title, `Track ${position + 1}`),
      language,
      title: stream.title ?? null,
      codec: stream.codec,
      format: audioFormatName(stream.codec, stream.profile),
      channels: stream.channels,
      layout: channelLayoutName(stream.channelLayout, stream.channels),
      primary: stream === primary,
    }
  })
}

const Packets = t.object({
  packets: t
    .array(
      t.object({
        pts_time: t.coerce.number().optional().catch(undefined),
        flags: t.string().optional().catch(undefined),
      }),
    )
    .catch([]),
  format: t
    .object({ start_time: t.coerce.number().optional().catch(undefined) })
    .optional()
    .catch(undefined),
})

/**
 * The video keyframes around `seconds`. ffprobe seeks the way ffmpeg's
 * `-ss` does, to the last keyframe before the point, then reads packets
 * for a while after it. Null when the file has no video or ffprobe fails.
 */
export async function keyframesNear(
  item: MediaItemRow,
  seconds: number,
): Promise<Keyframes | null> {
  const probe = await probeOf(item)
  if (!probe?.video) return null
  const lines: string[] = []
  try {
    await runProcess({
      name: "ffprobe",
      command: env.MATINEE_FFPROBE_PATH,
      args: [
        "-v",
        "error",
        "-print_format",
        "json",
        "-select_streams",
        String(probe.video.index),
        "-read_intervals",
        `${seconds}%+${KEYFRAME_WINDOW_S}`,
        "-show_entries",
        "packet=pts_time,flags:format=start_time",
        item.path,
      ],
      timeoutMs: KEYFRAME_TIMEOUT_MS,
      onStdoutLine: (line) => lines.push(line),
    })
  } catch (cause) {
    log.warn(`Couldn't find keyframes in ${item.relativePath}`, cause)
    return null
  }
  let json
  try {
    json = JSON.parse(lines.join("\n"))
  } catch {
    return null
  }
  const output = Packets.parse(json)
  // `-ss` counts from the file's start time; packets carry absolute times.
  const offset = output.format?.start_time ?? 0
  const keyframes = output.packets
    .filter((packet) => packet.flags?.startsWith("K"))
    .flatMap((packet) =>
      packet.pts_time === undefined
        ? []
        : [Math.max(0, packet.pts_time - offset)],
    )
    .sort((a, b) => a - b)
  if (keyframes.length === 0) return null
  // A millisecond of slack for rounding in the printed times.
  const before = keyframes.findLast((time) => time <= seconds + 0.001)
  return {
    before: before ?? keyframes[0] ?? 0,
    after: keyframes.find((time) => time > seconds + 0.001) ?? null,
  }
}

/**
 * The video half of the command, or null when nothing can encode it.
 * `encode` is the pipeline when the video is encoded rather than copied.
 */
function videoArgs(
  probe: MediaProbe,
  quality: PlaybackQuality,
  start: number,
  codecs: readonly TranscodeVideoCodec[],
  {
    settings,
    capabilities,
  }: {
    settings: TranscodingSettings
    capabilities: TranscodingCapabilities
  },
): { input: string[]; output: string[]; encode: VideoPipeline | null } | null {
  const video = probe.video
  if (!video) return { input: [], output: [], encode: null }
  const preset = PLAYBACK_QUALITIES.find((entry) => entry.id === quality)
  if (!preset) {
    // Safari wants HEVC in MP4 tagged hvc1.
    const tag = video.codec === "hevc" ? ["-tag:v", "hvc1"] : []
    return {
      input: [],
      output: ["-map", `0:${video.index}`, "-c:v", "copy", ...tag],
      encode: null,
    }
  }
  try {
    const pipeline = buildVideoPipeline(
      video,
      {
        codec: encodeCodecFor(codecs, settings, capabilities),
        maxWidth: preset.width,
        maxHeight: preset.height,
        bitrate: preset.bitrate,
        segmentSeconds: ENCODE_GOP_S,
        startSeconds: start,
        keepHdr: false,
      },
      settings,
      capabilities,
    )
    return {
      input: pipeline.inputArgs,
      output: [...videoMapArgs(video.index, pipeline), ...pipeline.outputArgs],
      encode: pipeline,
    }
  } catch (cause) {
    log.warn("Couldn't build a video encode", cause)
    return null
  }
}

/** What a stream does, for statistics. `encode` is null for a copy. */
export function streamPlan(
  probe: MediaProbe,
  audio: AudioStream,
  quality: PlaybackQuality,
  encode: VideoPipeline | null,
  sound: AudioPipeline,
): StreamPlan {
  return {
    method: encode ? "transcode" : "remux",
    audioConverted: sound.encoder !== null,
    videoCodec: probe.video?.codec ?? null,
    audioCodec: audio.codec,
    videoEncoder: encode?.encoder ?? null,
    hardwareEncoding:
      encode !== null &&
      !TRANSCODE_VIDEO_CODECS.some(
        (codec) => softwareEncoderName(codec) === encode.encoder,
      ),
    hardwareDecoding: encode?.decoder != null,
    toneMapper: encode?.toneMapper ?? null,
    audioEncoder: sound.encoder,
    quality,
  }
}

export type PlaybackRequest = {
  /** Stream index of the audio track. */
  audio: number
  /** Seconds into the file. A keyframe for the `original` quality. */
  start: number
  quality: PlaybackQuality
  /** Audio codecs the player decodes in MP4. A track in one is copied. */
  audioCodecs: readonly PlaybackAudioCodec[]
  /** The codecs the player takes an encode in, the one it wants first. */
  videoCodecs: readonly TranscodeVideoCodec[]
}

/** A stream ffmpeg started. */
export type OpenedPlayback = {
  stream: ReadableStream<Uint8Array>
  plan: StreamPlan
  /** Resolves with how many seconds ffmpeg ran, once it exits. */
  finished: Promise<number>
}

/**
 * Start ffmpeg and resolve with its output once the first bytes arrive, so
 * a command that fails at once is an error rather than an empty video.
 * Null when the file has no such audio track or ffmpeg can't play it.
 * Aborting `signal` stops ffmpeg.
 */
export async function openPlayback(
  item: MediaItemRow,
  request: PlaybackRequest,
  signal: AbortSignal,
): Promise<OpenedPlayback | null> {
  const probe = await probeOf(item)
  const audio = probe?.audio.find((stream) => stream.index === request.audio)
  if (!probe || !audio) return null
  const transcoding = await currentTranscoding()
  const video = videoArgs(
    probe,
    request.quality,
    request.start,
    request.videoCodecs,
    transcoding,
  )
  if (!video) return null
  const sound = buildAudioPipeline(
    audio,
    request.audioCodecs,
    transcoding.settings,
    transcoding.capabilities,
  )
  const preset = PLAYBACK_QUALITIES.find(
    (entry) => entry.id === request.quality,
  )
  // A copy starts on the keyframe at or before `-ss`. ffmpeg seeks 3/23 s
  // early for video with B-frames, so aim past the keyframe by more than
  // that; `make_zero` then puts the keyframe at 0.
  const copy = !preset && probe.video !== null
  const seek = request.start > 0 ? request.start + (copy ? 0.2 : 0) : 0
  const plan = streamPlan(probe, audio, request.quality, video.encode, sound)

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    ...video.input,
    ...(seek > 0 ? ["-ss", seek.toFixed(3)] : []),
    "-i",
    item.path,
    ...video.output,
    "-map",
    `0:${audio.index}`,
    ...sound.args,
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-avoid_negative_ts",
    "make_zero",
    "-max_muxing_queue_size",
    "2048",
    "-f",
    "mp4",
    "-movflags",
    [
      "frag_keyframe",
      "empty_moov",
      ...(sound.delayMoov ? ["delay_moov"] : []),
      "default_base_moof",
    ].join("+"),
    "pipe:1",
  ]

  if (signal.aborted) return null
  const started = performance.now()
  const child = spawn(env.MATINEE_FFMPEG_PATH, args, {
    stdio: ["ignore", "pipe", "pipe"],
  })
  const finished = new Promise<number>((resolve) => {
    child.once("close", () => resolve((performance.now() - started) / 1000))
    // A command that never started has nothing to close.
    child.once("error", () => resolve(0))
  })
  // Set when the player went away, which is how every seek ends a stream.
  let stopped = false
  const stop = () => {
    stopped = true
    child.kill("SIGKILL")
  }
  signal.addEventListener("abort", stop, { once: true })
  const stderr: string[] = []
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr.push(...chunk.split("\n").filter((line) => line.trim()))
    stderr.splice(0, Math.max(0, stderr.length - STDERR_LINES))
  })
  child.on("error", (cause) => log.warn("Couldn't start ffmpeg", cause))
  child.once("close", (code) => {
    signal.removeEventListener("abort", stop)
    if (code !== 0 && !stopped) {
      log.warn(
        `ffmpeg stopped playing ${item.relativePath} (exit ${code}): ${stderr.join("\n")}`,
      )
    }
  })

  const stdout = child.stdout
  const first = await new Promise<Buffer | null>((resolve) => {
    const onData = (chunk: Buffer) => {
      stdout.pause()
      resolve(chunk)
    }
    stdout.once("data", onData)
    // Resolving again after the first chunk does nothing.
    const none = () => {
      stdout.off("data", onData)
      resolve(null)
    }
    stdout.once("end", none)
    child.once("close", none)
    child.once("error", none)
  })
  if (!first || stopped) {
    stop()
    return null
  }

  // Pulls from the pipe only as fast as the client reads, so ffmpeg waits
  // on a full pipe once the browser has buffered enough.
  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        controller.enqueue(first)
        stdout.on("data", (chunk: Buffer) => {
          if (stopped) return
          controller.enqueue(chunk)
          if ((controller.desiredSize ?? 0) <= 0) stdout.pause()
        })
        stdout.once("end", () => {
          if (!stopped) controller.close()
        })
        stdout.once("error", (cause) => {
          if (!stopped) controller.error(cause)
        })
      },
      pull() {
        stdout.resume()
      },
      cancel() {
        stop()
      },
    },
    { highWaterMark: 8 },
  )
  return { stream, plan, finished }
}
