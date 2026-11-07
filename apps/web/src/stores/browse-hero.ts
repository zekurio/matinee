import { createStore } from "zustand/vanilla"

type HeroState = {
  /** The slide on screen. */
  index: number
  /** A pointer or focus is in the banner, so it doesn't advance. */
  held: boolean
  /** Shows slide `index` of `count`, wrapping past either end. */
  show: (index: number, count: number) => void
  hold: () => void
  release: () => void
}

/** State for one banner, made when it mounts. */
export function createHeroStore() {
  return createStore<HeroState>()((set) => ({
    index: 0,
    held: false,
    show: (index, count) => set({ index: ((index % count) + count) % count }),
    hold: () => set({ held: true }),
    release: () => set({ held: false }),
  }))
}
