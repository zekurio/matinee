import { t } from "./schema"

/** Stream index in the file, as `ffmpeg -map 0:<index>` takes it. */
const StreamIndex = t.number().int().nonnegative()

/** ISO 639-2 code from the file, like `eng` or `ger`. Null when unset. */
const StreamLanguage = t.string().nullable()

export const HDR_FORMATS = ["hdr10", "hlg", "dolby-vision"] as const
export const HdrFormat = t.enum(HDR_FORMATS)
export type HdrFormat = t.infer<typeof HdrFormat>

/**
 * `text` subtitles (SubRip, ASS, WebVTT, ...) convert to WebVTT. `bitmap`
 * ones (PGS, VobSub, DVB) are pictures: PGS goes to players as it is, and
 * an encode can burn any of them into the video.
 */
export const SUBTITLE_KINDS = ["text", "bitmap"] as const
export const SubtitleKind = t.enum(SUBTITLE_KINDS)
export type SubtitleKind = t.infer<typeof SubtitleKind>

/** What the Dolby Vision configuration record of a stream says. */
export const DolbyVision = t.object({
  /** 5 has no base layer other players can show; 7 and 8 do. */
  profile: t.number().int(),
  level: t.number().int().nullable(),
  rpuPresent: t.boolean(),
  /** An enhancement layer, as in profile 7 Blu-ray remuxes. */
  elPresent: t.boolean(),
  blPresent: t.boolean(),
  /**
   * What the base layer is without Dolby Vision: 1 HDR10, 2 SDR, 4 HLG,
   * 6 for profile 7's HDR10 base, 0 none.
   */
  blCompatibilityId: t.number().int().nullable(),
})
export type DolbyVision = t.infer<typeof DolbyVision>

/** Static HDR10 metadata: MaxCLL and MaxFALL in nits. */
export const ContentLightLevel = t.object({
  maxCll: t.number().int(),
  maxFall: t.number().int(),
})
export type ContentLightLevel = t.infer<typeof ContentLightLevel>

export const VideoStream = t.object({
  index: StreamIndex,
  /** ffmpeg's codec name, like `h264`, `hevc`, or `av1`. */
  codec: t.string(),
  /** The container's tag, like `hvc1`, `dvh1`, or `avc1`. Null when unset. */
  codecTag: t.string().nullable(),
  /** Such as `High` or `Main 10`. */
  profile: t.string().nullable(),
  /** As ffprobe reports it: 41 for H.264 level 4.1, 120 for HEVC 4. */
  level: t.number().int().nullable(),
  width: t.number().int(),
  height: t.number().int(),
  /** Average frames per second. */
  frameRate: t.number().nullable(),
  /** Bits per second of this stream, when the file says. */
  bitRate: t.number().int().int64().nullable(),
  /** Such as `yuv420p` or `yuv420p10le`. */
  pixelFormat: t.string().nullable(),
  bitDepth: t.number().int().nullable(),
  /** Such as `bt709`, `smpte2084` (PQ), or `arib-std-b67` (HLG). */
  colorTransfer: t.string().nullable(),
  /** Such as `bt709` or `bt2020`. */
  colorPrimaries: t.string().nullable(),
  /** The matrix, such as `bt709` or `bt2020nc`. */
  colorSpace: t.string().nullable(),
  /** `tv` (limited) or `pc` (full). */
  colorRange: t.string().nullable(),
  /** Stored as fields rather than frames. */
  interlaced: t.boolean(),
  /** Null for SDR. Dolby Vision wins over the base layer's format. */
  hdr: HdrFormat.nullable(),
  /** Dolby Vision profile, like 5, 7, or 8. Same as `dolbyVision.profile`. */
  dolbyVisionProfile: t.number().int().nullable(),
  dolbyVision: DolbyVision.nullable(),
  /** The first frame carries HDR10+ dynamic metadata. */
  hdr10Plus: t.boolean(),
  /** HDR10 mastering display metadata is present. */
  masteringDisplay: t.boolean(),
  contentLightLevel: ContentLightLevel.nullable(),
})
export type VideoStream = t.infer<typeof VideoStream>

export const AudioStream = t.object({
  index: StreamIndex,
  /** ffmpeg's codec name, like `aac`, `eac3`, `truehd`, or `dts`. */
  codec: t.string(),
  /** Such as `LC`, `DTS-HD MA`, or `Dolby TrueHD + Dolby Atmos`. */
  profile: t.string().nullable(),
  channels: t.number().int().nullable(),
  /** Such as `stereo` or `5.1(side)`. */
  channelLayout: t.string().nullable(),
  language: StreamLanguage,
  title: t.string().nullable(),
  default: t.boolean(),
})
export type AudioStream = t.infer<typeof AudioStream>

export const SubtitleStream = t.object({
  index: StreamIndex,
  /** ffmpeg's codec name, like `subrip`, `ass`, or `hdmv_pgs_subtitle`. */
  codec: t.string(),
  /** Null for codecs that are neither, such as teletext. */
  kind: SubtitleKind.nullable(),
  language: StreamLanguage,
  title: t.string().nullable(),
  default: t.boolean(),
  forced: t.boolean(),
  /** SDH: also describes sounds, for deaf and hard of hearing viewers. */
  hearingImpaired: t.boolean(),
})
export type SubtitleStream = t.infer<typeof SubtitleStream>

/** What ffprobe read from a file. */
export const MediaProbe = t.object({
  format: t.object({
    /** ffmpeg's demuxer names, like `matroska,webm` or `mov,mp4,m4a,3gp,3g2,mj2`. */
    name: t.string(),
    durationSeconds: t.number().nullable(),
    /** Absolute timestamp origin. Absent in probes saved before it was recorded. */
    startSeconds: t.number().nullable().optional(),
    /** Overall bits per second. */
    bitRate: t.number().int().int64().nullable(),
  }),
  /** The main video stream, without cover art. Null in audio-only files. */
  video: VideoStream.nullable(),
  /** In file order. */
  audio: t.array(AudioStream),
  /** In file order. */
  subtitles: t.array(SubtitleStream),
})
export type MediaProbe = t.infer<typeof MediaProbe>

/** A probed video with display facts. */
export const DisplayVideoStream = VideoStream.extend({
  /** The codec's short name, like `HEVC` or `WMV`. */
  format: t.string(),
  /** The frame size for display, like `4K` or `1080p`. */
  resolution: t.string(),
  /** `Dolby Vision`, `HDR10+`, `HDR10`, or `HLG`. Null for SDR. */
  dynamicRange: t.string().nullable(),
})
export type DisplayVideoStream = t.infer<typeof DisplayVideoStream>

/** A probed audio stream with display facts. */
export const DisplayAudioStream = AudioStream.extend({
  /** The codec and profile, like `TrueHD Atmos` or `DTS-HD MA`. */
  format: t.string(),
  /** Speakers, like `5.1` or `Stereo`. Null when no known layout fits. */
  layout: t.string().nullable(),
})
export type DisplayAudioStream = t.infer<typeof DisplayAudioStream>

/** The client view of a probe. Stored probes keep their original shape. */
export const DisplayMediaProbe = MediaProbe.extend({
  video: DisplayVideoStream.nullable(),
  audio: t.array(DisplayAudioStream),
})
export type DisplayMediaProbe = t.infer<typeof DisplayMediaProbe>

export const SUBTITLE_SOURCES = ["sidecar", "embedded"] as const
/** A file next to the video, or a stream inside it. */
export const SubtitleSource = t.enum(SUBTITLE_SOURCES)
export type SubtitleSource = t.infer<typeof SubtitleSource>

export const SUBTITLE_DELIVERIES = ["webvtt", "pgs", "burn-in"] as const
/**
 * How a player shows a subtitle track. `webvtt`: `subtitlePath()` serves it
 * as WebVTT. `pgs`: `subtitlePath()` serves the PGS pictures as a `.sup`
 * file for the player to draw over the video; an encode can also burn them
 * in. `burn-in`: only an encode shows it, with the track id as `subtitle`
 * in `mediaHlsPath()`.
 */
export const SubtitleDelivery = t.enum(SUBTITLE_DELIVERIES)
export type SubtitleDelivery = t.infer<typeof SubtitleDelivery>

/** A subtitle track of a file. `delivery` says how to show it. */
export const SubtitleTrack = t.object({
  id: t.string(),
  /** The language, plus the track's own title if it has one. */
  label: t.string(),
  /** BCP 47 tag, like `en` or `pt-BR`. Null when the file doesn't say. */
  language: t.string().nullable(),
  /**
   * The track's own title from the file, like `Signs & Songs`. Clients that
   * show another language than English build their label from it.
   */
  title: t.string().nullable(),
  /** Translates only foreign dialogue and signs. */
  forced: t.boolean(),
  /** Also describes sounds, for deaf and hard of hearing viewers (SDH, CC). */
  sdh: t.boolean(),
  /** The file marks it as the track to show by default. */
  default: t.boolean(),
  source: SubtitleSource,
  /** The format's short name for display, like `SRT`, `ASS`, or `PGS`. */
  format: t.string(),
  /** Null for tracks the server can't show at all, such as teletext. */
  delivery: SubtitleDelivery.nullable(),
})
export type SubtitleTrack = t.infer<typeof SubtitleTrack>

export const Subtitles = t.object({
  /** Files next to the video first, then streams in file order. */
  tracks: t.array(SubtitleTrack),
  /** Language of the audio that plays first, for picking forced tracks. */
  audioLanguage: t.string().nullable(),
})
export type Subtitles = t.infer<typeof Subtitles>

/** An audio track of a file. Play one from `mediaPlaybackPath()`. */
export const AudioTrack = t.object({
  /** Stream index in the file. */
  index: StreamIndex,
  /** The language, plus the track's own title if it has one. */
  label: t.string(),
  /** BCP 47 tag, like `en` or `ja`. Null when the file doesn't say. */
  language: t.string().nullable(),
  /** The track's own title from the file, like `Commentary`. */
  title: t.string().nullable(),
  /** ffmpeg's codec name, like `aac`, `eac3`, or `truehd`. */
  codec: t.string(),
  /** The codec and profile for display, like `TrueHD Atmos` or `DTS-HD MA`. */
  format: t.string(),
  channels: t.number().int().nullable(),
  /** The speakers for display, like `5.1` or `Stereo`. Null when unknown. */
  layout: t.string().nullable(),
  /**
   * The track a browser plays from the file as it is: the one the file
   * marks default, else the first. Only one track is primary.
   */
  primary: t.boolean(),
})
export type AudioTrack = t.infer<typeof AudioTrack>

/** A subtitle pick in the player. */
export const SubtitlePick = t.object({
  /** A `SubtitleTrack.id`, or null for subtitles off. */
  trackId: t.string().min(1).max(64).nullable(),
})
export type SubtitlePick = t.infer<typeof SubtitlePick>

/**
 * The tracks a file starts with from the viewer's picks, ahead of the
 * languages in the playback preferences. Each is the pick made in this
 * file, else the closest match to the latest pick in another file of the
 * same title, as the next episode of a show. Null where there's neither,
 * or the preferences don't remember that kind of pick.
 */
export const TrackPicks = t.object({
  /** An `AudioTrack.index`. */
  audio: StreamIndex.nullable(),
  subtitle: SubtitlePick.nullable(),
})
export type TrackPicks = t.infer<typeof TrackPicks>

/**
 * The video keyframes around a point, in seconds from the start. Playing
 * the `original` quality copies the video, so it can only start on one.
 */
export const Keyframes = t.object({
  /** The last keyframe at or before the point. */
  before: t.number().min(0),
  /** The first keyframe after the point, when one is near. */
  after: t.number().min(0).nullable(),
})
export type Keyframes = t.infer<typeof Keyframes>
