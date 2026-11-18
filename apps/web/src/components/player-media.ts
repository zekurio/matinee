/*
 * What the player needs from the thing that plays: the part of
 * `HTMLMediaElement` its hooks use. A `<video>` is one as it is. In the
 * desktop app, `MpvMedia` (mpv-media.ts) is one over the shell's mpv,
 * with the same values and events in the same order.
 */

/** A list of stretches of time, as `TimeRanges` reads. */
export type MediaRanges = Pick<TimeRanges, "length" | "start" | "end">

/** The media events the player listens for. */
export const MEDIA_EVENTS = [
  "loadstart",
  "durationchange",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "canplaythrough",
  "play",
  "playing",
  "waiting",
  "pause",
  "seeking",
  "seeked",
  "timeupdate",
  "progress",
  "volumechange",
  "ratechange",
  "ended",
  "error",
] as const
export type MediaEventName = (typeof MEDIA_EVENTS)[number]

export interface PlayerMedia {
  /** Seconds into the source. Setting it seeks. */
  currentTime: number
  /** NaN until the source says. */
  readonly duration: number
  readonly paused: boolean
  readonly ended: boolean
  volume: number
  muted: boolean
  playbackRate: number
  /** The rate the next source starts at. */
  defaultPlaybackRate: number
  /** `HTMLMediaElement.HAVE_NOTHING` to `HAVE_ENOUGH_DATA`. */
  readonly readyState: number
  /** `HTMLMediaElement.NETWORK_EMPTY` to `NETWORK_NO_SOURCE`. */
  readonly networkState: number
  readonly buffered: MediaRanges
  readonly seekable: MediaRanges
  readonly played: MediaRanges
  /** A `MediaError` code, once the source failed. */
  readonly error: { readonly code: number } | null
  play: () => Promise<void>
  pause: () => void
  addEventListener: (type: MediaEventName, listener: () => void) => void
  removeEventListener: (type: MediaEventName, listener: () => void) => void
}
