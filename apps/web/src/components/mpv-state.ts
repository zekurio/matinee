import type {
  PlayerState,
  PlayerStatePatch,
  TimeRange,
} from "@matinee/desktop-bridge"

import type { MediaEventName, MediaRanges } from "./player-media"

/*
 * How mpv's state reads as a `<video>`'s: plain functions over the
 * shell's `PlayerState`, which `MpvMedia` runs on every change. The
 * numbers are `HTMLMediaElement`'s, written out so this runs anywhere.
 */

const HAVE_NOTHING = 0
const HAVE_METADATA = 1
const HAVE_CURRENT_DATA = 2
const HAVE_FUTURE_DATA = 3
const HAVE_ENOUGH_DATA = 4
const NETWORK_EMPTY = 0
const NETWORK_IDLE = 1
const NETWORK_LOADING = 2
const NETWORK_NO_SOURCE = 3
const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

/** A seek this close to a source's start is the start itself. */
export const SAME_TIME_S = 0.001

/**
 * What the page asked of mpv that mpv hasn't said back yet. A `<video>`
 * answers a new value at once; so does the player, until mpv says
 * otherwise. `time` is a seek on its way.
 */
export type Asked = {
  paused?: boolean
  time?: number
  volume?: number
  muted?: boolean
  speed?: number
}
export type AskedField = keyof Asked

/** What the player knows of its own loads, beside mpv's state. */
export type LoadFacts = {
  /** The page's loads, counted; 0 before the first. */
  load: number
  /** mpv's state is about the latest of them. */
  current: boolean
  /** The shell refused the latest. */
  refused: boolean
  /** The latest has had enough to play once. */
  shown: boolean
  /** Time updates and reads of the source, counted. */
  ticks: number
  progress: number
}

/** A `<video>`'s state, as far as its events go. */
export type MediaView = {
  load: number
  readyState: number
  networkState: number
  paused: boolean
  seeking: boolean
  ended: boolean
  failed: boolean
  /** NaN until the source says. */
  duration: number
  volume: number
  muted: boolean
  rate: number
  ticks: number
  progress: number
}

/** The view before anything loads. */
export const EMPTY_VIEW: MediaView = {
  load: 0,
  readyState: HAVE_NOTHING,
  networkState: NETWORK_EMPTY,
  paused: true,
  seeking: false,
  ended: false,
  failed: false,
  duration: Number.NaN,
  volume: 1,
  muted: false,
  rate: 1,
  ticks: 0,
  progress: 0,
}

/**
 * The state of a load mpv just began, before the patch that says so is
 * applied over it: the player's own settings carry over, nothing of the
 * old source does.
 */
function opening(state: PlayerState, load: number): PlayerState {
  return {
    ...state,
    load,
    phase: "loading",
    buffering: false,
    seeking: false,
    time: 0,
    duration: null,
    bufferedTo: 0,
    reading: undefined,
    seeks: false,
    seekable: [],
    video: null,
    error: null,
  }
}

/** `state` with a patch from the shell over it. */
export function applyPatch(
  state: PlayerState,
  patch: PlayerStatePatch,
): PlayerState {
  const base =
    patch.load !== undefined && patch.load !== state.load
      ? opening(state, patch.load)
      : state
  return { ...base, ...patch }
}

/** Whether mpv has the source of `state` open, playing or not. */
function isOpen(state: PlayerState | null): state is PlayerState {
  return state?.phase === "ready" || state?.phase === "ended"
}

/**
 * What a `<video>` would say now. `state` is mpv's, which counts only
 * when `facts.current`; `asked` goes over it.
 */
export function mediaView(
  state: PlayerState | null,
  facts: LoadFacts,
  asked: Asked,
): MediaView {
  const own = facts.current && !facts.refused ? state : null
  const open = isOpen(own)
  const broke = own?.phase === "failed"
  const failed = facts.refused || broke
  const seeking = open && (asked.time !== undefined || own.seeking)
  const ended = open && own.phase === "ended" && !seeking
  // A load starts paused, and a `<video>` is paused at its end. One that
  // failed stays as it was, as a `<video>` with an error does.
  const paused =
    asked.paused ??
    (open ? own.paused || ended : broke && state ? state.paused : true)
  // mpv buffers for the first frame after opening even while paused.
  const stalled = seeking || (open && own.buffering)
  let readyState = HAVE_NOTHING
  if (open && !failed) {
    readyState = !stalled
      ? HAVE_ENOUGH_DATA
      : facts.shown
        ? HAVE_CURRENT_DATA
        : HAVE_METADATA
  }
  let networkState = facts.load === 0 ? NETWORK_EMPTY : NETWORK_LOADING
  if (failed) networkState = facts.shown ? NETWORK_IDLE : NETWORK_NO_SOURCE
  else if (open && !readsOn(own)) networkState = NETWORK_IDLE
  return {
    load: facts.load,
    readyState,
    networkState,
    paused,
    seeking,
    ended,
    failed,
    duration: open && own.duration !== null ? own.duration : Number.NaN,
    volume: asked.volume ?? state?.volume ?? 1,
    muted: asked.muted ?? state?.muted ?? false,
    rate: asked.speed ?? state?.speed ?? 1,
    ticks: facts.ticks,
    progress: facts.progress,
  }
}

/** Whether mpv still reads the source, by its word or by how far it got. */
function readsOn(state: PlayerState): boolean {
  if (state.reading !== undefined) return state.reading
  return state.duration === null || state.bufferedTo < state.duration - 0.5
}

function sameNumber(a: number, b: number): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b))
}

/**
 * The events a `<video>` fires going from `a` to `b`, in its order. A
 * new load pauses without a `pause` event and starts from nothing.
 */
export function mediaEvents(a: MediaView, b: MediaView): MediaEventName[] {
  const events: MediaEventName[] = []
  let before = a
  if (b.load !== a.load) {
    events.push("loadstart")
    before = {
      ...a,
      load: b.load,
      readyState: HAVE_NOTHING,
      paused: true,
      seeking: false,
      ended: false,
      failed: false,
      duration: Number.NaN,
    }
  }
  if (b.volume !== before.volume || b.muted !== before.muted) {
    events.push("volumechange")
  }
  if (b.rate !== before.rate) events.push("ratechange")
  if (before.readyState < HAVE_METADATA && b.readyState >= HAVE_METADATA) {
    if (!Number.isNaN(b.duration)) events.push("durationchange")
    events.push("loadedmetadata")
  } else if (
    b.readyState >= HAVE_METADATA &&
    !sameNumber(before.duration, b.duration)
  ) {
    events.push("durationchange")
  }
  if (
    before.readyState < HAVE_CURRENT_DATA &&
    b.readyState >= HAVE_CURRENT_DATA
  ) {
    events.push("loadeddata")
  }
  if (!before.seeking && b.seeking) events.push("seeking")
  if (before.paused && !b.paused) events.push("play")
  if (!before.paused && b.paused) events.push("pause")
  const couldPlay = before.readyState >= HAVE_FUTURE_DATA
  const canPlay = b.readyState >= HAVE_FUTURE_DATA
  if (!couldPlay && canPlay) {
    events.push("canplay")
    if (!b.paused) events.push("playing")
  } else if (canPlay && before.paused && !b.paused) {
    events.push("playing")
  } else if (
    !canPlay &&
    !b.paused &&
    !b.failed &&
    (couldPlay || before.paused)
  ) {
    events.push("waiting")
  }
  if (
    before.readyState < HAVE_ENOUGH_DATA &&
    b.readyState >= HAVE_ENOUGH_DATA
  ) {
    events.push("canplaythrough")
  }
  if (before.seeking && !b.seeking) events.push("timeupdate", "seeked")
  else if (b.ticks !== before.ticks) events.push("timeupdate")
  if (b.progress !== before.progress) events.push("progress")
  if (!before.ended && b.ended) events.push("ended")
  if (!before.failed && b.failed) events.push("error")
  return events
}

/**
 * Whether a patch takes the place of what the page asked for `field`:
 * mpv says the same, or anything at all once the request was answered,
 * since every state after the answer is newer than it.
 */
export function settles(
  field: AskedField,
  asked: Asked,
  answered: boolean,
  patch: PlayerStatePatch,
): boolean {
  switch (field) {
    case "time": {
      const target = asked.time
      if (target === undefined) return false
      if (patch.time !== undefined && Math.abs(patch.time - target) < 0.05) {
        return true
      }
      return (
        answered && (patch.time !== undefined || patch.seeking !== undefined)
      )
    }
    case "paused":
      return (
        patch.paused !== undefined &&
        (answered || patch.paused === asked.paused)
      )
    case "volume":
      return (
        patch.volume !== undefined &&
        (answered || patch.volume === asked.volume)
      )
    case "muted":
      return (
        patch.muted !== undefined && (answered || patch.muted === asked.muted)
      )
    case "speed":
      return (
        patch.speed !== undefined && (answered || patch.speed === asked.speed)
      )
  }
}

/** The ranges in order, with those that touch or overlap made one. */
export function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const merged: TimeRange[] = []
  for (const range of ranges.toSorted((a, b) => a.start - b.start)) {
    if (range.end <= range.start) continue
    const last = merged.at(-1)
    if (last && range.start <= last.end + 0.01) {
      last.end = Math.max(last.end, range.end)
    } else merged.push({ ...range })
  }
  return merged
}

/** What mpv has of the source: what it holds, and what it read ahead. */
export function bufferedRanges(state: PlayerState): TimeRange[] {
  return mergeRanges([
    ...state.seekable,
    { start: state.time, end: state.bufferedTo },
  ])
}

/** Where a seek reaches without a new source. */
export function seekableRanges(state: PlayerState): TimeRange[] {
  if (!state.seeks) return mergeRanges(state.seekable)
  return [{ start: 0, end: state.duration ?? Number.POSITIVE_INFINITY }]
}

/** `ranges` with `from` to `to` played. */
export function addPlayed(
  ranges: readonly TimeRange[],
  from: number,
  to: number,
): TimeRange[] {
  return mergeRanges([...ranges, { start: from, end: to }])
}

/**
 * The `MediaError` code of a source that failed. One that never played
 * didn't open or decode here, so the server's next way is worth a try.
 * One that played broke off, as when the server went away.
 */
export function errorCode(shown: boolean): number {
  return shown ? MEDIA_ERR_NETWORK : MEDIA_ERR_SRC_NOT_SUPPORTED
}

/** Ranges as a `TimeRanges` reads. */
export class Ranges implements MediaRanges {
  readonly #ranges: readonly TimeRange[]

  constructor(ranges: readonly TimeRange[]) {
    this.#ranges = ranges
  }

  get length(): number {
    return this.#ranges.length
  }

  start(index: number): number {
    return this.#at(index).start
  }

  end(index: number): number {
    return this.#at(index).end
  }

  #at(index: number): TimeRange {
    const range = this.#ranges[index]
    if (!range) throw new RangeError(`No range at ${index}`)
    return range
  }
}
