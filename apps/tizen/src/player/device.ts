import type { PlaybackDecoder, PlaybackDevice } from "@matinee/contracts"

import { language } from "@/i18n"
import { panelWidth, showsHdr, tizenVersion } from "@/platform/tizen"

import { AUTOMATIC } from "./prefs"

/*
 * What this TV plays, as `playback.start` takes it. The server decides
 * from it what plays as it is and what it converts.
 *
 * A Samsung TV doesn't say what its player decodes, so this goes by the
 * Tizen version and the panel, as Samsung's spec sheets and the Litefin
 * and Jellyfin clients' years of reports have it. Where they disagree it
 * leaves the format out: the server then converts it, which always plays,
 * where a file the TV can't decode would only fail.
 */

type TranscodeCodec = PlaybackDevice["encodeVideo"][number]
type StreamCodec = PlaybackDevice["streamAudio"][number]

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
 * Dolby Vision profiles whose base layer a plain HEVC decoder shows as
 * HDR10, HLG, or SDR. Profile 5 has none, and Samsung TVs have no Dolby
 * Vision decoder, so that one goes to the server.
 */
const DOLBY_VISION_BY_BASE_LAYER = [4, 7, 8, 9]

/** The profile for Samsung's own player, AVPlay, on Tizen `version`. */
function avplayDevice(version: number, videoCodec: string): PlaybackDevice {
  const width = panelWidth()
  const uhd = width >= 3840
  const size = { maxWidth: width, maxHeight: (width * 9) / 16 }
  const hdr: PlaybackDecoder["hdr"] = showsHdr()
    ? ["hdr10", "hlg", "dolby-vision"]
    : []
  const video: PlaybackDecoder[] = [
    {
      ...ANY,
      ...size,
      codec: "h264",
      // Samsung's H.264 decoders are 8-bit: High 10 files go to the server.
      maxBitDepth: 8,
      maxLevel: uhd ? 51 : 42,
      hdr,
    },
    {
      ...ANY,
      ...size,
      codec: "hevc",
      maxBitDepth: 10,
      profiles: ["Main", "Main 10"],
      maxLevel: uhd ? 183 : 123,
      hdr,
      dolbyVisionProfiles: DOLBY_VISION_BY_BASE_LAYER,
    },
    { ...ANY, ...size, codec: "vp9", maxBitDepth: 10, hdr },
    { ...ANY, ...size, codec: "vp8", hdr: [] },
    { ...ANY, ...size, codec: "mpeg2video", maxBitDepth: 8, hdr: [] },
    // AV1 came with the 2020 models.
    ...(version >= 5.5
      ? [{ ...ANY, ...size, codec: "av1", maxBitDepth: 10, hdr }]
      : []),
    // VC-1 went with the 2025 models.
    ...(version < 9
      ? [{ ...ANY, ...size, codec: "vc1", maxBitDepth: 8, hdr: [] }]
      : []),
  ]
  // What AVPlay decodes in a file. FLAC and PCM are left out: beside
  // video they drift out of step or stay silent on these TVs. Samsung
  // dropped DTS with the 2018 models and never had TrueHD.
  const audio = [
    "aac",
    "mp3",
    "mp2",
    "ac3",
    "eac3",
    "vorbis",
    ...(version >= 4 ? ["opus", "ac4"] : ["dts"]),
    ...(version < 9 ? ["wmav2", "wmapro"] : []),
  ]
  // What it takes in the MP4 stream a remux is. E-AC-3 there stays silent
  // before the 2021 models.
  const streamAudio: StreamCodec[] = [
    "aac",
    "ac3",
    ...(version >= 6 ? ["eac3" as const] : []),
  ]
  const encodable: TranscodeCodec[] = [
    "h264",
    "hevc",
    ...(version >= 5.5 ? ["av1" as const] : []),
  ]
  const first = encodable.find((codec) => codec === videoCodec)
  return {
    containers: [
      "mkv",
      "mp4",
      "m4v",
      "mov",
      "webm",
      "ts",
      "m2ts",
      "mts",
      "avi",
      "mpg",
      "mpeg",
      "flv",
      "3gp",
      "vob",
      ...(version < 9 ? ["wmv", "asf"] : []),
    ],
    video,
    audio,
    streamAudio,
    // H.264 plays everywhere, so it comes right after the codec settings ask for.
    encodeVideo: [
      ...new Set([...(first ? [first] : []), "h264" as const, ...encodable]),
    ],
    // AVPlay reads the fragmented MP4 segments of the server's HLS from
    // the 2021 models on. Before, an encode comes as one stream.
    hls: version >= 6,
    selectAudio: true,
    // The app draws WebVTT itself. AVPlay draws no picture subtitles, so
    // those are burned in by the server.
    subtitles: ["webvtt"],
    sidecarSubtitles: [],
    embeddedSubtitles: [],
    language,
  }
}

/** Whether the browser says it may play `type` from a file. */
function plays(probe: HTMLVideoElement, type: string): boolean {
  return probe.canPlayType(type) !== ""
}

/**
 * The profile for the browser's own video element, which plays where
 * there's no AVPlay: in a browser, during development. It asks the
 * browser what it plays, roughly, as the web app does in full.
 */
function browserDevice(videoCodec: string): PlaybackDevice {
  const probe = document.createElement("video")
  const video: PlaybackDecoder[] = [
    ...(plays(probe, 'video/mp4; codecs="avc1.640028"')
      ? [{ ...ANY, codec: "h264", maxBitDepth: 8 }]
      : []),
    ...(plays(probe, 'video/mp4; codecs="hvc1.1.6.L120.90"')
      ? [
          {
            ...ANY,
            codec: "hevc",
            maxBitDepth: 10,
            dolbyVisionProfiles: [7, 8],
          },
        ]
      : []),
    ...(plays(probe, 'video/mp4; codecs="av01.0.08M.08"')
      ? [{ ...ANY, codec: "av1", maxBitDepth: 10 }]
      : []),
    ...(plays(probe, 'video/webm; codecs="vp09.00.40.08"')
      ? [{ ...ANY, codec: "vp9" }]
      : []),
  ]
  const streamAudio: StreamCodec[] = [
    ...(plays(probe, 'audio/mp4; codecs="opus"') ? ["opus" as const] : []),
    "aac",
    ...(plays(probe, 'audio/mp4; codecs="ac-3"') ? ["ac3" as const] : []),
    ...(plays(probe, 'audio/mp4; codecs="ec-3"') ? ["eac3" as const] : []),
  ]
  const encodable = video
    .map((decoder) => decoder.codec)
    .filter((codec): codec is TranscodeCodec => codec !== "vp9")
  const first = encodable.find((codec) => codec === videoCodec)
  return {
    containers: [
      ...(plays(probe, "video/mp4") ? ["mp4", "m4v", "mov"] : []),
      ...(plays(probe, "video/webm") ? ["webm"] : []),
      ...(plays(probe, "video/x-matroska") ? ["mkv"] : []),
    ],
    video,
    audio: [...streamAudio, "mp3", "flac"],
    streamAudio,
    encodeVideo: [
      ...new Set([...(first ? [first] : []), "h264" as const, ...encodable]),
    ],
    // Only where the element reads a playlist itself.
    hls: plays(probe, "application/vnd.apple.mpegurl"),
    // A browser plays only a file's default audio track.
    selectAudio: false,
    subtitles: ["webvtt"],
    sidecarSubtitles: [],
    embeddedSubtitles: [],
    language,
  }
}

/** Whether Samsung's own player is there to play with. */
export function hasAvplay(): boolean {
  return window.webapis?.avplay !== undefined
}

/**
 * What this TV plays, after its settings: `videoCodec` is the codec
 * encodes should come in, or `auto`.
 */
export function playbackDevice(videoCodec: string = AUTOMATIC): PlaybackDevice {
  return hasAvplay()
    ? // A TV that won't say its version is taken for the oldest the app runs on.
      avplayDevice(tizenVersion ?? 4, videoCodec)
    : browserDevice(videoCodec)
}

/** The codecs of the server's an encode could come in that this TV decodes. */
export function encodeVideoChoices(server: readonly string[]): string[] {
  return playbackDevice().encodeVideo.filter((codec) => server.includes(codec))
}
