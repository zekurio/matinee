import type {
  PlaybackDecoder,
  PlaybackDevice,
  VideoStream,
} from "@matinee/contracts"

import { browserAudioCodecs } from "./audio-support"
import { deviceLanguage } from "./languages"
import { browserVideoCodecs, decodesVideo } from "./video-support"

/*
 * This browser as `downloads.resolve` takes it. A download is judged by
 * what the browser plays, not by the player's settings, so the audio
 * here is every codec the browser plays and the encodes are every codec
 * it plays an encode in.
 */

/** Levels as ffprobe reports them: 41 for H.264 4.1, 120 for HEVC 4. */
const H264_LEVELS = [
  10, 11, 12, 13, 20, 21, 22, 30, 31, 32, 40, 41, 42, 50, 51, 52, 60, 61, 62,
]
const HEVC_LEVELS = [30, 60, 63, 90, 93, 120, 123, 150, 153, 156, 180, 183, 186]

const H264_PROFILES = [
  "Constrained Baseline",
  "Baseline",
  "Main",
  "Extended",
  "High",
  "High 10",
  "High 4:2:2",
  "High 4:4:4 Predictive",
]

/** One kind of video to ask the browser about, and the decoder it makes. */
type Variant = {
  codec: string
  profile: string | null
  bitDepth: number | null
  /** Null when the browser's check doesn't look at the level. */
  levels: number[] | null
  /** The profiles the decoder takes. Null for any. */
  profiles: string[] | null
}

const VARIANTS: Variant[] = [
  ...H264_PROFILES.map((profile) => ({
    codec: "h264",
    profile,
    bitDepth: null,
    levels: H264_LEVELS,
    profiles: [profile],
  })),
  ...[8, 10].flatMap((bitDepth) => [
    {
      codec: "hevc",
      profile: bitDepth > 8 ? "Main 10" : "Main",
      bitDepth,
      levels: HEVC_LEVELS,
      profiles: null,
    },
    { codec: "av1", profile: null, bitDepth, levels: null, profiles: null },
    { codec: "vp9", profile: null, bitDepth, levels: null, profiles: null },
  ]),
  { codec: "vp8", profile: null, bitDepth: null, levels: null, profiles: null },
]

/** A stream with only the facts the browser's check reads. */
function sample(variant: Variant, level: number | null): VideoStream {
  return {
    index: 0,
    codec: variant.codec,
    codecTag: null,
    profile: variant.profile,
    level,
    width: 1920,
    height: 1080,
    frameRate: null,
    bitRate: null,
    pixelFormat: null,
    bitDepth: variant.bitDepth,
    colorTransfer: null,
    colorPrimaries: null,
    colorSpace: null,
    colorRange: null,
    interlaced: false,
    hdr: null,
    dolbyVisionProfile: null,
    dolbyVision: null,
    hdr10Plus: false,
    masteringDisplay: false,
    contentLightLevel: null,
  }
}

/** The decoder for `variant`, up to the highest level the browser plays. */
function decoderOf(variant: Variant): PlaybackDecoder | null {
  const levels = variant.levels ?? [null]
  const plays = levels.filter((level) => decodesVideo(sample(variant, level)))
  if (plays.length === 0) return null
  const highest = plays.at(-1) ?? null
  return {
    codec: variant.codec,
    maxWidth: null,
    maxHeight: null,
    maxBitDepth: variant.bitDepth,
    profiles: variant.profiles,
    // Every level plays, so none is too high.
    maxLevel: plays.length === levels.length ? null : highest,
    // The browser's check doesn't tell HDR apart.
    hdr: null,
    dolbyVisionProfiles: null,
  }
}

let decoders: PlaybackDecoder[] | null = null

function videoDecoders(): PlaybackDecoder[] {
  decoders ??= VARIANTS.flatMap((variant) => decoderOf(variant) ?? [])
  return decoders
}

const CONTAINER_TYPES = new Map([
  ["mp4", "video/mp4"],
  ["m4v", "video/mp4"],
  ["mov", "video/quicktime"],
  ["webm", "video/webm"],
  ["mkv", "video/x-matroska"],
  ["ogv", "video/ogg"],
])

let containers: string[] | null = null

function browserContainers(): string[] {
  if (containers) return containers
  const probe = document.createElement("video")
  containers = [...CONTAINER_TYPES]
    .filter(([, type]) => probe.canPlayType(type) !== "")
    .map(([container]) => container)
  return containers
}

/** What this browser plays, for `downloads.resolve`. */
export function downloadDevice(): PlaybackDevice {
  const encodes = browserVideoCodecs()
  return {
    containers: browserContainers(),
    video: videoDecoders(),
    audio: [...browserAudioCodecs()],
    streamAudio: [...browserAudioCodecs()],
    // H.264 is always there to fall back on.
    encodeVideo: encodes.includes("h264") ? [...encodes] : [...encodes, "h264"],
    hls: true,
    selectAudio: false,
    subtitles: ["webvtt", "pgs"],
    sidecarSubtitles: [],
    embeddedSubtitles: [],
    language: deviceLanguage(),
  }
}
