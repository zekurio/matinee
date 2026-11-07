import { createStore } from "zustand/vanilla"

type RailState = {
  /** Scrolled all the way back, or too short to scroll. */
  atStart: boolean
  /** Scrolled all the way forward, or too short to scroll. */
  atEnd: boolean
  /** A mouse is dragging the row. */
  dragging: boolean
  /** Reads where the row is scrolled to. */
  measure: (row: HTMLElement) => void
  setDragging: (dragging: boolean) => void
}

/** State for one rail. Pages show several, so each makes its own. */
export function createRailStore() {
  return createStore<RailState>()((set) => ({
    atStart: true,
    atEnd: true,
    dragging: false,
    measure: (row) =>
      set({
        atStart: row.scrollLeft <= 1,
        atEnd: row.scrollLeft + row.clientWidth >= row.scrollWidth - 1,
      }),
    setDragging: (dragging) => set({ dragging }),
  }))
}
