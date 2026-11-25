import { onSettled } from "solid-js"

import { SUBTITLE_STEP_MS, VOLUME_STEP } from "./player-controls"

export type PlayerKeyActions = {
  toggle: () => void
  /** Skips by `by` seconds and flashes how far. */
  skip: (by: number) => void
  /** How far left and J skip back, from the account's preferences. */
  skipBackSeconds: () => number
  /** How far right and L skip ahead. */
  skipForwardSeconds: () => number
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
  previous: () => (() => void) | null
  /** Plays the episode after this one, when there is one. */
  next: () => (() => void) | null
}

/** The player's keyboard shortcuts, on the whole window. */
export function usePlayerKeys(actions: PlayerKeyActions) {
  const onKey = (event: KeyboardEvent) => {
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
    const back = () => actions.skip(-actions.skipBackSeconds())
    const ahead = () => actions.skip(actions.skipForwardSeconds())
    const previous = actions.previous()
    const next = actions.next()
    const keys = new Map<string, () => void>([
      [" ", actions.toggle],
      ["k", actions.toggle],
      ["ArrowLeft", back],
      ["j", back],
      ["ArrowRight", ahead],
      ["l", ahead],
      ["ArrowUp", () => actions.changeVolume(VOLUME_STEP)],
      ["ArrowDown", () => actions.changeVolume(-VOLUME_STEP)],
      ["m", actions.toggleMute],
      ["f", actions.toggleFullscreen],
      ["c", actions.toggleSubtitles],
      // VLC's keys for the subtitle delay.
      ["g", () => actions.moveSubtitles(-SUBTITLE_STEP_MS)],
      ["h", () => actions.moveSubtitles(SUBTITLE_STEP_MS)],
      ["i", actions.toggleStats],
    ])
    // YouTube's keys for the previous and next video.
    if (previous) keys.set("P", previous)
    if (next) keys.set("N", next)
    const digit = /^\d$/.test(event.key) ? Number(event.key) : null
    const action =
      digit !== null ? () => actions.jump(digit) : keys.get(event.key)
    if (!action) return
    // Space presses a button the keyboard reached. One a click left
    // focused may be out of sight with the controls, so the video gets it.
    if (event.key === " " && target?.closest("button:focus-visible")) return
    event.preventDefault()
    action()
  }

  onSettled(() => {
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
}
