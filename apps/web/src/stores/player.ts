import type { PlaybackPreferences, PlaybackQuality } from "@matinee/contracts"
import type { LucideIcon } from "lucide-react"
import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

import type { PlaybackSource } from "@/components/playback-source"

/** A note over the picture, like the volume after a key press. */
type Flash = { id: number; Icon: LucideIcon | null; text: string }

/** What a player starts with, from its props and the saved preferences. */
export type PlayerStart = {
  /** Names this sitting with the file, for statistics. */
  sessionId: string
  quality: PlaybackQuality
  /**
   * Null until there is something to play. A stream waits for the audio
   * tracks, since it carries one of them.
   */
  source: PlaybackSource | null
  duration: number
  volume: number
  muted: boolean
  /**
   * The language the audio plays in when the file has it, from the
   * preferences as the file started. Null plays the file's default.
   */
  audioLanguage: string | null
  /** The preferences as the file started; they pick the subtitles. */
  subtitleDefaults: PlaybackPreferences
}

export type PlayerState = PlayerStart & {
  // The video's own state, mirrored through its events.
  /** Playing, or set to play once the source on its way loads. */
  playing: boolean
  /** Played to the end, and not started or moved since. */
  ended: boolean
  /** Loading or buffering. */
  waiting: boolean
  /** Seconds into the file at the last time update or seek. */
  time: number
  /** How far the file is buffered past where it plays, in its own time. */
  buffered: number
  speed: number

  // The controls.
  /** Where the seek bar is dragged to, until it's let go. */
  scrub: number | null
  /** The pointer and keyboard have rested a while. */
  idle: boolean
  /** Keyboard focus is in the controls. */
  focused: boolean
  /** The id of the menu that is open. */
  openMenu: string | null
  flash: Flash | null

  // The source.
  /** The audio track the viewer picked. Null plays the preferred one. */
  chosenAudio: number | null
  /** Where a switch is headed, shown until the new source loads. */
  pending: number | null
  /** The file failed to play as it is, so only streams are left. */
  directFailed: boolean

  // Subtitles.
  /**
   * The viewer's pick in this file, null for off. Undefined until they
   * pick, which shows the default track.
   */
  chosenSubtitle: string | null | undefined
  /** The last track picked in this file, which C brings back. */
  pickedSubtitle: string | null
  /**
   * The picked track when only an encode shows it, so every source is an
   * encode with it burned in. Null draws subtitles over the video.
   */
  burnIn: string | null
  /** The shown track's WebVTT as an object URL, once it has arrived. */
  subtitleUrl: { trackId: string; url: string } | null
  /**
   * Milliseconds the viewer moved the subtitles by in this file, later
   * when positive. Burned-in subtitles can't move.
   */
  subtitleDelay: number
  /** The playback stats show over the picture. */
  statsOpen: boolean

  setPlaying: (playing: boolean) => void
  setEnded: (ended: boolean) => void
  /** For the video's `pause`, when the player wasn't holding it still. */
  paused: () => void
  setWaiting: (waiting: boolean) => void
  setTime: (time: number) => void
  setDuration: (duration: number) => void
  setBuffered: (buffered: number) => void
  setVolume: (volume: number, muted: boolean) => void
  setSpeed: (speed: number) => void
  setScrub: (scrub: number | null) => void
  /** Ends a drag of the seek bar at `time`. */
  commitScrub: (time: number) => void
  setIdle: (idle: boolean) => void
  setFocused: (focused: boolean) => void
  /**
   * Opens or closes a menu by its id. Closing one that isn't open does
   * nothing, so a menu opened as another closes stays open.
   */
  setMenuOpen: (menu: string, open: boolean) => void
  showFlash: (Icon: LucideIcon | null, text: string) => void
  hideFlash: () => void
  setQuality: (quality: PlaybackQuality) => void
  setChosenAudio: (index: number | null) => void
  setSource: (source: PlaybackSource | null) => void
  setPending: (at: number | null) => void
  /**
   * The file doesn't play as it is: drop it for an encode at `quality`.
   * The cleared source is picked again once the tracks are here.
   */
  failDirect: (quality: PlaybackQuality) => void
  /**
   * Back to the original quality and the default audio, and subtitles that
   * don't need an encode.
   */
  revert: () => void
  /** Shows a subtitle track, or none for null. */
  chooseSubtitle: (trackId: string | null) => void
  setBurnIn: (trackId: string | null) => void
  /** Turns off a track that was burned in, which failed to encode. */
  dropBurnIn: () => void
  setSubtitleUrl: (url: { trackId: string; url: string } | null) => void
  setSubtitleDelay: (ms: number) => void
  setStatsOpen: (open: boolean) => void
}

export type PlayerStore = StoreApi<PlayerState>

/**
 * State for one player, made when it mounts: what the controls, menus, and
 * playback hooks share. The player remounts for another file, which starts
 * a fresh store.
 */
export function createPlayerStore(start: PlayerStart): PlayerStore {
  return createStore<PlayerState>()((set, get) => ({
    ...start,
    playing: false,
    ended: false,
    waiting: true,
    time: 0,
    buffered: 0,
    speed: 1,
    scrub: null,
    idle: false,
    focused: false,
    openMenu: null,
    flash: null,
    chosenAudio: null,
    pending: null,
    directFailed: false,
    chosenSubtitle: undefined,
    pickedSubtitle: null,
    burnIn: null,
    subtitleUrl: null,
    subtitleDelay: 0,
    statsOpen: false,

    setPlaying: (playing) => set({ playing }),
    setEnded: (ended) => set({ ended }),
    paused: () => set({ playing: false, waiting: false }),
    setWaiting: (waiting) => set({ waiting }),
    setTime: (time) => set({ time }),
    setDuration: (duration) => set({ duration }),
    setBuffered: (buffered) => set({ buffered }),
    setVolume: (volume, muted) => set({ volume, muted }),
    setSpeed: (speed) => set({ speed }),
    setScrub: (scrub) => set({ scrub }),
    commitScrub: (time) => set({ time, scrub: null }),
    // Every pointer move wakes the controls; only a change tells anyone.
    setIdle: (idle) => {
      if (get().idle !== idle) set({ idle })
    },
    setFocused: (focused) => set({ focused }),
    setMenuOpen: (menu, open) =>
      set((state) => ({
        openMenu: open ? menu : state.openMenu === menu ? null : state.openMenu,
      })),
    showFlash: (Icon, text) =>
      set((state) => ({
        flash: { id: (state.flash?.id ?? 0) + 1, Icon, text },
      })),
    hideFlash: () => set({ flash: null }),
    setQuality: (quality) => set({ quality }),
    setChosenAudio: (chosenAudio) => set({ chosenAudio }),
    setSource: (source) => set({ source }),
    setPending: (pending) => set({ pending }),
    failDirect: (quality) => set({ directFailed: true, quality, source: null }),
    revert: () => {
      get().dropBurnIn()
      set({ chosenAudio: null, quality: "original" })
    },
    chooseSubtitle: (trackId) =>
      set((state) => ({
        chosenSubtitle: trackId,
        pickedSubtitle: trackId ?? state.pickedSubtitle,
      })),
    setBurnIn: (burnIn) => set({ burnIn }),
    dropBurnIn: () =>
      set((state) =>
        state.burnIn === null
          ? {}
          : {
              burnIn: null,
              chosenSubtitle:
                state.chosenSubtitle === state.burnIn
                  ? null
                  : state.chosenSubtitle,
              // So C doesn't bring it back.
              pickedSubtitle:
                state.pickedSubtitle === state.burnIn
                  ? null
                  : state.pickedSubtitle,
            },
      ),
    setSubtitleUrl: (subtitleUrl) => set({ subtitleUrl }),
    setSubtitleDelay: (subtitleDelay) => set({ subtitleDelay }),
    setStatsOpen: (statsOpen) => set({ statsOpen }),
  }))
}

/**
 * The controls hide once the viewer rests while the video plays, unless
 * they're seeking, in the controls by keyboard, or in a menu.
 */
export function selectHidden(state: PlayerState): boolean {
  return (
    state.idle &&
    state.playing &&
    state.scrub === null &&
    !state.focused &&
    state.openMenu === null
  )
}

/** A source on its way, or the video waiting for data. */
export function selectBusy(state: PlayerState): boolean {
  return state.pending !== null || state.waiting
}

export const PlayerStoreContext = createContext<PlayerStore | null>(null)

/** The player's store, for reading it in callbacks. */
export function usePlayerStoreApi(): PlayerStore {
  const store = useContext(PlayerStoreContext)
  if (!store) throw new Error("usePlayerStore needs a player around it")
  return store
}

export function usePlayerStore<Slice>(
  selector: (state: PlayerState) => Slice,
): Slice {
  return useStore(usePlayerStoreApi(), selector)
}
