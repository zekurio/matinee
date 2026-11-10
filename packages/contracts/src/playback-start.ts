import { t } from "./schema"
import { AudioTrack, HdrFormat, SubtitlePick, SubtitleTrack } from "./streams"
import { MediaItem } from "./titles"
import {
  PlaybackAudioCodec,
  PlaybackQuality,
  TranscodeVideoCodec,
} from "./transcoding"

/** One decoder's limits. An empty list accepts no values; null means any. */
export const PlaybackDecoder = t.object({
  /** ffmpeg's codec name, or `*` for every codec. */
  codec: t.string(),
  /** Largest width, or null for no limit. */
  maxWidth: t.number().positive().nullable(),
  /** Largest height, or null for no limit. */
  maxHeight: t.number().positive().nullable(),
  /** Largest bit depth, or null for no limit. */
  maxBitDepth: t.number().positive().nullable(),
  /** Codec profiles, or null for any. */
  profiles: t.array(t.string()).nullable(),
  /** Largest codec level, or null for no limit. */
  maxLevel: t.number().positive().nullable(),
  /** HDR formats it accepts, or null for any. SDR always counts. */
  hdr: t.array(HdrFormat).nullable(),
  /** Dolby Vision profiles, or null for any. */
  dolbyVisionProfiles: t.array(t.number().int()).nullable(),
})
export type PlaybackDecoder = t.infer<typeof PlaybackDecoder>

/** Subtitle files a client can draw without an encode. */
export const PlaybackSubtitleDelivery = t.enum(["webvtt", "pgs"])

/** What a player accepts, after its device settings have narrowed it. */
export const PlaybackDevice = t.object({
  /** File extensions, or `*` for every container. */
  containers: t.array(t.string()),
  /** A file plays if any decoder accepts its video. */
  video: t.array(PlaybackDecoder),
  /** ffmpeg audio codec names, `pcm_*`, or `*`. */
  audio: t.array(t.string()),
  /** Audio accepted in copied MP4, preferred conversion codec first. */
  streamAudio: t.array(PlaybackAudioCodec),
  /** Codecs accepted for an encode, preferred first. */
  encodeVideo: t.array(TranscodeVideoCodec),
  /** The player accepts HLS encodes. */
  hls: t.boolean(),
  /** The player can select a non-default audio stream in the original file. */
  selectAudio: t.boolean(),
  /** Subtitle deliveries drawn from subtitlePath over any source. */
  subtitles: t.array(PlaybackSubtitleDelivery),
  /** Extra subtitle deliveries drawn from sidecar files over any source. */
  sidecarSubtitles: t.array(PlaybackSubtitleDelivery),
  /** Embedded subtitle format names drawn only with the original file, or `*`. */
  embeddedSubtitles: t.array(t.string()),
  /** Device language used when the viewer has no subtitle language. */
  language: t.string().min(1).max(35),
})
export type PlaybackDevice = t.infer<typeof PlaybackDevice>
export const PlaybackStartMethod = t.enum(["direct", "remux", "encode"])
export type PlaybackStartMethod = t.infer<typeof PlaybackStartMethod>
export const PlaybackStartInput = t.object({
  /** File to play. */
  itemId: t.uuid(),
  /** The sitting's id, also sent to playback.report. */
  sessionId: t.uuid(),
  /** What this device plays. */
  device: PlaybackDevice,
  /** Explicit audio stream, ahead of remembered picks. */
  audio: t.number().int().nonnegative().optional(),
  /** Explicit subtitle, with a null trackId for off. */
  subtitle: SubtitlePick.optional(),
  /** Quality requested on this device. Defaults to original. */
  quality: PlaybackQuality.optional(),
  /** File time to start from. Defaults to the viewer's resume point. */
  position: t.number().nonnegative().optional(),
  /** Snap copied streams before a switch or to the nearest keyframe for a seek. */
  snap: t.enum(["before", "nearest"]).$default("before"),
  /** Methods that failed in this sitting. They will not be offered again. */
  failed: t.array(PlaybackStartMethod).$default([]),
})
export type PlaybackStartInput = t.infer<typeof PlaybackStartInput>
export const PlaybackStart = t.object({
  /** File details, runtime, probe, and the viewer's progress. */
  item: MediaItem,
  /** How the video is delivered. */
  method: PlaybackStartMethod,
  /** Relative path to load. */
  url: t.string(),
  /** The URL is an HLS playlist. */
  hls: t.boolean(),
  /** File time represented by the stream's time zero. */
  offset: t.number(),
  /** Position on the loaded source's timeline. */
  start: t.number(),
  /** File position after keyframe snapping. */
  position: t.number(),
  /** Audio stream that plays, or null for files without audio. */
  audio: AudioTrack.nullable(),
  /** Codec of converted audio, or null when copied. */
  convertedAudio: t.string().nullable(),
  /** Selected audio replaces an undecodable track in the same language. */
  standIn: t.boolean(),
  /** Subtitle shown, or null for off. */
  subtitle: SubtitleTrack.nullable(),
  /** How the subtitle shows, or null for off. */
  subtitleMode: t.enum(["client", "player", "burn-in"]).nullable(),
  /** Relative subtitle path for client rendering, otherwise null. */
  subtitleUrl: t.string().nullable(),
  /** Audio menu. */
  audioTracks: t.array(AudioTrack),
  /** Subtitle menu. */
  subtitleTracks: t.array(SubtitleTrack),
  /** Quality actually delivered. */
  quality: PlaybackQuality,
  /** Reasons the original file cannot satisfy this request. */
  reasons: t.array(
    t.enum([
      "container",
      "video",
      "audio",
      "audio-selection",
      "subtitle",
      "quality",
      "failed",
    ]),
  ),
  /** Following episode in the title's order, or null. */
  next: MediaItem.nullable(),
})
export type PlaybackStart = t.infer<typeof PlaybackStart>

/** Move within an already selected copied stream without loading menus or preferences. */
export const PlaybackSeekInput = t.object({
  /** File already playing as a copied stream. */
  itemId: t.uuid(),
  /** The sitting's id. */
  sessionId: t.uuid(),
  /** Selected audio stream index. */
  audio: t.number().int().nonnegative(),
  /** File time requested. */
  position: t.number().nonnegative(),
  /** Before for a switch, nearest for a seek. */
  snap: t.enum(["before", "nearest"]).$default("nearest"),
  /** Accepted audio codecs, preferred conversion first. */
  audioCodecs: t.array(PlaybackAudioCodec),
})
export type PlaybackSeekInput = t.infer<typeof PlaybackSeekInput>
export const PlaybackSeek = t.object({
  /** Relative copied-stream path. */
  url: t.string(),
  /** File time at the stream's time zero, already snapped. Start playing at zero. */
  offset: t.number().nonnegative(),
})
export type PlaybackSeek = t.infer<typeof PlaybackSeek>
