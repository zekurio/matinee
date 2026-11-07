import type { TranscodeVideoCodec, VideoStream } from "@matinee/contracts"

import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import { orpc, queryClient } from "./rpc"

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

const H264_PROFILES = new Map([
  ["Baseline", "42"],
  ["Constrained Baseline", "42"],
  ["Main", "4d"],
  ["Extended", "58"],
  ["High", "64"],
  ["High 10", "6e"],
  ["High 4:2:2", "7a"],
  ["High 4:4:4 Predictive", "f4"],
])

/**
 * The file's video as an MP4 MIME type, from what ffprobe read, or null
 * for a codec no browser plays without help.
 */
function videoType(video: VideoStream): string | null {
  const tenBit = (video.bitDepth ?? 8) > 8
  switch (video.codec) {
    case "h264": {
      const profile = H264_PROFILES.get(video.profile ?? "High") ?? "64"
      const level = (video.level ?? 40).toString(16).padStart(2, "0")
      return `video/mp4; codecs="avc1.${profile}00${level}"`
    }
    case "hevc": {
      const level = video.level ?? 120
      return tenBit || video.profile === "Main 10"
        ? `video/mp4; codecs="hvc1.2.4.L${level}.B0"`
        : `video/mp4; codecs="hvc1.1.6.L${level}.B0"`
    }
    case "av1":
      return `video/mp4; codecs="av01.0.08M.${tenBit ? "10" : "08"}"`
    case "vp9":
      return tenBit
        ? 'video/mp4; codecs="vp09.02.40.10"'
        : 'video/mp4; codecs="vp09.00.40.08"'
    case "vp8":
      return 'video/webm; codecs="vp8"'
    default:
      return null
  }
}

/**
 * Whether this browser decodes the file's video as it is. One that can't
 * often plays the audio over a black picture instead of failing, so the
 * player must know before it picks a source.
 */
export function decodesVideo(video: VideoStream | null | undefined): boolean {
  if (!video) return true
  const type = videoType(video)
  if (!type) return false
  return document.createElement("video").canPlayType(type) !== ""
}

let browser: readonly TranscodeVideoCodec[] | null = null

/**
 * The codecs this browser plays an encode in. Encodes play as HLS, through
 * Media Source Extensions where the browser has them, as hls.js does, and
 * natively otherwise. Best first.
 */
export function browserVideoCodecs(): readonly TranscodeVideoCodec[] {
  if (browser) return browser
  const probe = document.createElement("video")
  const plays = (type: string) =>
    "MediaSource" in window
      ? MediaSource.isTypeSupported(type)
      : probe.canPlayType(type) !== ""
  browser = AUTO_ORDER.filter((codec) => {
    const type = ENCODE_TYPES.get(codec)
    return type !== undefined && plays(type)
  })
  return browser
}

/**
 * The codecs to ask an encode for, the one wanted first: this device's
 * pick, or for `auto` every codec the browser plays. `server` narrows it
 * to what the server encodes, once that's known. H.264 is always there to
 * fall back on.
 */
export function encodeVideoCodecs(
  server?: readonly TranscodeVideoCodec[],
): TranscodeVideoCodec[] {
  const { videoCodec } = usePlayerPreferencesStore.getState()
  const usable = browserVideoCodecs().filter(
    (codec) => !server || server.includes(codec),
  )
  const wanted =
    videoCodec === "auto"
      ? usable
      : usable.filter((codec) => codec === videoCodec)
  return wanted.includes("h264") ? wanted : [...wanted, "h264"]
}

/**
 * The codec an encode comes in, as the server picks it from
 * `encodeVideoCodecs()`, once `playback.options` has said what it makes.
 * H.264 until then.
 */
export function expectedEncodeCodec(): TranscodeVideoCodec {
  const server = queryClient.getQueryData(
    orpc.playback.options.queryKey(),
  )?.videoCodecs
  return (server && encodeVideoCodecs(server)[0]) ?? "h264"
}
