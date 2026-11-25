import { onSettled } from "solid-js"

import type { PlayerStore } from "@/stores/player"

export type ProgressReport = {
  positionSeconds: number
  durationSeconds?: number
  /** Names this sitting with the file, for statistics. */
  sessionId: string
  /** Seconds spent playing so far, without pauses and buffering. */
  playedSeconds: number
  paused: boolean
  /** The player is closing. */
  closed: boolean
  /** The page is going away; the request must survive it. */
  leaving?: boolean
}

const REPORT_EVERY_MS = 10_000
// Paused, the player still reports now and then, so a player that went
// away without its closing report drops out of "watching now" soon.
const PAUSED_REPORT_EVERY_MS = 30_000
// A longer gap between time updates is a stall or a sleeping laptop, not
// watching.
const MAX_TICK_MS = 15_000

/**
 * Counts the time a video spends playing: from `playing` to the next pause,
 * stall, seek, or error. Time updates add the time since the last one.
 */
export function usePlayedTime() {
  let played = 0
  let since: number | null = null
  const tick = (keepGoing: boolean) => {
    const now = performance.now()
    if (since !== null) played += Math.min(now - since, MAX_TICK_MS) / 1000
    since = keepGoing ? now : null
  }
  const update = () => {
    if (since !== null) tick(true)
  }
  return {
    /** Seconds played so far, counting up to now. */
    read: () => {
      update()
      return played
    },
    start: () => tick(true),
    stop: () => tick(false),
    update,
  }
}

type PlayedTime = ReturnType<typeof usePlayedTime>

/**
 * Progress for `onProgress`, on a timer, less often while paused and not
 * after the end, as the page goes away, and once more when the player
 * closes. The returned function sends one now.
 */
export function useProgressReport(
  video: () => HTMLVideoElement | undefined,
  store: PlayerStore,
  playedTime: PlayedTime,
  onProgress: (report: ProgressReport) => void,
  position: () => number,
  lengthOf: () => number,
) {
  let sentAt = 0
  const report = (leaving = false, ended = false, closed = false) => {
    const el = video()
    // The player closing may have let go of the video's source already, so
    // that report uses the time the video last showed.
    const at = closed && !leaving ? store.getState().time : position()
    if (at <= 0) return
    const length = lengthOf() || undefined
    sentAt = performance.now()
    onProgress({
      positionSeconds: ended && length ? length : at,
      durationSeconds: length,
      sessionId: store.getState().sessionId,
      playedSeconds: playedTime.read(),
      paused: el?.paused ?? true,
      closed,
      leaving,
    })
  }

  onSettled(() => {
    const timer = window.setInterval(() => {
      const el = video()
      if (!el || el.ended) return
      if (!el.paused || performance.now() - sentAt >= PAUSED_REPORT_EVERY_MS) {
        report()
      }
    }, REPORT_EVERY_MS)
    const onPageHide = () => report(true, false, true)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("pagehide", onPageHide)
      report(false, false, true)
    }
  })

  return report
}
