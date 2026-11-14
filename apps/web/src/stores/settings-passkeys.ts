import type { Passkey } from "@matinee/contracts"
import { createStore } from "zustand/vanilla"

/** Holds the passkey's name through the confirmation's closing animation. */
export function createSettingsPasskeysStore() {
  return createStore<{
    removing: Passkey | null
    open: boolean
    ask: (passkey: Passkey) => void
    close: () => void
  }>()((set) => ({
    removing: null,
    open: false,
    ask: (removing) => set({ removing, open: true }),
    close: () => set({ open: false }),
  }))
}
