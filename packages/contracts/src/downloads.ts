import { TranscodeAudioCodec } from "./preferences"
import { t } from "./schema"
import { HdrFormat } from "./streams"
import { TranscodeVideoCodec } from "./transcoding"

/*
 * Downloads, for watching offline. The file as it is comes from
 * `mediaStreamPath()`, with byte ranges. Anything else is a version of the
 * file made for the device: some of its audio tracks, each kept or
 * converted, and the video kept or encoded. `downloads.start` sets one up,
 * and the server makes it while the client fetches it, as fragmented MP4
 * in segments (see `downloadSegmentPath()`). It keeps no finished copy:
 * segments go once the client has moved past them.
 */

/** Video codecs a download can keep as they are: MP4 holds them. */
export const DOWNLOAD_COPY_VIDEO_CODECS = [
  "h264",
  "hevc",
  "av1",
  "vp9",
] as const

/** Audio codecs a download can keep as they are: MP4 holds them. */
export const DOWNLOAD_COPY_AUDIO_CODECS = [
  "aac",
  "mp3",
  "ac3",
  "eac3",
  "opus",
  "flac",
  "alac",
] as const

/** Whether a download can keep a video stream in `codec` as it is. */
export function canCopyVideo(codec: string): boolean {
  return DOWNLOAD_COPY_VIDEO_CODECS.some((entry) => entry === codec)
}

/** Whether a download can keep an audio track in `codec` as it is. */
export function canCopyAudio(codec: string): boolean {
  return DOWNLOAD_COPY_AUDIO_CODECS.some((entry) => entry === codec)
}

/** Channel counts a converted audio track can have: mono to 7.1. */
export const DOWNLOAD_AUDIO_CHANNELS = [1, 2, 6, 8] as const

/**
 * The bit rate a converted audio track gets unless the spec names one:
 * enough for each codec at that many channels.
 */
export function downloadAudioBitrate(
  codec: TranscodeAudioCodec,
  channels: number,
): number {
  const perChannel = codec === "opus" ? 64_000 : 80_000
  const floor = codec === "opus" ? 64_000 : 96_000
  return Math.min(Math.max(floor, perChannel * channels), 640_000)
}

export type DownloadVideoPreset = {
  /** The tallest the frame gets, keeping its shape. */
  height: number
  /** Bits per second the video aims for. */
  bitrate: number
}

/** The video sizes and rates download dialogs offer, largest first. */
export const DOWNLOAD_VIDEO_PRESETS: readonly DownloadVideoPreset[] = [
  { height: 2160, bitrate: 20_000_000 },
  { height: 1080, bitrate: 10_000_000 },
  { height: 1080, bitrate: 6_000_000 },
  { height: 720, bitrate: 4_000_000 },
  { height: 720, bitrate: 2_500_000 },
  { height: 480, bitrate: 1_500_000 },
  { height: 360, bitrate: 800_000 },
]

/** Stream index in the file, as `media.audio` lists it. */
const StreamIndex = t.number().int().nonnegative()

/**
 * The video of a download: kept as it is, which needs a codec from
 * `DOWNLOAD_COPY_VIDEO_CODECS`, or encoded to fit `maxHeight` (never
 * scaled up) at about `bitrate`, which a lower source rate caps.
 * `playback.options` lists the codecs this server encodes. `keepHdr`
 * keeps HDR10 or HLG in an HEVC or AV1 encode; otherwise HDR is tone
 * mapped to SDR.
 */
export const DownloadVideo = t.union([
  t.object({ mode: t.literal("copy") }),
  t.object({
    mode: t.literal("encode"),
    codec: TranscodeVideoCodec,
    maxHeight: t.number().int().min(144).max(4320),
    bitrate: t.number().int().min(200_000).max(100_000_000),
    keepHdr: t.boolean().$default(false),
  }),
])
export type DownloadVideo = t.infer<typeof DownloadVideo>

/**
 * One audio track of a download, by its index from `media.audio`: kept
 * as it is, which needs a codec from `DOWNLOAD_COPY_AUDIO_CODECS`, or
 * converted. A conversion never adds channels: a stereo track asked for
 * as 5.1 stays stereo, and more channels than `channels` are downmixed
 * the way the server's transcoding settings say. Without `bitrate`, the
 * track gets `downloadAudioBitrate()`.
 */
export const DownloadAudio = t.union([
  t.object({ index: StreamIndex, mode: t.literal("copy") }),
  t.object({
    index: StreamIndex,
    mode: t.literal("encode"),
    codec: TranscodeAudioCodec,
    channels: t.number().int().min(1).max(8),
    bitrate: t.number().int().min(32_000).max(640_000).optional(),
  }),
])
export type DownloadAudio = t.infer<typeof DownloadAudio>

/**
 * What a download holds. Audio tracks go in the order listed, and the
 * first is the default. `burnIn` draws a picture subtitle into the video,
 * by its id from `media.subtitles`, for a track whose `delivery` is `pgs`
 * or `burn-in`; it needs the video encoded. Text subtitles stay out of
 * the file: fetch them as WebVTT with `subtitlePath()`.
 */
export const DownloadSpec = t.object({
  video: DownloadVideo,
  audio: t.array(DownloadAudio).max(16),
  burnIn: t.string().min(1).max(64).nullable().$default(null),
})
export type DownloadSpec = t.infer<typeof DownloadSpec>

export const DownloadSpecInput = t.object({
  /** The media item. */
  id: t.uuid(),
  spec: DownloadSpec,
})

export const DOWNLOAD_TRACK_MODES = ["copy", "encode"] as const
export const DownloadTrackMode = t.enum(DOWNLOAD_TRACK_MODES)
export type DownloadTrackMode = t.infer<typeof DownloadTrackMode>

/** What a download will hold, as the server worked it out. */
export const DownloadPlan = t.object({
  durationSeconds: t.number(),
  /** A guess from the bit rates, for showing before it starts. */
  estimatedBytes: t.number().int(),
  /**
   * About how long each segment is. Copied video cuts at the source's
   * keyframes, so its segments vary around this.
   */
  segmentSeconds: t.number(),
  video: t.object({
    mode: DownloadTrackMode,
    /** ffmpeg's codec name, like `h264` or `hevc`. */
    codec: t.string(),
    width: t.number().int(),
    height: t.number().int(),
    /** Bits per second: the encode's aim, or the source's when it says. */
    bitrate: t.number().int().nullable(),
    /** What the download has. Null for SDR. */
    hdr: HdrFormat.nullable(),
    /** The source is HDR and the encode tone maps it to SDR. */
    toneMapped: t.boolean(),
    /** A GPU encodes the video. */
    hardware: t.boolean(),
  }),
  /** In the order of the file's tracks in the download. */
  audio: t.array(
    t.object({
      index: StreamIndex,
      /** Like `English` or `Commentary`, as `media.audio` names it. */
      label: t.string(),
      /** BCP 47 tag, like `en`. Null when the file doesn't say. */
      language: t.string().nullable(),
      mode: DownloadTrackMode,
      /** ffmpeg's codec name in the download, like `aac` or `eac3`. */
      codec: t.string(),
      channels: t.number().int().nullable(),
      /** Bits per second of a conversion. Null for a kept track. */
      bitrate: t.number().int().nullable(),
    }),
  ),
  /** The subtitle drawn into the video. */
  burnIn: t.object({ id: t.string(), label: t.string() }).nullable(),
})
export type DownloadPlan = t.infer<typeof DownloadPlan>

/** A download `downloads.start` set up. */
export const Download = t.object({
  id: t.uuid(),
  /** The media item. */
  itemId: t.uuid(),
  /** Suggested name for the saved file, ending in `.mp4`. */
  fileName: t.string(),
  plan: DownloadPlan,
  createdAt: t.date(),
})
export type Download = t.infer<typeof Download>
