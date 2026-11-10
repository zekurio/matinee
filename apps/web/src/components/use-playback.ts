import type { PlaybackQuality, PlaybackSnap } from "@matinee/contracts"
import { type RefObject, useEffect } from "react"
import { useShallow } from "zustand/shallow"

import {
  selectAudio as selectAudioOf,
  usePlayerStore,
  usePlayerStoreApi,
} from "@/stores/player"
import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import { dismissPlaybackNotices, lostNotice } from "./playback-notices"
import { canSeekTo, hasPlayed } from "./playback-source"
import {
  type PlaybackCore,
  playbackClock,
  type SourceStarters,
  sourceStarters,
  useSourceRefs,
} from "./use-playback-source"

export type PlaybackOptions = {
  video: RefObject<HTMLVideoElement | null>
  /** Nothing this browser can play is left. */
  onUnplayable: () => void
  /** A source failed and the server couldn't say what plays instead. */
  onFailed: (cause: unknown) => void
}

/**
 * Plays what the server says and seeks within it. The player tells
 * `playback.start` what the viewer picks, and loads the source it answers
 * with: the file as it is, a stream that copies the video, or an encode.
 * A copied stream can't seek by itself, so a seek outside what it has
 * buffered starts a new one from `playback.seek`. A source that fails asks
 * again with its method among the failed ones, and the server falls back.
 *
 * The answer, the source, and the viewer's picks live in the player's
 * store, so the functions here read it when they run and work from any
 * render.
 */
export function usePlayback(options: PlaybackOptions) {
  const { video } = options
  const store = usePlayerStoreApi()
  // The player's toasts are about this playback, so they go when it does.
  useEffect(() => () => dismissPlaybackNotices(), [])
  const refs = useSourceRefs(store)
  const core: PlaybackCore = {
    video,
    store,
    refs,
    onUnplayable: options.onUnplayable,
    onFailed: options.onFailed,
  }
  const { source, plan, quality } = usePlayerStore(
    useShallow((state) => ({
      source: state.source,
      plan: state.plan,
      quality: state.quality,
    })),
  )
  const clock = playbackClock(core)
  const starters = sourceStarters(core)
  const seek = seeker(core, clock, starters)
  const { selectAudio, selectQuality, selectSubtitle } = sourceSwitch(
    core,
    clock.now,
    starters,
  )
  const { onLoaded, onTimeUpdate, heldStill, setPlayOnLoad } = loadEvents(core)
  const onError = errorFallback(core, clock.position, starters)

  return {
    // The playlist goes to hls.js or the browser; the video gets no src.
    src: source.hls ? undefined : source.url,
    hls: source.hls
      ? { url: source.url, start: source.start, attempt: source.attempt }
      : null,
    source,
    plan,
    offset: source.offset,
    tracks: plan.audioTracks,
    quality,
    position: clock.position,
    duration: clock.duration,
    seek,
    selectAudio,
    selectQuality,
    selectSubtitle,
    onLoaded,
    onTimeUpdate,
    heldStill,
    setPlayOnLoad,
    onError,
  }
}

function seeker(
  { video, store, refs }: PlaybackCore,
  { duration }: ReturnType<typeof playbackClock>,
  { ask, seekStream }: SourceStarters,
) {
  return (to: number, snap: PlaybackSnap = "nearest") => {
    const el = video.current
    if (!el) return
    const target = Math.max(0, Math.min(duration() || to, to))
    // An answer on its way would start where the viewer was, so ask again.
    if (refs.asking.current) {
      void ask({ at: target, snap, still: true })
      return
    }
    const { source } = store.getState()
    const inSource = target - source.offset
    // The file and HLS seek by themselves, and so does any stream within
    // what it buffered.
    if (source.method === "direct" || source.hls) {
      el.currentTime = inSource
      return
    }
    if (inSource >= 0 && canSeekTo(el, inSource)) {
      el.currentTime = inSource
      return
    }
    if (source.method === "remux") void seekStream(target, snap)
    // An encode that isn't HLS starts anywhere, from a new answer.
    else void ask({ at: target, snap, still: true })
  }
}

function sourceSwitch(
  { store }: PlaybackCore,
  now: () => number,
  { ask }: SourceStarters,
) {
  /** Plays another audio track. False when it's the one that plays. */
  const selectAudio = (index: number): boolean => {
    if (index === selectAudioOf(store.getState())) return false
    void ask({ picks: { audio: index }, at: now(), still: true })
    return true
  }

  const selectQuality = (next: PlaybackQuality) => {
    const state = store.getState()
    if (next === state.quality) return
    usePlayerPreferencesStore.getState().setQuality(next)
    void ask({ picks: { quality: next }, at: now(), still: true })
  }

  /** Shows a subtitle track, or none for null. */
  const selectSubtitle = (trackId: string | null | undefined) => {
    const state = store.getState()
    if (trackId != null) state.setPickedSubtitle(trackId)
    void ask({
      picks: trackId === undefined ? undefined : { subtitle: { trackId } },
      subtitlesOn: trackId === undefined,
      at: now(),
      still: false,
    })
  }

  return { selectAudio, selectQuality, selectSubtitle }
}

function loadEvents({ video, store, refs }: PlaybackCore) {
  const { seekOnLoad, startsAt, playOnLoad, holding, played } = refs

  /** For the video's `loadedmetadata`. */
  const onLoaded = () => {
    const el = video.current
    if (!el) return
    // A new source drops the hold's pause event if it hadn't fired yet.
    holding.current = false
    if (seekOnLoad.current !== null) {
      el.currentTime = seekOnLoad.current
      seekOnLoad.current = null
    }
    startsAt.current = null
    store.getState().setPending(null)
    if (playOnLoad.current) {
      el.play().catch(() => {
        // Autoplay is blocked until the viewer interacts; they press play.
      })
    }
  }

  /** For the video's `timeupdate`: notes the methods that play. */
  const onTimeUpdate = () => {
    const el = video.current
    const { method } = store.getState().source
    if (el && !played.current.has(method) && hasPlayed(el)) {
      played.current.add(method)
    }
  }

  /**
   * For the video's `pause`: whether the player paused it itself, holding
   * the old source still while a new one loads. Asking clears it.
   */
  const heldStill = () => {
    const held = holding.current
    holding.current = false
    return held
  }

  /** Whether the source on its way plays once it loads. */
  const setPlayOnLoad = (on: boolean) => {
    playOnLoad.current = on
  }

  return { onLoaded, onTimeUpdate, heldStill, setPlayOnLoad }
}

/**
 * For the video's `error`: ask the server what plays without the method
 * that failed, or offer the same source again when it played before.
 */
function errorFallback(
  { video, store, refs }: PlaybackCore,
  position: () => number,
  { ask }: SourceStarters,
) {
  const { played, playOnLoad, startsAt, handled } = refs

  return (reported?: number) => {
    const code = reported ?? video.current?.error?.code
    if (code === undefined || code === MediaError.MEDIA_ERR_ABORTED) return
    const state = store.getState()
    const { source, plan } = state
    if (handled.current === source) return
    handled.current = source
    state.setPending(null)
    // A source that failed before it loaded still owes its start.
    const at = startsAt.current ?? position()
    // The browser played this method already, so falling back to another
    // or giving up would be wrong. Offer the same one again.
    if (
      played.current.has(source.method) &&
      code !== MediaError.MEDIA_ERR_DECODE
    ) {
      lostNotice(() => {
        playOnLoad.current = true
        void ask({ at, still: true, reload: true })
      })
      return
    }
    void ask({ failed: { source, plan }, at, still: false })
  }
}
