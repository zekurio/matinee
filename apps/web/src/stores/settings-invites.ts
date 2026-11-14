import type { CreatedInvite } from "@matinee/contracts"
import { createStore } from "zustand/vanilla"

type InvitesState = {
  creating: boolean
  created: CreatedInvite | null
  start: () => void
  setCreating: (creating: boolean) => void
  setCreated: (created: CreatedInvite) => void
}

/** The invite link stays visible until its dialog is explicitly closed. */
export function createSettingsInvitesStore() {
  return createStore<InvitesState>()((set) => ({
    creating: false,
    created: null,
    start: () => set({ creating: true, created: null }),
    setCreating: (creating) => set({ creating }),
    setCreated: (created) => set({ created }),
  }))
}
