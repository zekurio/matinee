import type {
  PlaybackDevice,
  PlaybackMethod,
  PlaybackQuality,
  PlaybackStart,
} from "@matinee/contracts"
import type { LucideIcon } from "lucide-react"
import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

import type {
  PlaybackPicks,
  PlaybackSource,
} from "@/components/playback-source"

/** A note over the picture, like the volume after a key press. */
type Flash = { id: number; Icon: LucideIcon | null; text: string }

/** What a player starts with: the first answer and the saved preferences. */
export type PlayerStart = {
  itemId: string
  /** Names this sitting with the file, for statistics and streams. */
  sessionId: string
  /** What this browser plays, the same for the whole sitting. */
  device: PlaybackDevice
  /**
   * The server's latest answer for how the file plays: the tracks, the
   * subtitle, and the source it last loaded.
   */
  plan: PlaybackStart
  /** What the video loads now. */
  source: PlaybackSource
  /** What the viewer picked, which every start carries again. */
  picks: PlaybackPicks
  duration: number
  volume: number
  muted: boolean
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
  /** The quality in the menu: the one that plays, or the one on its way. */
  quality: PlaybackQuality
  /** The methods that failed in this sitting, which the server skips. */
  failed: PlaybackMethod[]
  /** Where a switch is headed, shown until the new source loads. */
  pending: number | null

  // Subtitles.
  /** The last track picked in this file, which C brings back. */
  pickedSubtitle: string | null
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
  /** Takes an answer, with the source to load when it needs a new one. */
  setPlan: (plan: PlaybackStart, source?: PlaybackSource) => void
  setSource: (source: PlaybackSource) => void
  /** Changes some of the viewer's picks. */
  pick: (change: PlaybackPicks) => void
  /** Puts the picks and failures back as they were, for a switch that failed. */
  restore: (picks: PlaybackPicks, failed: PlaybackMethod[]) => void
  addFailed: (method: PlaybackMethod) => void
  setQuality: (quality: PlaybackQuality) => void
  setPending: (at: number | null) => void
  /** The last track the viewer turned on, for C. */
  setPickedSubtitle: (trackId: string) => void
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
    quality: start.plan.quality,
    failed: [],
    pending: null,
    pickedSubtitle: null,
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
    setPlan: (plan, source) =>
      set(
        source
          ? { plan, source, quality: plan.quality }
          : { plan, quality: plan.quality },
      ),
    setSource: (source) => set({ source }),
    pick: (change) =>
      set((state) => ({ picks: { ...state.picks, ...change } })),
    restore: (picks, failed) => set({ picks, failed }),
    addFailed: (method) =>
      set((state) =>
        state.failed.includes(method)
          ? {}
          : { failed: [...state.failed, method] },
      ),
    setQuality: (quality) => set({ quality }),
    setPending: (pending) => set({ pending }),
    setPickedSubtitle: (pickedSubtitle) => set({ pickedSubtitle }),
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

/** The audio track in the menu: the viewer's pick, else the one that plays. */
export function selectAudio(state: PlayerState): number | null {
  return state.picks.audio ?? state.plan.audio?.index ?? null
}

/** The subtitle in the menu: the viewer's pick, else the one that shows. */
export function selectSubtitle(state: PlayerState): string | null {
  return state.picks.subtitle
    ? state.picks.subtitle.trackId
    : (state.plan.subtitle?.id ?? null)
}

/** The subtitle is part of the picture, so it can't move. */
export function selectBurnedIn(state: PlayerState): boolean {
  return state.plan.subtitleMode === "burn-in"
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
