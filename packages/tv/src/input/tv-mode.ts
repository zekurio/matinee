import { platform } from "../platform/runtime"
import { isTvMode } from "../platform/tv-mode"
import { remoteKey } from "./keys"

/*
 * The browser's own quirks around the TV UI: a page can ask for fullscreen
 * only from a gesture, and a pointer has to be got out of the way.
 */

/** How long the pointer rests before it's hidden. */
const POINTER_IDLE_MS = 3000

/**
 * Asks for fullscreen on the first Select or click when TV mode is on.
 * Turning the mode on navigates to this document, which a browser doesn't
 * count as a gesture. Does nothing on a TV, which has no Fullscreen API,
 * or when the mode is off.
 */
export function startFullscreenOnGesture() {
  if (platform().toggleFullscreen === undefined || !isTvMode()) return
  const stop = () => {
    document.removeEventListener("keydown", onKey, true)
    document.removeEventListener("pointerdown", attempt, true)
  }
  const attempt = () => {
    stop()
    if (!document.fullscreenElement) platform().toggleFullscreen?.()
  }
  const onKey = (event: KeyboardEvent) => {
    if (remoteKey(event) === "select") attempt()
  }
  document.addEventListener("keydown", onKey, true)
  document.addEventListener("pointerdown", attempt, true)
}

/**
 * Hides the pointer after it rests, as a TV has none, and brings it back
 * when it moves. Only the browser host has a pointer to hide.
 */
export function startPointerIdle() {
  if (platform().onTv) return
  const root = document.documentElement
  let timer = 0
  const rest = () => {
    timer = 0
    root.classList.add("pointer-resting")
  }
  const wake = () => {
    root.classList.remove("pointer-resting")
    window.clearTimeout(timer)
    timer = window.setTimeout(rest, POINTER_IDLE_MS)
  }
  wake()
  document.addEventListener("pointermove", wake)
  document.addEventListener("pointerdown", wake)
}
