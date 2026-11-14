import { createStore } from "zustand/vanilla"

type HeroState = {
  /** The slide on screen. */
  index: number
  /** A pointer or focus is in the banner, so it doesn't advance. */
  held: boolean
  primed: ReadonlySet<number>
  prime: (index: number) => void
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
    primed: new Set([0]),
    prime: (index) =>
      set((state) =>
        state.primed.has(index)
          ? state
          : { primed: new Set(state.primed).add(index) },
      ),
    show: (index, count) =>
      set((state) => {
        const next = ((index % count) + count) % count
        return { index: next, primed: new Set(state.primed).add(next) }
      }),
    hold: () => set({ held: true }),
    release: () => set({ held: false }),
  }))
}
