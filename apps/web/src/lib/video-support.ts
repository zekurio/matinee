import type {
  PlaybackDecoder,
  TranscodeVideoCodec,
  VideoStream,
} from "@matinee/contracts"

import { usePlayerPreferencesStore } from "@/stores/player-preferences"

/**
 * Each codec an encode can come in, as an MP4 MIME type for what the
 * server makes: 8-bit H.264 High, HEVC Main, and AV1 Main, at 1080p
 * levels.
 */
const ENCODE_TYPES = new Map<TranscodeVideoCodec, string>([
  ["h264", 'video/mp4; codecs="avc1.640028"'],
  ["hevc", 'video/mp4; codecs="hvc1.1.6.L120.90"'],
  ["av1", 'video/mp4; codecs="av01.0.08M.08"'],
])

/** The codecs `auto` asks for, the smallest for the quality first. */
const AUTO_ORDER: readonly TranscodeVideoCodec[] = ["av1", "hevc", "h264"]

/** ffprobe's H.264 profiles, as the profile byte of an `avc1` codec string. */
const H264_PROFILES = new Map([
  ["Baseline", "42"],
  ["Constrained Baseline", "42"],
  ["Main", "4d"],
  ["Extended", "58"],
  ["High", "64"],
  ["High 10", "6e"],
  ["High 10 Intra", "6e"],
  ["High 4:2:2", "7a"],
  ["High 4:2:2 Intra", "7a"],
  ["High 4:4:4", "f4"],
  ["High 4:4:4 Predictive", "f4"],
  ["High 4:4:4 Intra", "f4"],
  ["CAVLC 4:4:4", "2c"],
  // Players show the High base view of these.
  ["Multiview High", "64"],
  ["Stereo High", "64"],
])

// The levels each codec has, as ffprobe reports them, lowest first.
const H264_LEVELS = [
  10, 11, 12, 13, 20, 21, 22, 30, 31, 32, 40, 41, 42, 50, 51, 52, 60, 61, 62,
]
const HEVC_LEVELS = [30, 60, 63, 90, 93, 120, 123, 150, 153, 156, 180, 183, 186]

/** ffprobe's HEVC profiles, with the profile number of an `hvc1` string. */
const HEVC_PROFILES = new Map([
  ["Main", "1.6"],
  ["Main Still Picture", "3.E"],
  ["Main 10", "2.4"],
  ["Rext", "4.10"],
])

const h264Type = (profile: string, level: number) =>
  `video/mp4; codecs="avc1.${profile}00${level.toString(16).padStart(2, "0")}"`
const hevcType = (profile: string, level: number) =>
  `video/mp4; codecs="hvc1.${profile}.L${level}.B0"`
const av1Type = (profile: number, tenBit: boolean) =>
  `video/mp4; codecs="av01.${profile}.08M.${tenBit ? "10" : "08"}"`
const vp9Type = (tenBit: boolean) =>
  tenBit
    ? 'video/mp4; codecs="vp09.02.40.10"'
    : 'video/mp4; codecs="vp09.00.40.08"'
const VP8_TYPE = 'video/webm; codecs="vp8"'

let probe: HTMLVideoElement | null = null

/** Whether this browser says it may play `type` from a file. */
function plays(type: string): boolean {
  probe ??= document.createElement("video")
  return probe.canPlayType(type) !== ""
}

/**
 * The file's video as an MP4 MIME type, from what ffprobe read, or null
 * for a codec no browser plays without help.
 */
function videoType(video: VideoStream): string | null {
  const tenBit = (video.bitDepth ?? 8) > 8
  switch (video.codec) {
    case "h264":
      return h264Type(
        H264_PROFILES.get(video.profile ?? "High") ?? "64",
        video.level ?? 40,
      )
    case "hevc":
      return hevcType(
        tenBit || video.profile === "Main 10" ? "2.4" : "1.6",
        video.level ?? 120,
      )
    case "av1":
      return av1Type(0, tenBit)
    case "vp9":
      return vp9Type(tenBit)
    case "vp8":
      return VP8_TYPE
    default:
      return null
  }
}

/**
 * Whether this browser decodes the file's video as it is, for a download
 * that keeps it. Playback asks the server instead, with `browserDecoders()`.
 */
export function decodesVideo(video: VideoStream | null | undefined): boolean {
  if (!video) return true
  const type = videoType(video)
  return type !== null && plays(type)
}

/** The highest of `levels` that this browser plays, with every one below it. */
function maxLevel(
  levels: readonly number[],
  type: (level: number) => string,
): number | null {
  let max: number | null = null
  for (const level of levels) {
    if (!plays(type(level))) break
    max = level
  }
  return max
}

const ANY: Omit<PlaybackDecoder, "codec"> = {
  maxWidth: null,
  maxHeight: null,
  maxBitDepth: null,
  profiles: null,
  maxLevel: null,
  hdr: null,
  dolbyVisionProfiles: null,
}

/**
 * The profiles of a codec that play, as decoders: one for each highest
 * level and bit depth, with the profiles that reach it.
 */
function profileDecoders(
  codec: string,
  found: readonly {
    profile: string
    level: number | null
    bitDepth: number | null
  }[],
  dolbyVisionProfiles: number[] | null,
): PlaybackDecoder[] {
  const groups = new Map<string, PlaybackDecoder>()
  for (const { profile, level, bitDepth } of found) {
    const key = `${level} ${bitDepth}`
    const group = groups.get(key)
    if (group) group.profiles?.push(profile)
    else {
      groups.set(key, {
        ...ANY,
        codec,
        profiles: [profile],
        maxLevel: level,
        maxBitDepth: bitDepth,
        dolbyVisionProfiles,
      })
    }
  }
  return [...groups.values()]
}

let decoders: PlaybackDecoder[] | null = null

/**
 * The video this browser decodes from a file, as `PlaybackDecoder` rules.
 * They ask the browser what it would have been asked of each file: the
 * codec, profile, and bit depth, at the highest level it takes. The HDR
 * format isn't something a browser says, so any plays, as before. Dolby
 * Vision plays through its base layer, except profile 5, which has none
 * other players can show.
 */
export function browserDecoders(): readonly PlaybackDecoder[] {
  if (decoders) return decoders
  const h264 = [...H264_PROFILES].flatMap(([profile, id]) => {
    const level = maxLevel(H264_LEVELS, (each) => h264Type(id, each))
    return level === null ? [] : [{ profile, level, bitDepth: null }]
  })
  const hevc = [...HEVC_PROFILES].flatMap(([profile, id]) => {
    const level = maxLevel(HEVC_LEVELS, (each) => hevcType(id, each))
    // Main 10 and Rext go to 10 bits, the rest to 8.
    const bitDepth = profile === "Main 10" || profile === "Rext" ? 10 : 8
    return level === null ? [] : [{ profile, level, bitDepth }]
  })
  const dolbyVision = [
    7,
    8,
    ...(plays('video/mp4; codecs="dvh1.05.06"') ? [5] : []),
  ]
  const av1 = [
    { profile: "Main", id: 0 },
    { profile: "High", id: 1 },
    { profile: "Professional", id: 2 },
  ].flatMap(({ profile, id }) =>
    // The level isn't asked, as before: browsers that play AV1 take any.
    plays(av1Type(id, false))
      ? [{ profile, level: null, bitDepth: plays(av1Type(id, true)) ? 10 : 8 }]
      : [],
  )
  decoders = [
    ...profileDecoders("h264", h264, null),
    ...profileDecoders("hevc", hevc, dolbyVision),
    ...profileDecoders("av1", av1, null),
    ...(plays(vp9Type(false))
      ? [{ ...ANY, codec: "vp9", maxBitDepth: plays(vp9Type(true)) ? 10 : 8 }]
      : []),
    ...(plays(VP8_TYPE) ? [{ ...ANY, codec: "vp8" }] : []),
  ]
  return decoders
}

let browser: readonly TranscodeVideoCodec[] | null = null

/**
 * The codecs this browser plays an encode in. Encodes play as HLS, through
 * Media Source Extensions where the browser has them, as hls.js does, and
 * natively otherwise. Best first.
 */
export function browserVideoCodecs(): readonly TranscodeVideoCodec[] {
  if (browser) return browser
  const supported = (type: string) =>
    "MediaSource" in window ? MediaSource.isTypeSupported(type) : plays(type)
  browser = AUTO_ORDER.filter((codec) => {
    const type = ENCODE_TYPES.get(codec)
    return type !== undefined && supported(type)
  })
  return browser
}

/**
 * The codecs to ask an encode for, the one wanted first: this device's
 * pick, or for `auto` every codec the browser plays. H.264 is always there
 * to fall back on.
 */
export function encodeVideoCodecs(): TranscodeVideoCodec[] {
  const { videoCodec } = usePlayerPreferencesStore.getState()
  const usable = browserVideoCodecs()
  const wanted =
    videoCodec === "auto"
      ? [...usable]
      : usable.filter((codec) => codec === videoCodec)
  return wanted.includes("h264") ? wanted : [...wanted, "h264"]
}
