import { DownloadVideoPreset } from "./download-presets"
import { DownloadContainer, DownloadPlan, DownloadSpec } from "./downloads"
import { PlaybackDevice } from "./playback-start"
import { TranscodeAudioCodec } from "./preferences"
import { t } from "./schema"
import { AudioTrack, SubtitleTrack } from "./streams"
import { TranscodeVideoCodec } from "./transcoding"

/** Wishes shared by every file in a download selection. */
export const DownloadWishes = t.object({
  /** The saved file's container. Matroska also allows archival copies. */
  container: DownloadContainer.$default("mp4"),
  /** Null keeps video when possible, otherwise uses the first fitting 1080p preset. */
  preset: DownloadVideoPreset.extend({
    height: t.number().int().min(144).max(4320),
    bitrate: t.number().int().min(200_000).max(100_000_000),
  })
    .nullable()
    .$default(null),
  /** Null uses the first codec in the device's encode preference order. */
  codec: TranscodeVideoCodec.nullable().$default(null),
  /** Keep HDR in an HEVC or AV1 encode when requested. */
  keepHdr: t.boolean().$default(false),
  /** Preferred playback audio, every track, or no audio. Explicit indices belong in audioIndices. */
  audio: t.enum(["preferred", "all", "none", "selected"]).$default("preferred"),
  /** Track indices for selected audio, in saved order. These apply to each file separately. */
  audioIndices: t.array(t.number().int().nonnegative()).max(16).$default([]),
  /** Used means the subtitle and preferred audio languages, capped at eight tracks. */
  subtitles: t.enum(["used", "all", "none"]).$default("used"),
})
export type DownloadWishes = t.infer<typeof DownloadWishes>

/** Choices a download form can render without deriving container or decoder rules. */
export const DownloadChoices = t.object({
  /** Whether this container can keep the source video for this device. */
  keepsVideo: t.boolean(),
  /** Fitting presets, largest first. The smallest is offered even for tiny video. Empty when `codecs` is. */
  presets: t.array(DownloadVideoPreset),
  /** Available encode codecs, in device preference order for MP4 and server order for MKV. */
  codecs: t.array(TranscodeVideoCodec),
  /** The codecs in `codecs` an encode can keep HDR in. Empty for SDR video. */
  hdrCodecs: t.array(TranscodeVideoCodec),
  /** Each source audio track and its available output choices. */
  audio: t.array(
    t.object({
      /** Source track, including its label for the form. */
      track: AudioTrack,
      /** Whether this track can stay unchanged. */
      keep: t.boolean(),
      /** Available conversions, AAC first. The first is the default, in stereo or mono from mono. An empty list means no conversion is possible. */
      conversions: t.array(
        t.object({
          /** Output codec. */
          codec: TranscodeAudioCodec,
          /** Output channel count, never greater than the source. */
          channels: t.number().int(),
        }),
      ),
    }),
  ),
  /** Tracks that can be embedded in the chosen container. */
  subtitles: t.array(SubtitleTrack),
  /** Tracks that can instead be drawn into encoded video. */
  burnIn: t.array(SubtitleTrack),
})
export type DownloadChoices = t.infer<typeof DownloadChoices>

/** Resolve up to 100 files in one read. Results preserve order and duplicates. */
export const DownloadResolveInput = t.object({
  /** Media item ids, usually the files of a season. */
  ids: t.array(t.uuid()).min(1).max(100),
  /** What the target device decodes and which encodes it prefers. */
  device: PlaybackDevice,
  /** High-level wishes applied independently to each file. */
  wishes: DownloadWishes,
})

/** A successful resolution or a file-specific failure. Other files still resolve. */
export const DownloadResolution = t.union([
  t.object({
    /** Ready to hand to downloads.start. */
    status: t.literal("ready"),
    /** The requested media item id. */
    id: t.uuid(),
    /** Whether the original container, video and preferred audio play without conversion or track-selection loss. */
    originalPlays: t.boolean(),
    /** The default saved version. Pass it unchanged to downloads.start. */
    spec: DownloadSpec,
    /** Contents and estimated bytes, from the same planner as downloads.plan. */
    plan: DownloadPlan,
    /** Available edits for a custom download form. */
    choices: DownloadChoices,
  }),
  t.object({
    /** This file cannot be made with these wishes. */
    status: t.literal("unavailable"),
    /** The requested media item id. */
    id: t.uuid(),
    /** A user-readable reason. Retry after changing the wishes or fixing the file. */
    message: t.string(),
  }),
])
export type DownloadResolution = t.infer<typeof DownloadResolution>
