import {
  PLAYBACK_AUDIO_CODECS,
  type PlaybackAudioCodec,
} from "@matinee/contracts"

import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import { orpc, queryClient } from "./rpc"

/** How an MP4 MIME type names each codec, in the spellings browsers accept. */
const MP4_NAMES = {
  opus: ["opus"],
  aac: ["mp4a.40.2"],
  mp3: ["mp4a.6B", "mp4a.69", "mp3"],
  flac: ["flac", "fLaC"],
  alac: ["alac"],
  ac3: ["ac-3"],
  eac3: ["ec-3"],
} satisfies Record<PlaybackAudioCodec, string[]>

/**
 * The codecs a viewer may have the server convert though the browser plays
 * them: surround it may not pass on well, and lossless that takes a lot of
 * bandwidth. Converting the rest would only lose quality.
 */
export const OPTIONAL_PASSTHROUGH: readonly PlaybackAudioCodec[] = [
  "ac3",
  "eac3",
  "flac",
  "alac",
]

let browser: readonly PlaybackAudioCodec[] | null = null

/** The audio codecs this browser plays in MP4, as ffprobe names them. */
export function browserAudioCodecs(): readonly PlaybackAudioCodec[] {
  if (browser) return browser
  const probe = document.createElement("video")
  browser = PLAYBACK_AUDIO_CODECS.filter((codec) =>
    MP4_NAMES[codec].some(
      (name) => probe.canPlayType(`audio/mp4; codecs="${name}"`) !== "",
    ),
  )
  return browser
}

/**
 * The audio codecs the player takes as they are: what the browser plays,
 * less what this device's settings convert. The codec the settings convert
 * to comes first, since a stream converts to the first one it can.
 */
export function decodableAudioCodecs(): readonly PlaybackAudioCodec[] {
  const { audioCodec, convertAudio } = usePlayerPreferencesStore.getState()
  const kept = browserAudioCodecs().filter(
    (codec) =>
      !(OPTIONAL_PASSTHROUGH.includes(codec) && convertAudio.includes(codec)),
  )
  if (audioCodec === "auto" || !kept.includes(audioCodec)) return kept
  return [audioCodec, ...kept.filter((codec) => codec !== audioCodec)]
}

/** Whether the player takes `codec`, ffmpeg's name for it, as it is. */
export function decodesAudio(codec: string): boolean {
  return decodableAudioCodecs().some((entry) => entry === codec)
}

/**
 * What the server turns a track the player doesn't take into, as
 * `buildAudioPipeline` picks it: the first of Opus and AAC on the list
 * that the server encodes, once `playback.options` has said which.
 */
export function convertedAudioCodec(): "opus" | "aac" {
  const server = queryClient.getQueryData(
    orpc.playback.options.queryKey(),
  )?.audioCodecs
  for (const codec of decodableAudioCodecs()) {
    if (
      (codec === "opus" || codec === "aac") &&
      server?.includes(codec) !== false
    ) {
      return codec
    }
  }
  return "aac"
}
