import type {
  PlaybackMethod,
  PlaybackQuality,
  PlaybackStart,
  SubtitlePick,
} from "@matinee/contracts"

/**
 * What the video loads: the source of a `playback.start` answer, or a
 * stream from `playback.seek` in its place. `offset` is where in the file
 * its time 0 is, `start` where it begins playing in its own time, and
 * `attempt` tells one load of it from the next.
 */
export type PlaybackSource = {
  method: PlaybackMethod
  url: string
  hls: boolean
  offset: number
  start: number
  attempt: number
}

/** What the viewer picked in this sitting, which every start carries. */
export type PlaybackPicks = {
  audio?: number
  subtitle?: SubtitlePick
  quality?: PlaybackQuality
}

export function sourceOf(plan: PlaybackStart, attempt: number): PlaybackSource {
  return {
    method: plan.method,
    url: plan.url,
    hls: plan.hls,
    offset: plan.offset,
    start: plan.start,
    attempt,
  }
}

/** The subtitle burned into the picture, if any. */
function burnedIn(plan: PlaybackStart): string | null {
  return plan.subtitleMode === "burn-in" ? (plan.subtitle?.id ?? null) : null
}

/**
 * Whether `next` plays from what `current` loaded, so the video can keep
 * it: the same file, or a stream of the same audio, quality, and picture.
 * Only where it starts differs, as after a subtitle the player draws.
 */
export function sameSource(
  current: PlaybackStart,
  next: PlaybackStart,
): boolean {
  if (current.method !== next.method || current.hls !== next.hls) return false
  if (next.method === "direct") return true
  return (
    current.audio?.index === next.audio?.index &&
    current.quality === next.quality &&
    current.convertedAudio === next.convertedAudio &&
    burnedIn(current) === burnedIn(next)
  )
}

/**
 * Whether `el` has shown its source: decoded frames, or for a file without
 * video, half a second of sound.
 */
export function hasPlayed(el: HTMLVideoElement): boolean {
  if (el.getVideoPlaybackQuality().totalVideoFrames > 0) return true
  if (el.videoWidth > 0) return false
  for (let i = 0; i < el.played.length; i++) {
    if (el.played.end(i) - el.played.start(i) > 0.5) return true
  }
  return false
}

/** Whether `time` of the current resource can be seeked to without a reload. */
export function canSeekTo(el: HTMLVideoElement, time: number): boolean {
  for (let i = 0; i < el.seekable.length; i++) {
    if (el.seekable.start(i) <= time && time <= el.seekable.end(i)) {
      // A stream only reaches what it buffered.
      for (let j = 0; j < el.buffered.length; j++) {
        if (el.buffered.start(j) <= time && time <= el.buffered.end(j)) {
          return true
        }
      }
    }
  }
  return false
}
