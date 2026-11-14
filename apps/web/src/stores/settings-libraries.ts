import type { Library } from "@matinee/contracts"
import { createStore } from "zustand/vanilla"

/** Keeps the edited library in place while its dialog closes. */
export function createSettingsLibrariesStore() {
  return createStore<{
    library: Library | undefined
    open: boolean
    edit: (library?: Library) => void
    close: () => void
  }>()((set) => ({
    library: undefined,
    open: false,
    edit: (library) => set({ library, open: true }),
    close: () => set({ open: false }),
  }))
}
