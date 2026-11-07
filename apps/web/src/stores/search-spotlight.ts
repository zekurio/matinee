import { create } from "zustand"

// The pause in typing before a search goes out.
const DEBOUNCE_MS = 180

type SearchSpotlightState = {
  /** Whether the spotlight is up. */
  open: boolean
  query: string
  /** `query` once it has held still for a moment; what gets searched. */
  settled: string
  setOpen: (open: boolean) => void
  toggle: () => void
  setQuery: (query: string) => void
  /** Empties the field. */
  clear: () => void
  reset: () => void
}

/**
 * The search spotlight. There is one, so one store. The query outlives a
 * close, so opening it again brings the last search back; the shell
 * resets it when it unmounts, so the next sign-in starts empty.
 */
export const useSearchSpotlightStore = create<SearchSpotlightState>()((set) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const update = (query: string) => {
    set({ query })
    clearTimeout(timer)
    timer = setTimeout(() => set({ settled: query.trim() }), DEBOUNCE_MS)
  }
  return {
    open: false,
    query: "",
    settled: "",
    setOpen: (open) => set({ open }),
    toggle: () => set((state) => ({ open: !state.open })),
    setQuery: update,
    clear: () => update(""),
    reset: () => {
      clearTimeout(timer)
      set({ open: false, query: "", settled: "" })
    },
  }
})
