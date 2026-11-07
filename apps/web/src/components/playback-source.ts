import {
  type AudioTrack,
  type Keyframes,
  type MediaProbe,
  PLAYBACK_QUALITIES,
  type PlaybackAudioCodec,
  type PlaybackQuality,
  type TranscodeVideoCodec,
} from "@matinee/contracts"
import type { RefObject } from "react"

import { decodesAudio } from "@/lib/audio-support"
import { languageTag, sameLanguage } from "@/lib/languages"

/**
 * Where the video comes from: the file as it is, with byte ranges and the
 * browser's own seeking; a stream of the copied video with one audio track
 * that starts at `offset` seconds into the file; or an encode as HLS, on
 * the file's timeline, that the browser seeks in itself. `start` is where
 * the encode begins playing, `subtitle` the track burned into it, and
 * `attempt` tells one try at it from the next.
 */
export type PlaybackSource =
  | { kind: "direct" }
  | {
      kind: "stream"
      audio: number
      quality: PlaybackQuality
      offset: number
    }
  | {
      kind: "hls"
      audio: number
      quality: PlaybackQuality
      start: number
      subtitle: string | null
      attempt: number
    }

/**
 * What a source asks of the browser: the file as it is, the file's video
 * with audio it decodes, or an H.264 encode.
 */
export type SourceKind = "direct" | "remux" | "encode"

export function kindOf(source: PlaybackSource): SourceKind {
  if (source.kind === "direct") return "direct"
  if (source.kind === "hls") return "encode"
  return source.quality === "original" ? "remux" : "encode"
}

/** Where in the file the video's time 0 is: a stream may start partway in. */
export function offsetOf(source: PlaybackSource | null): number {
  return source?.kind === "stream" ? source.offset : 0
}

export type StreamRequest = {
  audio: number
  start: number
  quality: PlaybackQuality
  /** What the browser decodes, so the server copies those tracks. */
  audioCodecs: readonly PlaybackAudioCodec[]
  /** The codecs the browser takes an encode in, the one wanted first. */
  videoCodecs: readonly TranscodeVideoCodec[]
}

/** An encode as HLS, from `start` seconds into the file. */
export type HlsRequest = StreamRequest & {
  /** A subtitle track to burn in. */
  subtitle: string | null
}

export type PlaybackOptions = {
  video: RefObject<HTMLVideoElement | null>
  directSrc: string
  streamSrc: (request: StreamRequest) => string
  hlsSrc: (request: HlsRequest) => string
  keyframes: (seconds: number) => Promise<Keyframes>
  /** The file's audio tracks. Undefined while they load. */
  audioTracks: AudioTrack[] | undefined
  /**
   * The same tracks from the probe, so the player knows before they load
   * which one plays and whether the browser decodes it. Undefined when
   * the file isn't probed.
   */
  probeAudio?: AudioCandidate[]
  /** The language to play the audio in when the file has it. */
  audioLanguage: string | null
  /** The file's length from the server, for streams that don't know it. */
  durationSeconds: number | null
  /** The video's size, for picking a quality to fall back to. */
  videoSize: { width: number; height: number } | null
  /** ffmpeg's name for the video codec, for saying what gets transcoded. */
  videoCodec: string | null
  /**
   * Whether the browser decodes the video as it is. When it doesn't, every
   * source is an encode.
   */
  videoPlays: boolean
  /** Seconds to resume from. */
  startAt?: number
  onResumed?: (seconds: number) => void
  /** Nothing this browser can play. */
  onUnsupported: () => void
}

/** What picking an audio track reads of it. */
export type AudioCandidate = Pick<
  AudioTrack,
  "index" | "codec" | "language" | "channels" | "label" | "primary"
>

const EMPTY: AudioTrack[] = []

const isCommentary = (track: AudioCandidate) => /commentary/i.test(track.label)

/**
 * The probe's audio streams as the player picks among them. The primary
 * one is the server's: the stream marked default, else the first.
 */
export function probeAudioOf(probe: MediaProbe): AudioCandidate[] {
  const primary = probe.audio.find((stream) => stream.default) ?? probe.audio[0]
  return probe.audio.map((stream) => ({
    index: stream.index,
    codec: stream.codec,
    language: languageTag(stream.language),
    channels: stream.channels,
    label: stream.title ?? "",
    primary: stream === primary,
  }))
}

/** The encode to fall back to when the browser can't play the file. */
export function fallbackQuality(
  size: { width: number; height: number } | null,
): PlaybackQuality {
  const fits = PLAYBACK_QUALITIES.find(
    (quality) =>
      quality.bitrate <= 20_000_000 &&
      (!size || quality.width <= Math.max(size.width, 640)),
  )
  return fits?.id ?? "720p-4"
}

/**
 * The track to play for a language: the file's default when it's in that
 * language, else the one with the most channels. Commentary never counts.
 */
function trackIn(
  language: string,
  tracks: readonly AudioCandidate[],
  primary: AudioCandidate | undefined,
): AudioCandidate | undefined {
  let best: AudioCandidate | undefined
  for (const track of tracks) {
    if (!sameLanguage(track.language, language) || isCommentary(track)) {
      continue
    }
    if (track === primary) return track
    if (!best || (track.channels ?? 0) > (best.channels ?? 0)) best = track
  }
  return best
}

/**
 * A track to play in place of `wanted` when the browser can't decode it:
 * one in the same language that it can, so the stream copies the audio
 * rather than converting it. The most channels wins; commentary never does.
 */
function standInFor(
  wanted: AudioCandidate | undefined,
  tracks: readonly AudioCandidate[],
): AudioCandidate | undefined {
  if (!wanted?.language) return undefined
  let best: AudioCandidate | undefined
  for (const track of tracks) {
    if (
      track === wanted ||
      track.language !== wanted.language ||
      !decodesAudio(track.codec) ||
      isCommentary(track)
    ) {
      continue
    }
    if (!best || (track.channels ?? 0) > (best.channels ?? 0)) best = track
  }
  return best
}

export type AudioChoice = {
  /** The file's tracks, once they load. */
  tracks: AudioTrack[]
  /** The track browsers play from the file by themselves. */
  primary: AudioCandidate | undefined
  /** The browser decodes the primary track. */
  directAudio: boolean
  /** The track the preferences ask for, decodable or not. */
  wanted: AudioCandidate | undefined
  /** A decodable track that plays in place of `wanted`. */
  standIn: AudioCandidate | undefined
  /** The track that plays until the viewer picks one. */
  preferred: AudioCandidate | undefined
  /** The preferred track plays with the file as it is. */
  playsFile: boolean
}

/**
 * Which audio plays: a track in `language` when the file has one, else the
 * file's default, and in place of one the browser can't decode, a
 * stand-in in the same language that it can. Until the tracks load, the
 * probe's say the same.
 */
export function audioChoice(
  audioTracks: AudioTrack[] | undefined,
  probeAudio: readonly AudioCandidate[] | undefined,
  language: string | null,
): AudioChoice {
  const tracks = audioTracks ?? EMPTY
  const candidates = audioTracks ?? probeAudio ?? EMPTY
  const primary = candidates.find((track) => track.primary) ?? candidates[0]
  // Without tracks or a probe, the file plays and the browser finds out.
  const directAudio = !primary || decodesAudio(primary.codec)
  const wanted =
    (language ? trackIn(language, candidates, primary) : undefined) ?? primary
  const standIn =
    wanted && !decodesAudio(wanted.codec)
      ? standInFor(wanted, candidates)
      : undefined
  const preferred = standIn ?? wanted
  const playsFile =
    !preferred || (preferred.index === primary?.index && directAudio)
  return { tracks, primary, directAudio, wanted, standIn, preferred, playsFile }
}

/**
 * Whether `el` has shown its source: decoded frames, or for a file without
 * video, half a second of sound.
 */
export function hasPlayed(el: HTMLVideoElement): boolean {
  if (el.getVideoPlaybackQuality().totalVideoFrames > 0) return true
  if (el.videoWidth > 0) return false
  for (let i = 0; i < el.played.length; i++) {
    if (el.played.end(i) - el.played.start(i) > 0.5) return true
  }
  return false
}

/** `start` of the keyframes: before for a switch, nearest for a seek. */
export function pickStart(
  keyframes: Keyframes,
  target: number,
  snap: "before" | "nearest",
): number {
  const { before, after } = keyframes
  if (snap === "before" || after === null) return before
  return after - target < target - before ? after : before
}

/** Whether `time` of the current resource can be seeked to without a reload. */
export function canSeekTo(el: HTMLVideoElement, time: number): boolean {
  for (let i = 0; i < el.seekable.length; i++) {
    if (el.seekable.start(i) <= time && time <= el.seekable.end(i)) {
      // A stream only reaches what it buffered.
      for (let j = 0; j < el.buffered.length; j++) {
        if (el.buffered.start(j) <= time && time <= el.buffered.end(j)) {
          return true
        }
      }
    }
  }
  return false
}
