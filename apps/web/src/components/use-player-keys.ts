import { useEffect, useEffectEvent } from "react"

import { SUBTITLE_STEP_MS, VOLUME_STEP } from "./player-controls"

export type PlayerKeyActions = {
  toggle: () => void
  /** Skips by `by` seconds and flashes how far. */
  skip: (by: number) => void
  /** How far left and J skip back, from the account's preferences. */
  skipBackSeconds: number
  /** How far right and L skip ahead. */
  skipForwardSeconds: number
  /** Jumps to `digit` tenths of the way. */
  jump: (digit: number) => void
  changeVolume: (by: number) => void
  toggleMute: () => void
  toggleFullscreen: () => void
  toggleSubtitles: () => void
  /** Moves the subtitles later by `ms`, earlier when negative. */
  moveSubtitles: (ms: number) => void
  toggleStats: () => void
  /** Plays the episode before this one, when there is one. */
  previous: (() => void) | null
  /** Plays the episode after this one, when there is one. */
  next: (() => void) | null
}

/** The player's keyboard shortcuts, on the whole window. */
export function usePlayerKeys({
  toggle,
  skip,
  skipBackSeconds,
  skipForwardSeconds,
  jump,
  changeVolume,
  toggleMute,
  toggleFullscreen,
  toggleSubtitles,
  moveSubtitles,
  toggleStats,
  previous,
  next,
}: PlayerKeyActions) {
  // Each key runs the actions from the latest render.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null
    // Sliders, buttons, and open menus handle their own keys. The seek
    // bar, which a click on it focuses, leaves them to the player.
    if (
      target?.closest(
        '[role="slider"], [role="menu"], [role="dialog"], input, textarea',
      ) &&
      !target.closest("[data-player-keys]")
    )
      return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const back = () => skip(-skipBackSeconds)
    const ahead = () => skip(skipForwardSeconds)
    const actions = new Map([
      [" ", toggle],
      ["k", toggle],
      ["ArrowLeft", back],
      ["j", back],
      ["ArrowRight", ahead],
      ["l", ahead],
      ["ArrowUp", () => changeVolume(VOLUME_STEP)],
      ["ArrowDown", () => changeVolume(-VOLUME_STEP)],
      ["m", toggleMute],
      ["f", toggleFullscreen],
      ["c", toggleSubtitles],
      // VLC's keys for the subtitle delay.
      ["g", () => moveSubtitles(-SUBTITLE_STEP_MS)],
      ["h", () => moveSubtitles(SUBTITLE_STEP_MS)],
      ["i", toggleStats],
      // YouTube's keys for the previous and next video.
      ...(previous ? [["P", previous] as const] : []),
      ...(next ? [["N", next] as const] : []),
    ])
    const digit = /^\d$/.test(event.key) ? Number(event.key) : null
    const action = digit !== null ? () => jump(digit) : actions.get(event.key)
    if (!action) return
    // Space presses a button the keyboard reached. One a click left
    // focused may be out of sight with the controls, so the video gets it.
    if (event.key === " " && target?.closest("button:focus-visible")) return
    event.preventDefault()
    action()
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])
}
