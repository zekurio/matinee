import type { PlaybackDevice } from "@matinee/contracts"

import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import { browserAudioCodecs, decodableAudioCodecs } from "./audio-support"
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
    subtitles: ["webvtt", "pgs"],
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
 * What this browser plays, as `playback.start` takes it, after this
 * device's player settings: the audio they convert is left out, and the
 * codecs come in the order they ask for. Built once, and again only when
 * those settings change, so every call sends the same profile.
 */
export function playbackDevice(): PlaybackDevice {
  const { audioCodec, videoCodec, convertAudio } =
    usePlayerPreferencesStore.getState()
  const key = JSON.stringify([audioCodec, videoCodec, convertAudio])
  if (cached?.key === key) return cached.device
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
