import { createHash } from "node:crypto"
import { stat } from "node:fs/promises"
import { basename, extname, join } from "node:path"

import {
  type AudioStream,
  audioFormatName,
  canCopyAudio,
  canCopyVideo,
  type DownloadContainer,
  type DownloadPlan,
  type DownloadSpec,
  type HdrFormat,
  type MediaProbe,
  type SubtitleTrack,
  type VideoStream,
  videoCodecName,
} from "@matinee/contracts"
import type { MediaItemRow } from "@matinee/db"

import { env } from "../env"
import { log } from "../log"
import { buildDownloadAudio, encodableAudioCodecs } from "../transcode/audio"
import { currentTranscoding } from "../transcode/capabilities"
import {
  buildVideoPipeline,
  encodableVideoCodecs,
  videoMapArgs,
} from "../transcode/pipeline"
import { softwareEncoderName } from "../transcode/video/encoders"
import type { VideoPipeline } from "../transcode/video/types"
import type { AudioResume, ResumeTrack } from "./download-resume"
import { titleOf } from "./download-text"
import {
  segmentOptionsFlag,
  subtitleInputArgs,
  subtitleStream,
} from "./hls-encode"
import { iso639_2, languageTag, trackLabel } from "./language"
import { currentProbe } from "./probe"
import {
  type BurnInSource,
  burnInSource,
  listSubtitles,
  muxSource,
} from "./subtitles"

/*
 * What a download of a file is: the plan a dialog shows, and the ffmpeg
 * command for a run that writes its segments from any one on. The output
 * is HLS's fragmented MP4, so the init segment and the segments, appended,
 * are one MP4 file. Everything that changes the output goes into a key,
 * so a download that resumes after the file or the settings changed
 * knows to start over.
 */

/**
 * Seconds per segment. Longer than playback's, since nobody waits for the
 * first frame: fewer requests, and less lost when one breaks off.
 */
export const DOWNLOAD_SEGMENT_S = 6
// Bump when the command changes in a way the arguments don't show.
const FORMAT_VERSION = 1
// MP4 headers and fragment boxes, on top of the streams.
const CONTAINER_OVERHEAD = 1.02
// ffmpeg seeks 3/23 s early in video with B-frames; aim past the keyframe
// by more, as playback does, so a copy starts on it.
const COPY_SEEK_PAST_S = 0.2

/** A spec the file can't be downloaded with, and what to tell the user. */
export class DownloadSpecError extends Error {
  override name = "DownloadSpecError"
}

export type DownloadBuild = {
  /** Names the output: same key, same bytes. */
  key: string
  plan: DownloadPlan
  /** The video is copied, so segments cut at the source's keyframes. */
  copyVideo: boolean
  /** Every segment of an encode starts on a multiple of this. */
  segmentSeconds: number
  /** ffmpeg can pause on `p` and resume on `u`, read from stdin. */
  pauseKeys: boolean
  /** The audio tracks, for picking them up again after a break. */
  audio: ResumeTrack[]
  /** The text subtitles that go in an MP4, in order; see `download-text.ts`. */
  text: SubtitleTrack[]
  /**
   * For Matroska, the ffmpeg arguments of its one run, which writes the
   * whole file to stdout. Null for MP4.
   */
  matroska: (() => Promise<string[]>) | null
  /**
   * The ffmpeg arguments for a run that writes segment `segment` on into
   * `dir`, starting `seconds` into the file. For an encode, `seconds` is
   * `segment * segmentSeconds`; for a copy, the keyframe that segment
   * starts on. `resume` takes the audio up where the segment before ended.
   */
  args: (
    segment: number,
    seconds: number,
    dir: string,
    resume: AudioResume | null,
  ) => string[]
}

/** The video's bit rate, or what's left of the file's for it. */
function videoBitrate(
  video: VideoStream,
  fileBitrate: number,
  audio: readonly AudioStream[],
): number {
  if (video.bitRate) return video.bitRate
  const sound = audio.reduce((sum, stream) => sum + nominalBitrate(stream), 0)
  return Math.max(fileBitrate - sound, fileBitrate / 2)
}

/**
 * About what a track takes, for guessing a download's size: probes rarely
 * give audio rates, so these are common rates of each codec.
 */
function nominalBitrate(stream: AudioStream): number {
  const channels = stream.channels ?? 2
  const surround = channels > 2
  const profile = stream.profile ?? ""
  switch (stream.codec) {
    case "truehd":
    case "mlp":
      return surround ? 3_000_000 : 1_500_000
    case "dts":
      if (/MA|HRA|HD/.test(profile)) return 3_000_000
      return surround ? 1_509_000 : 768_000
    case "flac":
    case "alac":
      return 350_000 * channels
    case "eac3":
      return surround ? 640_000 : 224_000
    case "ac3":
      return surround ? 448_000 : 192_000
    case "mp3":
      return 192_000
    case "aac":
    case "opus":
    case "vorbis":
      return 64_000 * channels
    default:
      return stream.codec.startsWith("pcm_")
        ? 768_000 * channels
        : 128_000 * channels
  }
}

/**
 * A kept track's share of what the file's bit rate leaves after the
 * video, in the proportions `nominalBitrate` gives.
 */
function keptAudioBitrate(
  stream: AudioStream,
  all: readonly AudioStream[],
  fileBitrate: number,
  video: VideoStream,
): number {
  const nominal = nominalBitrate(stream)
  if (!video.bitRate) return nominal
  const total = all.reduce((sum, entry) => sum + nominalBitrate(entry), 0)
  const left = fileBitrate - video.bitRate
  return left > 0 && total > 0 ? (nominal / total) * left : nominal
}

function hdrOf(video: VideoStream): HdrFormat {
  return video.hdr === "hlg" || video.colorTransfer === "arib-std-b67"
    ? "hlg"
    : "hdr10"
}

/** The most `-strict` allows that any part of the command needs. */
function strictArgs(needs: readonly string[][]): string[] {
  const levels = needs.flatMap((args) =>
    args[0] === "-strict" && args[1] ? [args[1]] : [],
  )
  if (levels.includes("-2")) return ["-strict", "-2"]
  if (levels.includes("unofficial")) return ["-strict", "unofficial"]
  return []
}

type VideoPart =
  | { mode: "copy"; video: VideoStream }
  | {
      mode: "encode"
      template: VideoPipeline
      build: (seconds: number) => VideoPipeline
    }

function copyArgs(video: VideoStream): string[] {
  return [
    "-map",
    `0:${video.index}`,
    "-c:v",
    "copy",
    // Safari and Apple's players want HEVC in MP4 tagged hvc1.
    ...(video.codec === "hevc" ? ["-tag:v", "hvc1"] : []),
  ]
}

/**
 * What a download of `item` with `spec` holds and how to make it. Throws
 * a `DownloadSpecError` when the file can't be downloaded that way.
 */
export async function buildDownload(
  item: MediaItemRow,
  spec: DownloadSpec,
): Promise<DownloadBuild> {
  const info = await stat(item.path).catch(() => null)
  const probe: MediaProbe | null = info?.isFile()
    ? await currentProbe(item, info)
    : null
  if (!info || !probe) {
    throw new DownloadSpecError(
      "This file can't be read. Try again once the server has scanned it.",
    )
  }
  const video = probe.video
  if (!video) {
    throw new DownloadSpecError("Only videos can be downloaded this way.")
  }
  const duration = probe.format.durationSeconds
  if (!duration || duration <= 0) {
    throw new DownloadSpecError(
      "The server doesn't know how long this video is, so it can't make a download of it.",
    )
  }
  const { settings, capabilities } = await currentTranscoding()
  const matroska = spec.container === "mkv"
  const fileBitrate =
    probe.format.bitRate ?? Math.round((info.size * 8) / duration)

  // Audio first: its errors name a track, and are the likelier ones.
  const seen = new Set<number>()
  const audio = spec.audio.map((choice, output) => {
    const position = probe.audio.findIndex((s) => s.index === choice.index)
    const stream = probe.audio[position]
    if (!stream) {
      throw new DownloadSpecError(
        `This file has no audio track ${choice.index}.`,
      )
    }
    if (seen.has(choice.index)) {
      throw new DownloadSpecError("Pick each audio track once.")
    }
    seen.add(choice.index)
    if (choice.mode === "copy" && !matroska && !canCopyAudio(stream.codec)) {
      throw new DownloadSpecError(
        `${audioFormatName(stream.codec, stream.profile)} audio can't go in an MP4 file as it is. Convert that track instead.`,
      )
    }
    if (
      choice.mode === "encode" &&
      !encodableAudioCodecs(capabilities).includes(choice.codec)
    ) {
      throw new DownloadSpecError(
        `This server can't encode ${audioFormatName(choice.codec)} audio.`,
      )
    }
    const pipeline = buildDownloadAudio(
      stream,
      choice,
      output,
      settings,
      capabilities,
    )
    const language = languageTag(stream.language ?? "")
    return {
      stream,
      pipeline,
      resume: {
        source: stream.index,
        copy: pipeline.encoder === null,
        encoderArgs: buildDownloadAudio(
          stream,
          choice,
          0,
          settings,
          capabilities,
        ).args,
        channels: pipeline.channels ?? 2,
        filters: pipeline.filters,
        resamples: pipeline.resamples,
      } satisfies ResumeTrack,
      label: trackLabel(language, stream.title, `Track ${position + 1}`),
      language,
      bitrate:
        pipeline.bitrate ??
        keptAudioBitrate(stream, probe.audio, fileBitrate, video),
    }
  })

  const listed =
    spec.subtitles.length > 0 ? (await listSubtitles(item)).tracks : []
  // Matroska takes any track something can show; MP4 only text.
  const subtitles = spec.subtitles.map((id) => {
    const track = listed.find((entry) => entry.id === id)
    if (!track || track.delivery === null) {
      throw new DownloadSpecError("This file has no subtitle with that id.")
    }
    if (!matroska && track.delivery !== "webvtt") {
      throw new DownloadSpecError(
        "Only text subtitles go in an MP4 file. Burn this one in, or download a Matroska file.",
      )
    }
    return track
  })
  const text = matroska ? [] : subtitles
  if (new Set(spec.subtitles).size < spec.subtitles.length) {
    throw new DownloadSpecError("Pick each subtitle track once.")
  }

  let burnIn: BurnInSource | null = null
  let burnInLabel: string | null = null
  if (spec.burnIn) {
    if (spec.video.mode === "copy") {
      throw new DownloadSpecError(
        "Burning in subtitles needs the video converted.",
      )
    }
    burnIn = await burnInSource(item, spec.burnIn)
    const track = burnIn
      ? (await listSubtitles(item)).tracks.find(
          (entry) => entry.id === spec.burnIn,
        )
      : undefined
    if (!burnIn || !track) {
      throw new DownloadSpecError(
        "This file has no picture subtitle with that id.",
      )
    }
    burnInLabel = track.label
  }

  let part: VideoPart
  let segmentSeconds = DOWNLOAD_SEGMENT_S
  let videoPlan: DownloadPlan["video"]
  const sourceRate = videoBitrate(video, fileBitrate, probe.audio)
  if (spec.video.mode === "copy") {
    if (!matroska && !canCopyVideo(video.codec)) {
      throw new DownloadSpecError(
        `${videoCodecName(video.codec)} video can't go in an MP4 file as it is. Convert the video instead.`,
      )
    }
    part = { mode: "copy", video }
    videoPlan = {
      mode: "copy",
      codec: video.codec,
      width: video.width,
      height: video.height,
      bitrate: video.bitRate,
      hdr: video.hdr,
      toneMapped: false,
      hardware: false,
    }
  } else {
    const wanted = spec.video
    if (!encodableVideoCodecs(settings, capabilities).includes(wanted.codec)) {
      throw new DownloadSpecError(
        `This server can't encode ${videoCodecName(wanted.codec)}.`,
      )
    }
    // An encode above the source's rate only spends space.
    const bitrate = Math.round(Math.min(wanted.bitrate, sourceRate))
    const overlay = subtitleStream(burnIn)
    const build = (segmentLength: number, seconds: number) =>
      buildVideoPipeline(
        video,
        {
          codec: wanted.codec,
          maxWidth: Math.round((wanted.maxHeight * 16) / 9 / 2) * 2,
          maxHeight: wanted.maxHeight,
          bitrate,
          segmentSeconds: segmentLength,
          startSeconds: seconds,
          keepHdr: wanted.keepHdr,
          burnIn: overlay,
        },
        settings,
        capabilities,
      )
    let template: VideoPipeline
    try {
      // The encoder decides how far apart its keyframes can be; build
      // again with that, so every run starts on a segment boundary.
      segmentSeconds = build(DOWNLOAD_SEGMENT_S, 0).keyframeSeconds
      template = build(segmentSeconds, 0)
    } catch (cause) {
      log.warn("Couldn't build a download's video encode", cause)
      throw new DownloadSpecError(
        "The server can't encode this video with its transcoding settings.",
      )
    }
    const seconds = segmentSeconds
    part = {
      mode: "encode",
      template,
      build: (start) => (start === 0 ? template : build(seconds, start)),
    }
    videoPlan = {
      mode: "encode",
      codec: wanted.codec,
      width: template.width,
      height: template.height,
      bitrate,
      hdr: template.hdr ? hdrOf(video) : null,
      toneMapped: video.hdr !== null && !template.hdr,
      hardware: template.encoder !== softwareEncoderName(wanted.codec),
    }
  }

  const pauseKeys = capabilities.features.pauseKeys
  const strict = strictArgs([
    ...audio.map((track) => track.pipeline.global),
    // Dolby Vision's configuration box in MP4 isn't in the standard.
    part.mode === "copy" && video.dolbyVision ? ["-strict", "unofficial"] : [],
  ])
  // A quarter frame early, so rounding never drops the boundary's frame.
  const slack = 0.25 / (video.frameRate || 25)

  const args = (
    segment: number,
    seconds: number,
    dir: string,
    resume: AudioResume | null,
  ) => {
    const input: string[] = []
    let output: string[]
    if (part.mode === "copy") {
      // Decoded audio starts where the copied video does, on the
      // keyframe, rather than at the seek point after it, so it joins the
      // segments before without a gap.
      input.push("-noaccurate_seek")
      if (seconds > 0) {
        input.push("-ss", (seconds + COPY_SEEK_PAST_S).toFixed(6))
      }
      output = copyArgs(part.video)
    } else {
      const pipeline = part.build(seconds)
      input.push(...pipeline.inputArgs)
      const seek = Math.max(0, seconds - slack)
      if (seek > 0) input.push("-ss", seek.toFixed(6))
      output = [...videoMapArgs(video.index, pipeline), ...pipeline.outputArgs]
    }
    const subtitleInput =
      part.mode === "encode" ? subtitleInputArgs(burnIn) : []
    // After the file and a subtitle file, if there is one.
    const audioInput = resume ? (subtitleInput.length > 0 ? 2 : 1) : 0
    return [
      "-hide_banner",
      "-loglevel",
      "error",
      // Throttling pauses and resumes ffmpeg through stdin.
      ...(pauseKeys ? [] : ["-nostdin"]),
      ...input,
      "-i",
      item.path,
      ...subtitleInput,
      ...(resume?.input ?? []),
      ...output,
      ...audio.flatMap((track, i) => {
        const around = resume?.tracks[i]
        const filters = [
          ...(around?.before ?? []),
          ...track.pipeline.filters,
          ...(around?.after ?? []),
        ]
        return [
          "-map",
          `${audioInput}:${track.stream.index}`,
          ...track.pipeline.args,
          ...(filters.length > 0 ? [`-filter:a:${i}`, filters.join(",")] : []),
          ...(around ? [`-bsf:a:${i}`, around.bsf] : []),
          `-disposition:a:${i}`,
          i === 0 ? "default" : "0",
          // Global metadata stays out, and the tracks' with it, so players
          // get their names back from these.
          ...(track.stream.language
            ? [`-metadata:s:a:${i}`, `language=${track.stream.language}`]
            : []),
          ...(track.stream.title
            ? [`-metadata:s:a:${i}`, `title=${track.stream.title}`]
            : []),
        ]
      }),
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      ...strict,
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
      // The muxer cuts at the first keyframe past each multiple of it:
      // the boundary for an encode, the next source keyframe for a copy.
      "-hls_time",
      String(segmentSeconds),
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      `init-${segment}.mp4`,
      "-start_number",
      String(segment),
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
      segmentOptionsFlag(capabilities),
      "movflags=+frag_discont+skip_sidx",
      "-y",
      join(dir, `run-${segment}.m3u8`),
    ]
  }

  const matroskaArgs = async (): Promise<string[]> => {
    const sources = await Promise.all(
      subtitles.map(async (track) => {
        const source = await muxSource(item, track.id)
        if (!source) {
          throw new DownloadSpecError(`Subtitles ${track.label} can't be read.`)
        }
        return { track, source }
      }),
    )
    const input: string[] = []
    let videoOutput: string[]
    if (part.mode === "copy") {
      // Matroska names codecs its own way; MP4's tags don't apply.
      videoOutput = ["-map", `0:${video.index}`, "-c:v", "copy"]
    } else {
      const pipeline = part.build(0)
      input.push(...pipeline.inputArgs)
      videoOutput = [
        ...videoMapArgs(video.index, pipeline),
        ...pipeline.outputArgs,
      ]
    }
    const burnInput = part.mode === "encode" ? subtitleInputArgs(burnIn) : []
    // After the file and a subtitle file to burn in, if there is one.
    let nextInput = burnInput.length > 0 ? 2 : 1
    const subtitleInputs = sources.flatMap(({ source }) =>
      source.kind === "file"
        ? [
            ...(source.charset ? ["-sub_charenc", source.charset] : []),
            // `-start_at_zero` moves every input to 0; this undoes it.
            ...(source.startSeconds > 0
              ? ["-itsoffset", source.startSeconds.toFixed(6)]
              : []),
            "-i",
            source.path,
          ]
        : [],
    )
    const subtitleOutput = sources.flatMap(({ track, source }, i) => {
      const from =
        source.kind === "stream" ? `0:${source.index}` : `${nextInput++}:s:0`
      const language = track.language ? iso639_2(track.language) : null
      return [
        "-map",
        from,
        `-c:s:${i}`,
        // Matroska has no place for MP4's timed text.
        source.kind === "stream" && source.codec === "mov_text"
          ? "srt"
          : "copy",
        `-metadata:s:s:${i}`,
        `title=${titleOf(track)}`,
        ...(language ? [`-metadata:s:s:${i}`, `language=${language}`] : []),
        // None shows until someone picks it, but players find forced ones.
        `-disposition:s:${i}`,
        track.forced ? "forced" : "0",
      ]
    })
    // ASS draws with the fonts the file carries.
    const fonts = sources.some(
      ({ source }) =>
        source.kind === "stream" &&
        (source.codec === "ass" || source.codec === "ssa"),
    )
    return [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      ...input,
      "-i",
      item.path,
      ...burnInput,
      ...subtitleInputs,
      ...videoOutput,
      ...audio.flatMap((track, i) => [
        "-map",
        `0:${track.stream.index}`,
        ...track.pipeline.args,
        ...(track.pipeline.filters.length > 0
          ? [`-filter:a:${i}`, track.pipeline.filters.join(",")]
          : []),
        `-disposition:a:${i}`,
        i === 0 ? "default" : "0",
        ...(track.stream.language
          ? [`-metadata:s:a:${i}`, `language=${track.stream.language}`]
          : []),
        ...(track.stream.title
          ? [`-metadata:s:a:${i}`, `title=${track.stream.title}`]
          : []),
      ]),
      ...subtitleOutput,
      ...(fonts ? ["-map", "0:t?", "-c:t", "copy"] : []),
      // The file's own tags go, but streams keep theirs: the fonts need
      // their names, and the tracks their titles.
      "-map_metadata:g",
      "-1",
      ...(part.mode === "encode" ? ["-metadata:s:v:0", "title="] : []),
      "-map_chapters",
      "0",
      // The header says how long the file is: written as a stream, it
      // can't be filled in at the end.
      "-metadata:s:v:0",
      `DURATION=${durationTag(duration)}`,
      ...strictArgs(audio.map((track) => track.pipeline.global)),
      "-copyts",
      "-start_at_zero",
      "-max_muxing_queue_size",
      "2048",
      "-f",
      "matroska",
      "pipe:1",
    ]
  }

  const key = createHash("sha256")
    .update(
      JSON.stringify({
        version: FORMAT_VERSION,
        ffmpeg: env.MATINEE_FFMPEG_PATH,
        ffmpegVersion: capabilities.version,
        path: item.path,
        size: info.size,
        modified: info.mtimeMs,
        burnIn,
        // Left out when undefined, so downloads from before keep their key.
        text: spec.subtitles.length > 0 ? spec.subtitles : undefined,
        container: matroska ? "mkv" : undefined,
        command: args(0, 0, "dir", null),
      }),
    )
    .digest("hex")
    .slice(0, 32)

  const rates =
    (videoPlan.mode === "copy" ? sourceRate : (videoPlan.bitrate ?? 0)) +
    audio.reduce((sum, track) => sum + track.bitrate, 0)
  return {
    key,
    copyVideo: part.mode === "copy",
    segmentSeconds,
    pauseKeys,
    audio: audio.map((track) => track.resume),
    text,
    matroska: matroska ? matroskaArgs : null,
    args,
    plan: {
      container: spec.container,
      durationSeconds: duration,
      estimatedBytes: Math.round(((rates * duration) / 8) * CONTAINER_OVERHEAD),
      segmentSeconds,
      video: videoPlan,
      audio: audio.map((track) => ({
        index: track.stream.index,
        label: track.label,
        language: track.language,
        mode: track.pipeline.encoder ? "encode" : "copy",
        codec: track.pipeline.codec,
        channels: track.pipeline.channels,
        bitrate: track.pipeline.bitrate,
      })),
      subtitles: text.map((track) => ({
        id: track.id,
        label: track.label,
        language: track.language,
      })),
      burnIn:
        spec.burnIn && burnInLabel
          ? { id: spec.burnIn, label: burnInLabel }
          : null,
    },
  }
}

/** The name a download saves under: the file's own, in its container. */
export function downloadFileName(
  item: MediaItemRow,
  container: DownloadContainer,
): string {
  const name = basename(item.relativePath, extname(item.relativePath))
  return `${name || "video"}.${container}`
}

/** Seconds as Matroska's `DURATION` tags write them, like `00:23:59.980000000`. */
function durationTag(seconds: number): string {
  const whole = Math.floor(seconds)
  const pad = (value: number) => String(value).padStart(2, "0")
  const fraction = (seconds - whole).toFixed(9).slice(2)
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}.${fraction}`
}
