import { type LucideIcon, RotateCcwIcon, RotateCwIcon } from "lucide-react"
import { useEffect, useEffectEvent } from "react"

import { tr } from "@/i18n"

import { SUBTITLE_STEP_MS, VOLUME_STEP } from "./player-controls"

export type PlayerKeyActions = {
  toggle: () => void
  skip: (by: number) => void
  /** How far left and J skip back, from the account's preferences. */
  skipBackSeconds: number
  /** How far right and L skip ahead. */
  skipForwardSeconds: number
  /** Jumps to `digit` tenths of the way. */
  jump: (digit: number) => void
  show: (Icon: LucideIcon | null, text: string) => void
  changeVolume: (by: number) => void
  toggleMute: () => void
  toggleFullscreen: () => void
  toggleSubtitles: () => void
  /** Moves the subtitles later by `ms`, earlier when negative. */
  moveSubtitles: (ms: number) => void
  toggleStats: () => void
}

/** The player's keyboard shortcuts, on the whole window. */
export function usePlayerKeys({
  toggle,
  skip,
  skipBackSeconds,
  skipForwardSeconds,
  jump,
  show,
  changeVolume,
  toggleMute,
  toggleFullscreen,
  toggleSubtitles,
  moveSubtitles,
  toggleStats,
}: PlayerKeyActions) {
  // Each key runs the actions from the latest render.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null
    // Sliders, buttons, and open menus handle their own keys.
    if (
      target?.closest(
        '[role="slider"], [role="menu"], [role="dialog"], input, textarea',
      )
    )
      return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const back = () => {
      skip(-skipBackSeconds)
      show(RotateCcwIcon, tr("player.flash.skip", { seconds: skipBackSeconds }))
    }
    const ahead = () => {
      skip(skipForwardSeconds)
      show(
        RotateCwIcon,
        tr("player.flash.skip", { seconds: skipForwardSeconds }),
      )
    }
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
