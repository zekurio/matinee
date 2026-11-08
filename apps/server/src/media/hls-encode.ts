import { createHash } from "node:crypto"
import { stat } from "node:fs/promises"
import { join } from "node:path"

import {
  PLAYBACK_QUALITIES,
  type PlaybackAudioCodec,
  type PlaybackQuality,
  type PlaybackQualityPreset,
  type TranscodeVideoCodec,
  type TranscodingCapabilities,
  type VideoStream,
} from "@matinee/contracts"
import type { MediaItemRow } from "@matinee/db"

import { env } from "../env"
import { log } from "../log"
import type { StreamPlan } from "../stats/sessions"
import { buildAudioPipeline } from "../transcode/audio"
import { currentTranscoding } from "../transcode/capabilities"
import {
  buildVideoPipeline,
  encodeCodecFor,
  videoMapArgs,
} from "../transcode/pipeline"
import type { VideoPipeline, VideoTarget } from "../transcode/video/types"
import { streamPlan } from "./playback"
import { currentProbe } from "./probe"
import type { BurnInSource } from "./subtitles"

/*
 * What an HLS encode of a file is: the ffmpeg command for a run that
 * starts at any segment, and a key for its output. Everything that changes
 * the output goes into the key, so two players that would get the same
 * bytes share one encode, and a change to the file or the settings starts
 * a new one.
 */

/**
 * The HLS segment length, as Jellyfin uses now. A player waits for a whole
 * segment before the first frame, and after a seek decodes from the
 * segment's start up to the point, so shorter segments start sooner.
 */
export const HLS_SEGMENT_S = 3
// A last segment shorter than this share of one is left out, since ffmpeg
// may not write it.
const SHORT_TAIL = 0.05
// Bump when the command changes in a way the arguments don't show.
const FORMAT_VERSION = 1
// FFmpeg 5 renamed -hls_ts_options.
const SEGMENT_OPTIONS_MAJOR = 5

export type HlsRequest = {
  /** Stream index of the audio track. */
  audio: number
  quality: PlaybackQuality
  /** Audio codecs the player decodes in MP4. A track in one is copied. */
  audioCodecs: readonly PlaybackAudioCodec[]
  /** The codecs the player takes the video in, the one it wants first. */
  videoCodecs: readonly TranscodeVideoCodec[]
  /** A picture subtitle to burn into the video. */
  subtitle: BurnInSource | null
}

export type EncodeSpec = {
  /** Names the encode's directory and appears in its URLs. */
  key: string
  itemId: string
  relativePath: string
  /** Every segment but the last is this long, and starts on a keyframe. */
  segmentSeconds: number
  segmentCount: number
  durationSeconds: number
  plan: StreamPlan
  /** ffmpeg can pause on `p` and resume on `u`, read from stdin. */
  pauseKeys: boolean
  /** The ffmpeg arguments for a run from segment `start`, writing to `dir`. */
  args: (start: number, dir: string) => string[]
}

function videoTarget(
  codec: TranscodeVideoCodec,
  quality: PlaybackQualityPreset,
  segmentSeconds: number,
  startSeconds: number,
  burnIn: string | undefined,
): VideoTarget {
  return {
    codec,
    maxWidth: quality.width,
    maxHeight: quality.height,
    bitrate: quality.bitrate,
    segmentSeconds,
    startSeconds,
    keepHdr: false,
    burnIn,
  }
}

function pipelineArgs(video: VideoStream, pipeline: VideoPipeline): string[] {
  return [...videoMapArgs(video.index, pipeline), ...pipeline.outputArgs]
}

/**
 * A subtitle file to burn in, as the second input. `-copyts -start_at_zero`
 * moves every input back by its own start time, which for a subtitle file
 * is its first picture; moving it forward again keeps the pictures on the
 * video's timeline.
 */
export function subtitleInputArgs(source: BurnInSource | null): string[] {
  if (source?.kind !== "file") return []
  const offset =
    source.startSeconds > 0
      ? ["-itsoffset", source.startSeconds.toFixed(6)]
      : []
  return [...offset, "-i", source.path]
}

/**
 * The subtitle for the filter graph: a stream of the file, or the first
 * subtitle stream of the second input.
 */
export function subtitleStream(
  source: BurnInSource | null,
): string | undefined {
  if (!source) return undefined
  return source.kind === "stream" ? `0:${source.index}` : "1:s:0"
}

export function segmentOptionsFlag(
  capabilities: TranscodingCapabilities,
): string {
  const major = capabilities.versionNumbers?.[0]
  return major !== undefined && major < SEGMENT_OPTIONS_MAJOR
    ? "-hls_ts_options"
    : "-hls_segment_options"
}

/**
 * The encode for `request`, or null when the file can't be encoded that
 * way: no such audio track, no video, no known duration, the `original`
 * quality, or nothing to encode with.
 */
export async function encodeSpec(
  item: MediaItemRow,
  request: HlsRequest,
): Promise<EncodeSpec | null> {
  const quality = PLAYBACK_QUALITIES.find(
    (entry) => entry.id === request.quality,
  )
  if (!quality) return null
  const info = await stat(item.path).catch(() => null)
  if (!info?.isFile()) return null
  const probe = await currentProbe(item, info)
  const video = probe?.video
  const audio = probe?.audio.find((stream) => stream.index === request.audio)
  const duration = probe?.format.durationSeconds ?? null
  if (!probe || !video || !audio || !duration || duration <= 0) return null

  const { settings, capabilities } = await currentTranscoding()
  const burnIn = subtitleStream(request.subtitle)
  const codec = encodeCodecFor(request.videoCodecs, settings, capabilities)
  const build = (segmentSeconds: number, startSeconds: number) =>
    buildVideoPipeline(
      video,
      videoTarget(codec, quality, segmentSeconds, startSeconds, burnIn),
      settings,
      capabilities,
    )
  let template: VideoPipeline
  try {
    // The encoder decides how far apart its keyframes can be; build again
    // with that, so every run starts on a segment boundary.
    const segmentSeconds = build(HLS_SEGMENT_S, 0).keyframeSeconds
    template = build(segmentSeconds, 0)
  } catch (cause) {
    log.warn("Couldn't build a video encode", cause)
    return null
  }
  const segmentSeconds = template.keyframeSeconds
  const sound = buildAudioPipeline(
    audio,
    request.audioCodecs,
    settings,
    capabilities,
  )
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        version: FORMAT_VERSION,
        ffmpeg: env.MATINEE_FFMPEG_PATH,
        path: item.path,
        size: info.size,
        modified: info.mtimeMs,
        segmentSeconds,
        input: template.inputArgs,
        video: pipelineArgs(video, template),
        audio: [audio.index, ...sound.args],
        subtitle: request.subtitle,
      }),
    )
    .digest("hex")
    .slice(0, 32)

  const pauseKeys = capabilities.features.pauseKeys
  // A quarter frame early, so rounding never drops the boundary's frame.
  const slack = 0.25 / (video.frameRate || 25)
  const args = (start: number, dir: string) => {
    const startSeconds = start * segmentSeconds
    const pipeline =
      start === 0 ? template : build(segmentSeconds, startSeconds)
    const seek = Math.max(0, startSeconds - slack)
    return [
      "-hide_banner",
      "-loglevel",
      "error",
      // Throttling pauses and resumes ffmpeg through stdin.
      ...(pauseKeys ? [] : ["-nostdin"]),
      ...pipeline.inputArgs,
      ...(seek > 0 ? ["-ss", seek.toFixed(6)] : []),
      "-i",
      item.path,
      ...subtitleInputArgs(request.subtitle),
      ...pipelineArgs(video, pipeline),
      "-map",
      `0:${audio.index}`,
      ...sound.args,
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      // Segments keep the file's times, so runs that start in different
      // places fit together.
      "-copyts",
      "-start_at_zero",
      "-avoid_negative_ts",
      "disabled",
      "-max_muxing_queue_size",
      "2048",
      "-f",
      "hls",
      "-max_delay",
      "5000000",
      // The nominal length: the muxer cuts at the first keyframe past each
      // multiple of it, which is the boundary.
      "-hls_time",
      String(HLS_SEGMENT_S),
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      `init-${start}.mp4`,
      "-start_number",
      String(start),
      "-hls_segment_filename",
      join(dir, "%d.m4s"),
      // A segment appears under its name only once it is complete.
      "-hls_flags",
      "temp_file",
      // Rewritten after every segment, so the server sees what's done.
      "-hls_playlist_type",
      "event",
      "-hls_list_size",
      "0",
      // Jellyfin: frag_discont writes the audio's initial delay into the
      // segments, and HLS needs no sidx.
      segmentOptionsFlag(capabilities),
      "movflags=+frag_discont+skip_sidx",
      "-y",
      join(dir, `run-${start}.m3u8`),
    ]
  }

  return {
    key,
    itemId: item.id,
    relativePath: item.relativePath,
    segmentSeconds,
    segmentCount: Math.max(
      1,
      Math.ceil(duration / segmentSeconds - SHORT_TAIL),
    ),
    durationSeconds: duration,
    plan: streamPlan(probe, audio, request.quality, template, sound),
    pauseKeys,
    args,
  }
}
