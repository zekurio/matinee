import {
  type RefObject,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
} from "react"

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
  const played = useRef(0)
  const since = useRef<number | null>(null)
  return useMemo(() => {
    const tick = (keepGoing: boolean) => {
      const now = performance.now()
      if (since.current !== null) {
        played.current += Math.min(now - since.current, MAX_TICK_MS) / 1000
      }
      since.current = keepGoing ? now : null
    }
    const update = () => {
      if (since.current !== null) tick(true)
    }
    return {
      /** Seconds played so far, counting up to now. */
      read: () => {
        update()
        return played.current
      },
      start: () => tick(true),
      stop: () => tick(false),
      update,
    }
  }, [])
}

type PlayedTime = ReturnType<typeof usePlayedTime>

/** Progress for `onProgress`. The returned function sends one now. */
export function useProgressReport(
  video: RefObject<HTMLVideoElement | null>,
  store: PlayerStore,
  playedTime: PlayedTime,
  onProgress: ((report: ProgressReport) => void) | undefined,
  position: () => number,
  lengthOf: () => number,
) {
  const sentAt = useRef(0)
  const report = (leaving = false, ended = false, closed = false) => {
    // Unmounting detaches the video before this runs; use the time it last
    // showed.
    const at = video.current ? position() : store.getState().time
    if (at <= 0) return
    const length = lengthOf() || undefined
    sentAt.current = performance.now()
    onProgress?.({
      positionSeconds: ended && length ? length : at,
      durationSeconds: length,
      sessionId: store.getState().sessionId,
      playedSeconds: playedTime.read(),
      paused: video.current?.paused ?? true,
      closed,
      leaving,
    })
  }
  // The timer and the page's events report with the latest props.
  const reportLatest = useEffectEvent(report)

  // Report on a timer, less often while paused and not after the end, as
  // the page goes away, and once more when the player closes.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const el = video.current
      if (!el || el.ended) return
      if (
        !el.paused ||
        performance.now() - sentAt.current >= PAUSED_REPORT_EVERY_MS
      ) {
        reportLatest()
      }
    }, REPORT_EVERY_MS)
    const onPageHide = () => reportLatest(true, false, true)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("pagehide", onPageHide)
      reportLatest(false, false, true)
    }
  }, [])

  return report
}
