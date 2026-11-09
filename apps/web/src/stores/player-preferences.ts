import {
  PlaybackAudioCodec,
  PlaybackQuality,
  TRANSCODE_AUDIO_CODECS,
  TRANSCODE_VIDEO_CODECS,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { create } from "zustand"
import { type PersistStorage, persist } from "zustand/middleware"

const PLAYER_KEY = "matinee.player"

/** The codec encodes come in, or `auto` for the best one both ends have. */
export const VideoCodecChoice = t.enum(["auto", ...TRANSCODE_VIDEO_CODECS])
export type VideoCodecChoice = t.infer<typeof VideoCodecChoice>

/** The codec streams convert audio to, or `auto` for Opus where it plays. */
export const AudioCodecChoice = t.enum(["auto", ...TRANSCODE_AUDIO_CODECS])
export type AudioCodecChoice = t.infer<typeof AudioCodecChoice>

/** How far the skip buttons and keys can move, in seconds. */
export const SKIP_STEPS = [5, 10, 15, 30] as const

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
  /** Seconds the skip buttons and keys move, one of `SKIP_STEPS`. */
  skipSeconds: t.number().int().min(1).max(60).$default(10).catch(10),
  /** At an episode's end, the next one starts after a countdown. */
  autoplayNext: t.boolean().$default(true).catch(true),
})
type PlayerPreferences = t.infer<typeof PlayerPreferences>

/** The settings for how this device plays, which the settings panel edits. */
type DevicePlayback = Pick<
  PlayerPreferences,
  | "quality"
  | "videoCodec"
  | "audioCodec"
  | "convertAudio"
  | "skipSeconds"
  | "autoplayNext"
>

const DEFAULTS: PlayerPreferences = {
  quality: "original",
  volume: 1,
  muted: false,
  videoCodec: "auto",
  audioCodec: "auto",
  convertAudio: [],
  skipSeconds: 10,
  autoplayNext: true,
}

/**
 * localStorage holding the bare value, as the player stored it before these
 * stores, rather than persist's `{ state, version }` wrapper. Each store's
 * `merge` parses what comes back.
 */
function bareStorage<Value>(): PersistStorage<Value> {
  return {
    getItem: (name) => {
      try {
        const stored = window.localStorage.getItem(name)
        return stored === null ? null : { state: JSON.parse(stored) }
      } catch {
        return null
      }
    },
    setItem: (name, { state }) => {
      try {
        window.localStorage.setItem(name, JSON.stringify(state))
      } catch {
        // Storage is off or full. The choice still holds for this file.
      }
    },
    removeItem: (name) => {
      try {
        window.localStorage.removeItem(name)
      } catch {
        // Storage is off; there is nothing to remove.
      }
    },
  }
}

type PlayerPreferencesState = PlayerPreferences & {
  setQuality: (quality: PlaybackQuality) => void
  setVolume: (volume: number, muted: boolean) => void
  setDevicePlayback: (change: Partial<DevicePlayback>) => void
}

/**
 * The quality, volume, and mute the next file starts with, the codecs this
 * device asks for, how far skips go, and whether the next episode starts
 * on its own. The player reads them as it mounts and writes the first
 * three as they change; the settings panel edits the rest.
 */
export const usePlayerPreferencesStore = create<PlayerPreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setQuality: (quality) => set({ quality }),
      setVolume: (volume, muted) => set({ volume, muted }),
      setDevicePlayback: (change) => set(change),
    }),
    {
      name: PLAYER_KEY,
      storage: bareStorage(),
      partialize: ({
        quality,
        volume,
        muted,
        videoCodec,
        audioCodec,
        convertAudio,
        skipSeconds,
        autoplayNext,
      }) => ({
        quality,
        volume,
        muted,
        videoCodec,
        audioCodec,
        convertAudio,
        skipSeconds,
        autoplayNext,
      }),
      merge: (stored, current) => {
        const parsed = PlayerPreferences.safeParse(stored)
        return { ...current, ...(parsed.success ? parsed.data : DEFAULTS) }
      },
    },
  ),
)

// A change made in another tab applies here too.
window.addEventListener("storage", (event) => {
  if (event.key === null || event.key === PLAYER_KEY) {
    void usePlayerPreferencesStore.persist.rehydrate()
  }
})
