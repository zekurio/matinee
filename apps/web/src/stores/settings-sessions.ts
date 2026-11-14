import type { Session } from "@matinee/contracts"
import { createStore } from "zustand/vanilla"

/** The session confirmations, with the named session retained during closing. */
export function createSettingsSessionsStore() {
  return createStore<{
    revoking: Session | null
    open: boolean
    revokingOthers: boolean
    ask: (session: Session) => void
    close: () => void
    setRevokingOthers: (open: boolean) => void
  }>()((set) => ({
    revoking: null,
    open: false,
    revokingOthers: false,
    ask: (revoking) => set({ revoking, open: true }),
    close: () => set({ open: false }),
    setRevokingOthers: (revokingOthers) => set({ revokingOthers }),
  }))
}
