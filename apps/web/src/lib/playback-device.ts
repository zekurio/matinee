import {
  PLAYBACK_AUDIO_CODECS,
  type PlaybackAudioCodec,
  type PlaybackDevice,
  TRANSCODE_VIDEO_CODECS,
  type TranscodeVideoCodec,
} from "@matinee/contracts"

import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import {
  browserAudioCodecs,
  decodableAudioCodecs,
  OPTIONAL_PASSTHROUGH,
} from "./audio-support"
import { desktop } from "./desktop"
import { deviceLanguage } from "./languages"
import {
  browserDecoders,
  browserVideoCodecs,
  encodeVideoCodecs,
} from "./video-support"

/**
 * The MIME types a browser may know each container by, as the server
 * names containers: by the file's extension. QuickTime is MP4's parent,
 * so a browser that plays MP4 reads it too.
 */
const CONTAINER_TYPES = new Map([
  ["mp4", ["video/mp4"]],
  ["m4v", ["video/mp4"]],
  ["mov", ["video/quicktime", "video/mp4"]],
  ["webm", ["video/webm"]],
  ["mkv", ["video/x-matroska"]],
  ["ogv", ["video/ogg"]],
  ["ts", ["video/mp2t"]],
  ["m2ts", ["video/mp2t"]],
  ["mts", ["video/mp2t"]],
  ["avi", ["video/x-msvideo"]],
  ["mpg", ["video/mpeg"]],
  ["mpeg", ["video/mpeg"]],
  ["wmv", ["video/x-ms-wmv"]],
  ["flv", ["video/x-flv"]],
])

/** What only the browser decides, asked once. */
type Browser = Pick<
  PlaybackDevice,
  "containers" | "video" | "hls" | "subtitles" | "language"
>

let browser: Browser | null = null

function browserPlayback(): Browser {
  if (browser) return browser
  const probe = document.createElement("video")
  browser = {
    containers: [...CONTAINER_TYPES]
      .filter(([, types]) =>
        types.some((type) => probe.canPlayType(type) !== ""),
      )
      .map(([container]) => container),
    video: [...browserDecoders()],
    // hls.js plays it through Media Source Extensions, and Safari natively.
    hls:
      "MediaSource" in window ||
      "ManagedMediaSource" in window ||
      probe.canPlayType("application/vnd.apple.mpegurl") !== "",
    // The player draws both over any source, PGS with libpgs.
    subtitles: ["webvtt", "pgs", "ass"],
    language: deviceLanguage(),
  }
  return browser
}

/** What this browser plays for a download, without player conversion settings. */
export function downloadDevice(): PlaybackDevice {
  const encodes = browserVideoCodecs()
  const audio = [...browserAudioCodecs()]
  return {
    ...browserPlayback(),
    audio,
    streamAudio: audio,
    encodeVideo: encodes.includes("h264") ? [...encodes] : [...encodes, "h264"],
    selectAudio: false,
    sidecarSubtitles: [],
    embeddedSubtitles: [],
  }
}

let cached: { key: string; device: PlaybackDevice } | null = null

/**
 * The audio codecs mpv's FFmpeg decodes, for when settings convert some
 * of them: the profile says every codec or a list, not every codec but a
 * few. The same list as the Android app's for mpv.
 */
const MPV_AUDIO = [
  "aac",
  "mp3",
  "mp2",
  "mp1",
  "opus",
  "vorbis",
  "flac",
  "alac",
  "ac3",
  "eac3",
  "dts",
  "truehd",
  "mlp",
  "wmav1",
  "wmav2",
  "wmapro",
  "wmalossless",
  "amr_nb",
  "amr_wb",
  "ape",
  "wavpack",
  "tta",
  "cook",
  "speex",
]

/**
 * The audio codecs the player takes as they are, before settings convert
 * any: what this browser plays, or every one in the desktop app.
 */
export function playerAudioCodecs(): readonly PlaybackAudioCodec[] {
  return desktop ? PLAYBACK_AUDIO_CODECS : browserAudioCodecs()
}

/**
 * The codecs an encode may come in here, the one `auto` picks first. mpv
 * plays all of them, and H.264 first, as the Android app asks with mpv.
 */
export function encodeCodecs(): readonly TranscodeVideoCodec[] {
  return desktop ? TRANSCODE_VIDEO_CODECS : browserVideoCodecs()
}

/**
 * What mpv plays in the desktop app: everything, but the audio this
 * device's settings convert, with the codecs in the order they ask for.
 */
function mpvDevice(): PlaybackDevice {
  const { audioCodec, videoCodec, convertAudio } =
    usePlayerPreferencesStore.getState()
  const converted = convertAudio.filter((codec) =>
    OPTIONAL_PASSTHROUGH.includes(codec),
  )
  const takes = (codec: string) => !converted.some((entry) => entry === codec)
  // AAC always plays, and the server converts to the first of these it
  // encodes.
  const stream = PLAYBACK_AUDIO_CODECS.filter(
    (codec) => codec === "aac" || takes(codec),
  )
  const firstAudio = stream.find((codec) => codec === audioCodec)
  const firstVideo = TRANSCODE_VIDEO_CODECS.find(
    (codec) => codec === videoCodec,
  )
  return {
    containers: ["*"],
    video: [
      {
        codec: "*",
        maxWidth: null,
        maxHeight: null,
        maxBitDepth: null,
        profiles: null,
        maxLevel: null,
        hdr: null,
        dolbyVisionProfiles: null,
      },
    ],
    audio:
      converted.length === 0 ? ["*"] : [...MPV_AUDIO.filter(takes), "pcm_*"],
    streamAudio: firstAudio
      ? [firstAudio, ...stream.filter((codec) => codec !== firstAudio)]
      : stream,
    // H.264 plays everywhere, so it comes right after the codec settings
    // ask for.
    encodeVideo: [
      ...new Set([
        ...(firstVideo ? [firstVideo] : []),
        "h264" as const,
        ...TRANSCODE_VIDEO_CODECS,
      ]),
    ],
    hls: true,
    // mpv picks the track inside the file.
    selectAudio: true,
    // It draws all three from the server over any source, and every
    // stream of a file that plays as it is.
    subtitles: ["webvtt", "pgs", "ass"],
    sidecarSubtitles: [],
    embeddedSubtitles: ["*"],
    language: deviceLanguage(),
  }
}

/**
 * What this browser plays, as `playback.start` takes it, after this
 * device's player settings: the audio they convert is left out, and the
 * codecs come in the order they ask for. Built once, and again only when
 * those settings change, so every call sends the same profile. In the
 * desktop app, what mpv plays.
 */
export function playbackDevice(): PlaybackDevice {
  const { audioCodec, videoCodec, convertAudio } =
    usePlayerPreferencesStore.getState()
  const key = JSON.stringify([audioCodec, videoCodec, convertAudio])
  if (cached?.key === key) return cached.device
  if (desktop) {
    cached = { key, device: mpvDevice() }
    return cached.device
  }
  const audio = [...decodableAudioCodecs()]
  const device: PlaybackDevice = {
    ...browserPlayback(),
    audio,
    streamAudio: audio,
    encodeVideo: encodeVideoCodecs(),
    // A browser plays only a file's default audio track.
    selectAudio: false,
    sidecarSubtitles: [],
    // It never shows the subtitles inside a file itself.
    embeddedSubtitles: [],
  }
  cached = { key, device }
  return device
}
