import type { DownloadVideoPreset } from "./download-presets"
export { DownloadVideoPreset } from "./download-presets"

import { TranscodeAudioCodec } from "./preferences"
import { t } from "./schema"
import { HdrFormat } from "./streams"
import { TranscodeVideoCodec } from "./transcoding"

/*
 * Downloads, for watching offline. The file as it is comes from
 * `mediaStreamPath()`, with byte ranges. Anything else is a custom
 * version of the file: some of its audio tracks, each kept or converted,
 * the video kept or encoded, and subtitles inside it. `downloads.start`
 * sets one up, and the server makes it while the client fetches it. It
 * keeps no finished copy.
 *
 * An MP4 download comes as fragmented MP4 in segments, which a client can
 * resume (see `downloadSegmentPath()`), or as one stream. A Matroska one
 * only comes as one stream from `downloadFilePath()`, which can't resume,
 * but it holds anything the file does as it is: any codec, picture
 * subtitles, ASS with its fonts, and chapters.
 */

export const DOWNLOAD_CONTAINERS = ["mkv", "mp4"] as const
export const DownloadContainer = t.enum(DOWNLOAD_CONTAINERS)
export type DownloadContainer = t.infer<typeof DownloadContainer>

/** Video codecs an MP4 download can keep as they are. Matroska keeps any. */
export const DOWNLOAD_COPY_VIDEO_CODECS = [
  "h264",
  "hevc",
  "av1",
  "vp9",
] as const

/** Audio codecs an MP4 download can keep as they are. Matroska keeps any. */
export const DOWNLOAD_COPY_AUDIO_CODECS = [
  "aac",
  "mp3",
  "ac3",
  "eac3",
  "opus",
  "flac",
  "alac",
] as const

/** Whether an MP4 download can keep a video stream in `codec` as it is. */
export function canCopyVideo(codec: string): boolean {
  return DOWNLOAD_COPY_VIDEO_CODECS.some((entry) => entry === codec)
}

/** Whether an MP4 download can keep an audio track in `codec` as it is. */
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
 * The video of a download: kept as it is, which in MP4 needs a codec from
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
 * as it is, which in MP4 needs a codec from `DOWNLOAD_COPY_AUDIO_CODECS`, or
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

/** A subtitle track's id, as `media.subtitles` lists it. */
const SubtitleId = t.string().min(1).max(64)

/**
 * What a download holds. Audio tracks go in the order listed, and the
 * first is the default. `subtitles` puts subtitles in the file by their
 * ids from `media.subtitles`, in the order listed, none of them on by
 * default but forced ones marked so. Matroska takes any track with a
 * `delivery`, as it is; MP4 only text, a `webvtt` track, as timed text
 * (`tx3g`). `burnIn` draws a picture subtitle into the video instead, for
 * a track whose `delivery` is `pgs` or `burn-in`; it needs the video
 * encoded.
 */
export const DownloadSpec = t.object({
  container: DownloadContainer.$default("mp4"),
  video: DownloadVideo,
  audio: t.array(DownloadAudio).max(16),
  subtitles: t.array(SubtitleId).max(32).$default([]),
  burnIn: SubtitleId.nullable().$default(null),
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
  container: DownloadContainer.$default("mp4"),
  durationSeconds: t.number(),
  /** A guess from the bit rates, for showing before it starts. */
  estimatedBytes: t.number().int().int64(),
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
    bitrate: t.number().int().int64().nullable(),
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
  /** The text subtitles in the file, in order. Older plans lack them. */
  subtitles: t
    .array(
      t.object({
        id: t.string(),
        label: t.string(),
        /** BCP 47 tag, like `en`. Null when the track doesn't say. */
        language: t.string().nullable(),
      }),
    )
    .$default([]),
  /** The subtitle drawn into the video. */
  burnIn: t.object({ id: t.string(), label: t.string() }).nullable(),
})
export type DownloadPlan = t.infer<typeof DownloadPlan>

/** A download `downloads.start` set up. */
export const Download = t.object({
  id: t.uuid(),
  /** The media item. */
  itemId: t.uuid(),
  /** Suggested name for the saved file, ending in `.mkv` or `.mp4`. */
  fileName: t.string(),
  plan: DownloadPlan,
  createdAt: t.date(),
})
export type Download = t.infer<typeof Download>
