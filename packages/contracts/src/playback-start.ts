import { t } from "./schema"
import { PlaybackMethod } from "./stats"
import { AudioTrack, HdrFormat, SubtitlePick, SubtitleTrack } from "./streams"
import { MediaItem } from "./titles"
import {
  PlaybackAudioCodec,
  PlaybackQuality,
  TranscodeVideoCodec,
} from "./transcoding"

/*
 * Starting playback. A player says what its device plays and what the
 * viewer picked so far, and the server answers with the source to load,
 * the tracks that play, and the next episode. The player makes none of
 * those choices itself, so every client plays a file the same way.
 */

/**
 * One kind of video a device decodes. A file's video fits when every
 * limit here allows it. Null lifts a limit; an empty list allows nothing.
 */
export const PlaybackDecoder = t.object({
  /** ffmpeg's codec name, like `hevc`, or `*` for every codec. */
  codec: t.string(),
  maxWidth: t.number().positive().nullable(),
  maxHeight: t.number().positive().nullable(),
  /** 8 for a decoder without 10-bit video. */
  maxBitDepth: t.number().positive().nullable(),
  /** The codec's profiles as ffprobe names them, like `High` or `Main 10`. */
  profiles: t.array(t.string()).nullable(),
  /** As ffprobe reports it: 41 for H.264 level 4.1, 120 for HEVC 4. */
  maxLevel: t.number().positive().nullable(),
  /** The HDR formats it shows. SDR always fits. */
  hdr: t.array(HdrFormat).nullable(),
  /** The Dolby Vision profiles it shows, like 5 or 8. */
  dolbyVisionProfiles: t.array(t.number().int()).nullable(),
})
export type PlaybackDecoder = t.infer<typeof PlaybackDecoder>

export const PLAYBACK_SUBTITLE_DELIVERIES = ["webvtt", "pgs"] as const
/** A `SubtitleDelivery` a player can draw itself, from `subtitlePath()`. */
export const PlaybackSubtitleDelivery = t.enum(PLAYBACK_SUBTITLE_DELIVERIES)
export type PlaybackSubtitleDelivery = t.infer<typeof PlaybackSubtitleDelivery>

/**
 * What a player's device plays, after its own settings narrowed it: a
 * format the settings have the server convert is left out. The player
 * finds this out from the device and sends it with every
 * `playback.start`.
 */
export const PlaybackDevice = t.object({
  /** The containers it reads, as `MediaItem.container`, or `*` for all. */
  containers: t.array(t.string()),
  /** The video it decodes. A file plays when one of these fits it. */
  video: t.array(PlaybackDecoder),
  /**
   * The audio it decodes from a file, as ffmpeg names the codecs. `pcm_*`
   * stands for every PCM format and `*` for every codec.
   */
  audio: t.array(t.string()),
  /**
   * The audio it takes in a stream from `mediaPlaybackPath()`, which
   * copies a track in one of these and converts the rest to the first
   * of them the server encodes.
   */
  streamAudio: t.array(PlaybackAudioCodec),
  /** The codecs it takes an encode in, the one it wants first. */
  encodeVideo: t.array(TranscodeVideoCodec),
  /** It plays HLS, which every encode with a burned-in subtitle is. */
  hls: t.boolean(),
  /**
   * It can play any audio track of a file as it is. A browser only plays
   * the default one, so another track makes the source a stream.
   */
  selectAudio: t.boolean(),
  /** The subtitles it draws over any source, from `subtitlePath()`. */
  subtitles: t.array(PlaybackSubtitleDelivery),
  /**
   * More it draws from `subtitlePath()`, but only for a file beside the
   * video, as mpv does with PGS.
   */
  sidecarSubtitles: t.array(PlaybackSubtitleDelivery),
  /**
   * The subtitle streams it draws from the file itself while the file
   * plays as it is, by `SubtitleTrack.format`, like `PGS` or `ASS`. `*`
   * for all of them.
   */
  embeddedSubtitles: t.array(t.string()),
  /**
   * The device's language as a BCP 47 tag, for subtitles when the
   * viewer's preferences name no language.
   */
  language: t.string().min(1).max(35),
})
export type PlaybackDevice = t.infer<typeof PlaybackDevice>

export const PLAYBACK_SNAPS = ["before", "nearest"] as const
/**
 * Which keyframe a copied stream starts on. `before` never skips ahead,
 * for a switch of track or quality. `nearest` is for a seek.
 */
export const PlaybackSnap = t.enum(PLAYBACK_SNAPS)
export type PlaybackSnap = t.infer<typeof PlaybackSnap>

export const PlaybackStartInput = t.object({
  itemId: t.uuid(),
  /**
   * The id the player made for this sitting with the file, as it sends
   * it to `playback.report`. It goes into the stream's address.
   */
  sessionId: t.uuid(),
  device: PlaybackDevice,
  /**
   * The `AudioTrack.index` the viewer picked in the player. Left out, the
   * server picks: the track remembered from before, else one in the
   * preferred language, else the file's default.
   */
  audio: t.number().int().nonnegative().optional(),
  /** Turn subtitles on without a pick. Finds a drawable track even if defaults are off. */
  subtitlesOn: t.boolean().optional(),
  /**
   * The subtitle the viewer picked in the player, or off. Left out, the
   * server picks by what was remembered and the preferences.
   */
  subtitle: SubtitlePick.optional(),
  /** Left out, `original`. */
  quality: PlaybackQuality.optional(),
  /**
   * Seconds into the file to start from. Left out, where the viewer
   * stopped last time, or the start.
   */
  position: t.number().nonnegative().optional(),
  snap: PlaybackSnap.$default("before"),
  /**
   * The methods that didn't play in this sitting. The server never
   * answers with one of them, so a player falls back by adding the one
   * that failed and asking again. A `direct` that failed leaves a
   * stream, and a `remux` that failed an encode.
   */
  failed: t.array(PlaybackMethod).$default([]),
})
export type PlaybackStartInput = t.infer<typeof PlaybackStartInput>

export const PLAYBACK_SUBTITLE_MODES = ["client", "player", "burn-in"] as const
/**
 * Where a subtitle comes from. `client`: the player loads `subtitleUrl`
 * and draws it. `player`: it's a stream of the file that plays, which the
 * player draws from there. `burn-in`: it's part of the picture.
 */
export const PlaybackSubtitleMode = t.enum(PLAYBACK_SUBTITLE_MODES)
export type PlaybackSubtitleMode = t.infer<typeof PlaybackSubtitleMode>

export const PLAYBACK_REASONS = [
  "container",
  "video",
  "audio",
  "audio-selection",
  "subtitle",
  "quality",
  "failed",
] as const
/**
 * Why a file doesn't play as it is, for a player to say in its own
 * words. `container`, `video`, `audio`: the device doesn't play that part
 * of the file. `audio-selection`: it plays the track, but can't pick it
 * in the file. `subtitle`: the subtitle has to be burned in. `quality`:
 * the viewer picked one. `failed`: a method was tried and didn't play.
 */
export const PlaybackReason = t.enum(PLAYBACK_REASONS)
export type PlaybackReason = t.infer<typeof PlaybackReason>

export const PlaybackStart = t.object({
  /** The file, with its length, its probe, and where the viewer stopped. */
  item: MediaItem,
  /**
   * `direct` is the file from `mediaStreamPath()`, `remux` a stream from
   * `mediaPlaybackPath()`, and `transcode` an encode, as HLS where the
   * device plays it.
   */
  method: PlaybackMethod,
  /** What to load: a path on the server, with the session id in it. */
  url: t.string(),
  /** `url` is an HLS playlist. */
  hls: t.boolean(),
  /**
   * Where in the file the source's time 0 is, in seconds. Above 0 only
   * for a stream that starts partway in, and then on a keyframe.
   */
  offset: t.number(),
  /** Where to start playing, in the source's own time. */
  start: t.number(),
  /** The same point in the file's time: `offset` plus `start`. */
  position: t.number(),
  /** The audio that plays. Null for a file without any. */
  audio: AudioTrack.nullable(),
  /** The codec the audio is converted to. Null when it's sent as it is. */
  convertedAudio: t.string().nullable(),
  /** The codec the video is encoded in. Null when it is copied. */
  convertedVideo: TranscodeVideoCodec.nullable(),
  /** The track `audio` replaces in the same language. Null when none is replaced. */
  standIn: AudioTrack.nullable(),
  /** The subtitle that shows. Null for none. */
  subtitle: SubtitleTrack.nullable(),
  /** Null without a subtitle. */
  subtitleMode: PlaybackSubtitleMode.nullable(),
  /** The `subtitlePath()` to draw from, for the `client` mode. */
  subtitleUrl: t.string().nullable(),
  /** The file's audio tracks, for the player's menu. */
  audioTracks: t.array(AudioTrack),
  /** The file's subtitle tracks, for the player's menu. */
  subtitleTracks: t.array(SubtitleTrack),
  /**
   * The quality that plays. Not the one asked for when the device can't
   * play the original and the server picked an encode.
   */
  quality: PlaybackQuality,
  /** Empty when the file plays as it is. */
  reasons: t.array(PlaybackReason),
  /** The file after this one in its show, to offer when this one ends. */
  next: MediaItem.nullable(),
})
export type PlaybackStart = t.infer<typeof PlaybackStart>

/**
 * The code `playback.start` fails with, as HTTP 422, when nothing the
 * device plays is left to try. A player says so and stops.
 */
export const PLAYBACK_UNPLAYABLE = "UNPLAYABLE"

export const PlaybackSeekInput = t.object({
  itemId: t.uuid(),
  sessionId: t.uuid(),
  /** The `AudioTrack.index` that plays. */
  audio: t.number().int().nonnegative(),
  /** Seconds into the file. */
  position: t.number().nonnegative(),
  snap: PlaybackSnap.$default("nearest"),
  /** The device's `streamAudio`. */
  audioCodecs: t.array(PlaybackAudioCodec),
})
export type PlaybackSeekInput = t.infer<typeof PlaybackSeekInput>

export const PlaybackSeek = t.object({
  /** The stream to load, which starts playing at its time 0. */
  url: t.string(),
  /** Where in the file that is, in seconds: the keyframe it starts on. */
  offset: t.number().nonnegative(),
})
export type PlaybackSeek = t.infer<typeof PlaybackSeek>
