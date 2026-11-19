import type {
  DesktopBridge,
  PlayerLoad,
  PlayerState,
  PlayerStatePatch,
  PlayerSubtitle,
  TimeRange,
} from "@matinee/desktop-bridge"

import {
  addPlayed,
  applyPatch,
  type Asked,
  type AskedField,
  bufferedRanges,
  EMPTY_VIEW,
  errorCode,
  type LoadFacts,
  mediaEvents,
  type MediaView,
  mediaView,
  Ranges,
  SAME_TIME_S,
  seekableRanges,
  settles,
} from "./mpv-state"
import type { MediaEventName, MediaRanges, PlayerMedia } from "./player-media"

/** What the player opens: `player.load`, which always opens paused. */
export type MpvSource = Omit<PlayerLoad, "paused">

/**
 * What the latest load and the requests after it gave mpv of its tracks,
 * so the same isn't sent again. `subtitle` as JSON.
 */
type Sent = {
  audio: number | null
  subtitle: string
  subtitleDelay: number
  inset: number
}

const NO_RANGES = new Ranges([])
// Further apart than this, two time updates aren't one stretch of playing.
const PLAYED_GAP_S = 2

/**
 * The shell's mpv as a `<video>` for the player's hooks: it mirrors the
 * `player.state` events, answers like a media element in between, and
 * fires the media events a `<video>` would, in its order and as tasks of
 * their own. What the page sets goes to mpv and reads back at once, until
 * mpv says otherwise.
 *
 * `attach` before anything else and `close` when the player goes. The
 * state starts from a `player.state` answer and follows the events after
 * it. mpv's `load` count tells this page's loads apart: the shell counts
 * each `player.load` it takes, so the latest one is the count at that
 * answer plus the loads sent since.
 */
export class MpvMedia implements PlayerMedia {
  defaultPlaybackRate = 1

  readonly #bridge: DesktopBridge
  readonly #listeners = new Map<MediaEventName, Set<() => void>>()
  #stopListening: (() => void) | null = null
  #mirror: PlayerState | null = null
  // Which attach the state answer is for, so an old one is dropped.
  #attached = 0
  // mpv's load count at that answer, and the loads sent after it was asked.
  #base: number | null = null
  #sentSince = 0
  #facts: LoadFacts = {
    load: 0,
    current: false,
    refused: false,
    shown: false,
    ticks: 0,
    progress: 0,
  }
  #asked: Asked = {}
  // Requests answered, and the latest request for each field.
  readonly #answered = new Set<AskedField>()
  readonly #requests = new Map<AskedField, number>()
  #nextRequest = 0
  #view: MediaView = EMPTY_VIEW
  // mpv's time at `at`, which the getter counts on from while it plays.
  #clock = { time: 0, at: 0 }
  // Where the latest load opens, a seek asked for before it opened, and
  // whether anything moved it since.
  #start = 0
  #startSeek: number | null = null
  #moved = false
  // The latest load has been open, so its time is mpv's from then on.
  #opened = false
  #played: TimeRange[] = []
  #queue: MediaEventName[] = []
  #sent: Sent = { audio: null, subtitle: "null", subtitleDelay: 0, inset: 0 }

  constructor(bridge: DesktopBridge) {
    this.#bridge = bridge
  }

  /** Starts following mpv. */
  attach() {
    const attached = ++this.#attached
    this.#base = null
    this.#sentSince = 0
    this.#stopListening = this.#bridge.on("player.state", (patch) =>
      this.#patch(patch),
    )
    this.#bridge.request("player.state").then(
      (state) => {
        if (attached !== this.#attached) return
        this.#base = state.load
        // Like a `<video>` that was just made: what mpv has set already
        // isn't news, so it fires nothing.
        this.#change(() => {
          this.#mirror = state
          this.#clock = { time: state.time, at: performance.now() }
        }, false)
      },
      () => {},
    )
  }

  /** Stops the source and stops following mpv. The values stay readable. */
  close() {
    this.#attached++
    this.#stopListening?.()
    this.#stopListening = null
    this.#queue = []
    void this.#bridge.request("player.stop").catch(() => {})
  }

  /** Opens `source` in place of what plays, paused at its start. */
  open(source: MpvSource) {
    const load = this.#facts.load + 1
    this.#change(() => {
      this.#facts = {
        ...this.#facts,
        load,
        refused: false,
        shown: false,
        ticks: this.#facts.ticks + 1,
      }
      // The player's own settings carry over; the source's state doesn't.
      const { volume, muted, speed } = this.#asked
      this.#asked = { volume, muted, speed }
      for (const field of ["paused", "time"] as const) {
        this.#answered.delete(field)
        this.#requests.delete(field)
      }
      this.#start = source.start
      this.#startSeek = null
      this.#moved = false
      this.#opened = false
      this.#played = []
      this.#sentSince++
    })
    // A new source plays at the default rate, as in a `<video>`.
    if (this.playbackRate !== this.defaultPlaybackRate) {
      this.playbackRate = this.defaultPlaybackRate
    }
    this.#sent = {
      ...this.#sent,
      audio: source.audio,
      subtitle: JSON.stringify(source.subtitle),
      subtitleDelay: source.subtitleDelay,
    }
    this.#bridge
      .request("player.load", { ...source, paused: true })
      .catch(() => {
        if (load !== this.#facts.load) return
        // A load the shell refused doesn't count.
        this.#sentSince--
        this.#change(() => {
          this.#facts = { ...this.#facts, refused: true }
        })
      })
  }

  /** Plays another audio stream of the file that plays. */
  setAudio(index: number) {
    if (this.#sent.audio === index) return
    this.#sent.audio = index
    void this.#bridge.request("player.setAudio", { index }).catch(() => {})
  }

  setSubtitle(subtitle: PlayerSubtitle | null) {
    const key = JSON.stringify(subtitle)
    if (this.#sent.subtitle === key) return
    this.#sent.subtitle = key
    void this.#bridge
      .request("player.setSubtitle", { subtitle })
      .catch(() => {})
  }

  setSubtitleDelay(seconds: number) {
    if (this.#sent.subtitleDelay === seconds) return
    this.#sent.subtitleDelay = seconds
    void this.#bridge
      .request("player.setSubtitleDelay", { seconds })
      .catch(() => {})
  }

  /** Keeps subtitles above the bottom `bottom` of the window. */
  setSubtitleInset(bottom: number) {
    const clamped = Math.min(1, Math.max(0, bottom))
    if (this.#sent.inset === clamped) return
    this.#sent.inset = clamped
    void this.#bridge
      .request("player.setSubtitleInset", { bottom: clamped })
      .catch(() => {})
  }

  get currentTime(): number {
    return this.#position(performance.now())
  }

  set currentTime(to: number) {
    const time = Math.max(0, to)
    // Before the source opens, as a `<video>` keeps it for then.
    if (this.#view.readyState === 0) {
      this.#change(() => {
        this.#startSeek = time
      })
      return
    }
    // The load opened there already.
    if (!this.#moved && Math.abs(time - this.#start) < SAME_TIME_S) return
    this.#seek(time)
  }

  get duration(): number {
    return this.#view.duration
  }

  get paused(): boolean {
    return this.#view.paused
  }

  get ended(): boolean {
    return this.#view.ended
  }

  get readyState(): number {
    return this.#view.readyState
  }

  get networkState(): number {
    return this.#view.networkState
  }

  get volume(): number {
    return this.#view.volume
  }

  set volume(volume: number) {
    const next = Math.min(1, Math.max(0, volume))
    if (next === this.volume) return
    this.#ask("volume", next, () =>
      this.#bridge.request("player.setVolume", {
        volume: next,
        muted: this.muted,
      }),
    )
  }

  get muted(): boolean {
    return this.#view.muted
  }

  set muted(muted: boolean) {
    if (muted === this.muted) return
    this.#ask("muted", muted, () =>
      this.#bridge.request("player.setVolume", {
        volume: this.volume,
        muted,
      }),
    )
  }

  get playbackRate(): number {
    return this.#view.rate
  }

  set playbackRate(speed: number) {
    if (speed === this.playbackRate || speed <= 0) return
    this.#ask("speed", speed, () =>
      this.#bridge.request("player.setSpeed", { speed }),
    )
  }

  get buffered(): MediaRanges {
    const own = this.#own()
    return own ? new Ranges(bufferedRanges(own)) : NO_RANGES
  }

  get seekable(): MediaRanges {
    const own = this.#own()
    return own ? new Ranges(seekableRanges(own)) : NO_RANGES
  }

  get played(): MediaRanges {
    return new Ranges(this.#played)
  }

  get error(): { code: number; message: string } | null {
    if (!this.#view.failed) return null
    return {
      code: errorCode(this.#facts.shown),
      message: (this.#facts.current ? this.#mirror?.error : null) ?? "",
    }
  }

  play(): Promise<void> {
    // A `<video>` at its end plays from the start.
    if (this.#view.ended) this.#seek(0)
    if (!this.paused) return Promise.resolve()
    return this.#ask("paused", false, () =>
      this.#bridge.request("player.setPaused", { paused: false }),
    )
  }

  pause() {
    if (this.paused) return
    void this.#ask("paused", true, () =>
      this.#bridge.request("player.setPaused", { paused: true }),
    ).catch(() => {})
  }

  addEventListener(type: MediaEventName, listener: () => void) {
    const set = this.#listeners.get(type) ?? new Set()
    this.#listeners.set(type, set)
    set.add(listener)
  }

  removeEventListener(type: MediaEventName, listener: () => void) {
    this.#listeners.get(type)?.delete(listener)
  }

  /**
   * Whether mpv's `load` count is this page's latest load: the count at
   * the state answer, plus the loads sent after it was asked for.
   */
  #isLatest(load: number): boolean {
    return (
      this.#base !== null &&
      this.#sentSince > 0 &&
      load === this.#base + this.#sentSince
    )
  }

  /** mpv's state when it is about the latest load and has it open. */
  #own(): PlayerState | null {
    const state = this.#mirror
    if (!state || !this.#facts.current || this.#facts.refused) return null
    return state.phase === "ready" || state.phase === "ended" ? state : null
  }

  /** Where it plays at `now`: counted on from mpv's last word. */
  #position(now: number): number {
    if (this.#asked.time !== undefined) return this.#asked.time
    if (!this.#opened) return this.#startSeek ?? this.#start
    const view = this.#view
    const own = this.#own()
    let time = this.#clock.time
    const running =
      own !== null &&
      !view.paused &&
      !view.seeking &&
      !view.ended &&
      view.readyState >= 3
    if (running) time += ((now - this.#clock.at) / 1000) * view.rate
    const end = own?.duration
    return end != null ? Math.min(time, end) : time
  }

  #seek(time: number) {
    this.#moved = true
    void this.#ask(
      "time",
      time,
      () => this.#bridge.request("player.seek", { time }),
      () => {
        this.#facts = { ...this.#facts, ticks: this.#facts.ticks + 1 }
      },
    ).catch(() => {})
  }

  /**
   * Answers `value` for `field` at once and sends the request. A request
   * that fails leaves what mpv says.
   */
  #ask<Field extends AskedField>(
    field: Field,
    value: NonNullable<Asked[Field]>,
    send: () => Promise<void>,
    also?: () => void,
  ): Promise<void> {
    const request = ++this.#nextRequest
    this.#change(() => {
      this.#asked = { ...this.#asked, [field]: value }
      this.#answered.delete(field)
      this.#requests.set(field, request)
      also?.()
    })
    const latest = () => this.#requests.get(field) === request
    return send().then(
      () => {
        if (latest()) this.#answered.add(field)
      },
      (cause: unknown) => {
        if (latest()) {
          this.#change(() => this.#drop(field))
        }
        throw cause
      },
    )
  }

  #drop(field: AskedField) {
    const { [field]: _, ...rest } = this.#asked
    this.#asked = rest
    this.#answered.delete(field)
    this.#requests.delete(field)
  }

  #patch(patch: PlayerStatePatch) {
    const mirror = this.#mirror
    const base = this.#base
    if (base === null || !mirror) return
    const wasOpen = this.#view.readyState > 0
    this.#change(() => {
      const next = applyPatch(mirror, patch)
      const current = this.#isLatest(next.load)
      for (const field of [
        "paused",
        "time",
        "volume",
        "muted",
        "speed",
      ] as const) {
        // Only the volume and speed belong to the player rather than the
        // source, so only they settle from another load's state.
        const ownField =
          field === "volume" || field === "muted" || field === "speed"
        if (!current && !ownField) continue
        if (
          this.#asked[field] !== undefined &&
          settles(field, this.#asked, this.#answered.has(field), patch)
        ) {
          this.#drop(field)
        }
      }
      if (current && patch.time !== undefined) {
        const from = mirror.time
        if (
          this.#facts.current &&
          !this.#view.paused &&
          !this.#view.seeking &&
          patch.time > from &&
          patch.time - from <= PLAYED_GAP_S
        ) {
          this.#played = addPlayed(this.#played, from, patch.time)
        }
        if (Math.abs(patch.time - this.#start) > 0.25) this.#moved = true
        this.#clock = { time: patch.time, at: performance.now() }
      }
      const read =
        patch.bufferedTo !== undefined ||
        patch.seekable !== undefined ||
        patch.reading !== undefined
      this.#facts = {
        ...this.#facts,
        current,
        ticks:
          this.#facts.ticks + (current && patch.time !== undefined ? 1 : 0),
        progress: this.#facts.progress + (current && read ? 1 : 0),
      }
      this.#mirror = next
    })
    // A seek asked for before the source opened, made now it has.
    const start = this.#startSeek
    if (!wasOpen && this.#view.readyState > 0 && start !== null) {
      this.#startSeek = null
      if (Math.abs(start - this.#start) >= SAME_TIME_S) this.#seek(start)
    }
    // mpv holds the last frame at the end and plays on after a seek back.
    // A `<video>` pauses there, so it is paused there.
    if (
      this.#view.ended &&
      this.#mirror?.paused === false &&
      this.#asked.paused === undefined
    ) {
      void this.#ask("paused", true, () =>
        this.#bridge.request("player.setPaused", { paused: true }),
      ).catch(() => {})
    }
  }

  /** Runs a change, then fires the events it makes, unless `fire` is false. */
  #change(mutate: () => void, fire = true) {
    const now = performance.now()
    const before = this.#view
    // The clock stops where it got to under the old state.
    this.#clock = { time: this.#position(now), at: now }
    mutate()
    const current = this.#mirror !== null && this.#isLatest(this.#mirror.load)
    this.#facts = { ...this.#facts, current }
    const after = mediaView(this.#mirror, this.#facts, this.#asked)
    this.#view = after
    if (after.readyState > 0) this.#opened = true
    if (after.readyState >= 3) this.#facts = { ...this.#facts, shown: true }
    if (fire) this.#emit(mediaEvents(before, after))
  }

  /** Fires `events` after the code that caused them, as a `<video>` does. */
  #emit(events: MediaEventName[]) {
    if (events.length === 0 || this.#stopListening === null) return
    const idle = this.#queue.length === 0
    this.#queue.push(...events)
    if (!idle) return
    queueMicrotask(() => {
      const queued = this.#queue
      this.#queue = []
      for (const event of queued) {
        // A copy, since a listener may stop listening.
        const listeners = Array.from(this.#listeners.get(event) ?? [])
        for (const listener of listeners) {
          try {
            listener()
          } catch (cause) {
            reportError(cause)
          }
        }
      }
    })
  }
}
