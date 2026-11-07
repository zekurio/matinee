import { createStore } from "zustand/vanilla"

/** How long the thumb stays after the page stops scrolling. */
const IDLE_MS = 1000

type ScrollbarState = {
  /** The page is taller than the window. */
  scrollable: boolean
  /** The page scrolled in the last second. */
  scrolling: boolean
  /** The thumb is held. */
  dragging: boolean
  setScrollable: (scrollable: boolean) => void
  /** Shows the thumb, and hides it again once scrolling stops. */
  scrolled: () => void
  setDragging: (dragging: boolean) => void
  /** Drops the pending hide, for when the scrollbar unmounts. */
  stop: () => void
}

/** State for one overlay scrollbar, made when it mounts. */
export function createScrollbarStore() {
  let idle = 0
  return createStore<ScrollbarState>()((set) => ({
    scrollable: false,
    scrolling: false,
    dragging: false,
    setScrollable: (scrollable) => set({ scrollable }),
    scrolled: () => {
      set({ scrolling: true })
      window.clearTimeout(idle)
      idle = window.setTimeout(() => set({ scrolling: false }), IDLE_MS)
    },
    setDragging: (dragging) => set({ dragging }),
    stop: () => window.clearTimeout(idle),
  }))
}
