import {
  PlaybackAudioCodec,
  PlaybackQuality,
  TRANSCODE_AUDIO_CODECS,
  TRANSCODE_VIDEO_CODECS,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import { createPlainStore, type PlainStore, storeHook } from "./plain-store"

const PLAYER_KEY = "matinee.player"

/** The codec encodes come in, or `auto` for the best one both ends have. */
export const VideoCodecChoice = t.enum(["auto", ...TRANSCODE_VIDEO_CODECS])
export type VideoCodecChoice = t.infer<typeof VideoCodecChoice>

/** The codec streams convert audio to, or `auto` for Opus where it plays. */
export const AudioCodecChoice = t.enum(["auto", ...TRANSCODE_AUDIO_CODECS])
export type AudioCodecChoice = t.infer<typeof AudioCodecChoice>

/**
 * What the player keeps between files on this device. A field that is
 * missing or wrong falls back on its own, so the others survive. The
 * codecs stay with the device, since another one may play other codecs.
 */
const PlayerPreferences = t.object({
  quality: PlaybackQuality.$default("original").catch("original"),
  volume: t.number().min(0).max(1).$default(1).catch(1),
  muted: t.boolean().$default(false).catch(false),
  videoCodec: VideoCodecChoice.$default("auto").catch("auto"),
  audioCodec: AudioCodecChoice.$default("auto").catch("auto"),
  /** Codecs this browser plays that streams convert anyway. */
  convertAudio: t.array(PlaybackAudioCodec).$default([]).catch([]),
  /** At an episode's end, the next one starts after a countdown. */
  autoplayNext: t.boolean().$default(true).catch(true),
})
type PlayerPreferences = t.infer<typeof PlayerPreferences>

/** The settings for how this device plays, which the settings panel edits. */
type DevicePlayback = Pick<
  PlayerPreferences,
  "quality" | "videoCodec" | "audioCodec" | "convertAudio" | "autoplayNext"
>

const DEFAULTS: PlayerPreferences = {
  quality: "original",
  volume: 1,
  muted: false,
  videoCodec: "auto",
  audioCodec: "auto",
  convertAudio: [],
  autoplayNext: true,
}

type PlayerPreferencesState = PlayerPreferences & {
  setQuality: (quality: PlaybackQuality) => void
  setVolume: (volume: number, muted: boolean) => void
  setDevicePlayback: (change: Partial<DevicePlayback>) => void
}

/** The bare value in localStorage, as the React app's store keeps it. */
function load(): PlayerPreferences {
  try {
    const stored = window.localStorage.getItem(PLAYER_KEY)
    if (stored === null) return DEFAULTS
    const parsed = PlayerPreferences.safeParse(JSON.parse(stored))
    return parsed.success ? parsed.data : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

function save(state: PlayerPreferences) {
  const kept: PlayerPreferences = {
    quality: state.quality,
    volume: state.volume,
    muted: state.muted,
    videoCodec: state.videoCodec,
    audioCodec: state.audioCodec,
    convertAudio: state.convertAudio,
    autoplayNext: state.autoplayNext,
  }
  try {
    window.localStorage.setItem(PLAYER_KEY, JSON.stringify(kept))
  } catch {
    // Storage is off or full. The choice still holds for this file.
  }
}

const store: PlainStore<PlayerPreferencesState> =
  createPlainStore<PlayerPreferencesState>({
    ...load(),
    setQuality: (quality: PlaybackQuality) => change({ quality }),
    setVolume: (volume: number, muted: boolean) => change({ volume, muted }),
    setDevicePlayback: (next: Partial<DevicePlayback>) => change(next),
  })

// Every write is saved, an empty one too, which drops keys the store no
// longer keeps.
function change(next: Partial<PlayerPreferences>) {
  store.setState(next)
  save(store.getState())
}

/**
 * The quality, volume, and mute the next file starts with, the codecs this
 * device asks for, and whether the next episode starts on its own. The
 * player reads them as it mounts and writes the first three as they
 * change; the settings panel edits the rest. How far skips go follows the
 * account, in `PlaybackPreferences`.
 */
export const usePlayerPreferencesStore = storeHook(store)

// A change made in another tab applies here too.
window.addEventListener("storage", (event) => {
  if (event.key === null || event.key === PLAYER_KEY) store.setState(load())
})
