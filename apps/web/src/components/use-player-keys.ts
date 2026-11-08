import { type LucideIcon, RotateCcwIcon, RotateCwIcon } from "lucide-react"
import { useEffect, useEffectEvent } from "react"

import { tr } from "@/i18n"

import { SKIP_S, SUBTITLE_STEP_MS, VOLUME_STEP } from "./player-controls"

export type PlayerKeyActions = {
  toggle: () => void
  skip: (by: number) => void
  /** Jumps to `digit` tenths of the way. */
  jump: (digit: number) => void
  show: (Icon: LucideIcon | null, text: string) => void
  changeVolume: (by: number) => void
  toggleMute: () => void
  toggleFullscreen: () => void
  toggleSubtitles: () => void
  /** Moves the subtitles later by `ms`, earlier when negative. */
  moveSubtitles: (ms: number) => void
}

/** The player's keyboard shortcuts, on the whole window. */
export function usePlayerKeys({
  toggle,
  skip,
  jump,
  show,
  changeVolume,
  toggleMute,
  toggleFullscreen,
  toggleSubtitles,
  moveSubtitles,
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
      skip(-SKIP_S)
      show(RotateCcwIcon, tr("player.flash.skip", { seconds: SKIP_S }))
    }
    const ahead = () => {
      skip(SKIP_S)
      show(RotateCwIcon, tr("player.flash.skip", { seconds: SKIP_S }))
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
    ])
    const digit = /^\d$/.test(event.key) ? Number(event.key) : null
    const action = digit !== null ? () => jump(digit) : actions.get(event.key)
    if (!action) return
    if (event.key === " " && target?.closest("button")) return
    event.preventDefault()
    action()
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])
}
