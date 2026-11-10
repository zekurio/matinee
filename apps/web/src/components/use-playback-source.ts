import type {
  PlaybackMethod,
  PlaybackSnap,
  PlaybackStart,
} from "@matinee/contracts"
import { type RefObject, useRef } from "react"

import { isUnplayable } from "@/lib/playback-start"
import { client } from "@/lib/rpc"
import type { PlayerStore } from "@/stores/player"

import {
  burnInFailedNotice,
  playbackNotice,
  qualityFailedNotice,
  switchFailedNotice,
} from "./playback-notices"
import {
  type PlaybackPicks,
  type PlaybackSource,
  sameSource,
  sourceOf,
} from "./playback-source"

/**
 * What the player remembers about the sources it starts, which nothing
 * renders. The source on screen and the viewer's picks are in the store.
 */
export function useSourceRefs(store: PlayerStore) {
  const { source } = store.getInitialState()
  // Where the source on its way plays from once it loads, in its own time.
  // A copied stream starts where it should by itself.
  const seekOnLoad = useRef<number | null>(
    source.method !== "remux" && source.start > 0 ? source.start : null,
  )
  // Where in the file the source on its way starts, until it loads, so a
  // failure before then still knows where the viewer was.
  const startsAt = useRef<number | null>(source.offset + source.start)
  // Whether the next source plays once it loads: at first, after a switch
  // made while playing, or as the viewer picks while it loads.
  const playOnLoad = useRef(true)
  // Set when the player pauses the old source to hold it still while a new
  // one is on its way, so that pause isn't taken for the viewer's.
  const holding = useRef(false)
  // Counts the requests for a source. Only the latest one's answer loads.
  const generation = useRef(0)
  // A `playback.start` is on its way.
  const asking = useRef(false)
  // The methods this browser has played. One that fails after it played
  // failed on the server or the network, not on the codecs: Chrome
  // reports a 500 from the server as a format error.
  const played = useRef(new Set<PlaybackMethod>())
  // The last source whose failure was handled. hls.js and the video can
  // both report one failure.
  const handled = useRef<PlaybackSource | null>(null)
  return {
    seekOnLoad,
    startsAt,
    playOnLoad,
    holding,
    generation,
    asking,
    played,
    handled,
  }
}

type SourceRefs = ReturnType<typeof useSourceRefs>

/** What the playback functions share. */
export type PlaybackCore = {
  video: RefObject<HTMLVideoElement | null>
  store: PlayerStore
  refs: SourceRefs
  /** Nothing this browser can play is left. */
  onUnplayable: () => void
  /** The source failed and the server couldn't say what plays instead. */
  onFailed: (cause: unknown) => void
}

/** Seconds into the file, and the file's length. */
export function playbackClock({ video, store, refs }: PlaybackCore) {
  /** Seconds into the file. */
  const position = (): number => {
    const el = video.current
    return el ? store.getState().source.offset + el.currentTime : 0
  }

  /**
   * Where the viewer is: where a switch is headed, else where the source
   * on its way starts, else the video.
   */
  const now = (): number =>
    store.getState().pending ?? refs.startsAt.current ?? position()

  const duration = (): number => {
    const el = video.current
    const { source, plan } = store.getState()
    const known =
      plan.item.durationSeconds ?? plan.item.probe?.format.durationSeconds
    if (source.method === "direct" && el && Number.isFinite(el.duration)) {
      return el.duration
    }
    if (known) return known
    return el && Number.isFinite(el.duration) ? source.offset + el.duration : 0
  }

  return { position, now, duration }
}

/** A `playback.start` with what changed since the last one. */
export type Ask = {
  /** The viewer's picks that change. */
  subtitlesOn?: boolean
  picks?: PlaybackPicks
  /** The source that just failed, whose method the server skips from now. */
  failed?: { source: PlaybackSource; plan: PlaybackStart }
  /** Seconds into the file to start from. */
  at: number
  snap?: PlaybackSnap
  /**
   * Hold the old picture still while the answer is on its way, rather
   * than play on from where the viewer left it. A subtitle the player
   * draws needs no new source, so it doesn't.
   */
  still: boolean
  /** Load the answer even when it's what plays, as a retry does. */
  reload?: boolean
}

/** Asking the server for a source, and loading what it answers. */
export function sourceStarters(core: PlaybackCore) {
  const { video, store, refs } = core
  const { generation, asking, seekOnLoad, startsAt, playOnLoad, holding } = refs

  /** Remember whether to keep playing across a reload. */
  const holdPlayState = () => {
    const el = video.current
    // A source still on its way keeps the state from before it.
    if (el && store.getState().pending === null && startsAt.current === null) {
      playOnLoad.current = !el.paused
    }
  }

  /** Pause the old source while a new one is on its way. */
  const holdStill = () => {
    const el = video.current
    if (el && !el.paused) {
      holding.current = true
      el.pause()
    }
  }

  /** Play on with the old source after a switch that left it. */
  const release = () => {
    const el = video.current
    if (el && el.paused && playOnLoad.current) void el.play().catch(() => {})
  }

  /** Load `next`, in place of what plays. */
  const load = (next: PlaybackSource, plan?: PlaybackStart) => {
    const state = store.getState()
    // The same address doesn't reload by itself.
    const reloads = !next.hls && state.source.url === next.url
    seekOnLoad.current =
      next.method !== "remux" && next.start > 0 ? next.start : null
    startsAt.current = next.offset + next.start
    if (state.pending === null) state.setPending(next.offset + next.start)
    if (plan) state.setPlan(plan, next)
    else state.setSource(next)
    if (reloads) video.current?.load()
  }

  /** Take an answer: a new source to load, or the tracks around this one. */
  const apply = (plan: PlaybackStart, ask: Ask, id: number) => {
    const state = store.getState()
    if (ask.subtitlesOn) {
      state.pick({ subtitle: { trackId: plan.subtitle?.id ?? null } })
      if (plan.subtitle) state.setPickedSubtitle(plan.subtitle.id)
    }
    const previous = state.plan
    if (!ask.reload && sameSource(previous, plan)) {
      state.setPlan(plan)
      state.setPending(null)
      release()
    } else load(sourceOf(plan, id), plan)
    // Only an encode burns a subtitle in, and only the viewer picks one.
    // When it failed, the server played on without it.
    const lost = ask.failed?.plan
    if (lost?.subtitleMode === "burn-in" && plan.subtitleMode !== "burn-in") {
      burnInFailedNotice()
      state.pick({ subtitle: { trackId: null } })
    } else if (
      lost &&
      state.picks.quality !== undefined &&
      state.picks.quality !== "original" &&
      plan.quality === "original"
    ) {
      // The quality the viewer picked can't play, so the original does.
      qualityFailedNotice()
      state.pick({ quality: "original" })
    } else playbackNotice(plan, previous)
  }

  /** Ask the server how the file plays now, and load what it says. */
  const ask = async (change: Ask) => {
    const id = ++generation.current
    const before = store.getState()
    const undo = { picks: before.picks, failed: before.failed }
    if (change.picks) before.pick(change.picks)
    if (change.picks?.quality) before.setQuality(change.picks.quality)
    if (change.failed) before.addFailed(change.failed.source.method)
    // A source that failed or is tried again keeps the state it had.
    if (!change.failed && !change.reload) holdPlayState()
    if (change.still) {
      holdStill()
      before.setPending(change.at)
    }
    asking.current = true
    const state = store.getState()
    let plan: PlaybackStart
    try {
      plan = await client.playback.start({
        itemId: state.itemId,
        sessionId: state.sessionId,
        device: state.device,
        ...state.picks,
        subtitlesOn: change.subtitlesOn,
        failed: state.failed,
        position: change.at,
        snap: change.snap ?? "before",
      })
    } catch (cause) {
      if (id !== generation.current) return
      asking.current = false
      state.setPending(null)
      if (isUnplayable(cause)) core.onUnplayable()
      // Nothing plays: the old source is the one that failed.
      else if (change.failed) core.onFailed(cause)
      else {
        // A switch that didn't go through leaves what plays.
        state.restore(undo.picks, undo.failed)
        state.setQuality(state.plan.quality)
        release()
        switchFailedNotice(cause)
      }
      return
    }
    if (id !== generation.current) return
    asking.current = false
    apply(plan, change, id)
  }

  /**
   * Seek in a copied stream, which can't by itself: a new stream from the
   * keyframe near `at`.
   */
  const seekStream = async (at: number, snap: PlaybackSnap) => {
    const id = ++generation.current
    holdPlayState()
    holdStill()
    const state = store.getState()
    state.setPending(at)
    try {
      const { url, offset } = await client.playback.seek({
        itemId: state.itemId,
        sessionId: state.sessionId,
        audio: state.plan.audio?.index ?? 0,
        position: at,
        snap,
        audioCodecs: state.device.streamAudio,
      })
      if (id !== generation.current) return
      const { source } = store.getState()
      load({ ...source, url, offset, start: 0, attempt: id })
    } catch (cause) {
      if (id !== generation.current) return
      state.setPending(null)
      release()
      switchFailedNotice(cause)
    }
  }

  return { ask, seekStream, holdPlayState }
}

export type SourceStarters = ReturnType<typeof sourceStarters>
