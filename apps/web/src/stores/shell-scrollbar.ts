import { createSignal } from "solid-js"

/** How long the thumb stays after the page stops scrolling. */
const IDLE_MS = 1000

/** State for one overlay scrollbar. scrollable, scrolling and dragging are accessors. */
export function createScrollbarStore() {
  let idle: number | undefined
  const [scrollable, setScrollable] = createSignal(false)
  const [scrolling, setScrolling] = createSignal(false)
  const [dragging, setDragging] = createSignal(false)

  const stop = () => window.clearTimeout(idle)
  const scrolled = () => {
    setScrolling(true)
    stop()
    idle = window.setTimeout(() => setScrolling(false), IDLE_MS)
  }

  return {
    scrollable,
    scrolling,
    dragging,
    setScrollable,
    scrolled,
    setDragging,
    stop,
  }
}
