import type { ApiToken, CreatedApiToken } from "@matinee/contracts"
import { createStore } from "zustand/vanilla"

type ApiTokensState = {
  creating: boolean
  /**
   * The token just made, with its secret. Kept while its dialog fades, and
   * dropped when the next one starts, so nothing opens it again.
   */
  created: CreatedApiToken | null
  /** The token waiting for a yes to revoke, kept while the dialog closes. */
  revoking: ApiToken | null
  revokeOpen: boolean
  start: () => void
  setCreating: (creating: boolean) => void
  setCreated: (created: CreatedApiToken) => void
  ask: (token: ApiToken) => void
  closeRevoke: () => void
}

/** The API token dialogs. Each section makes its own. */
export function createSettingsApiTokensStore() {
  return createStore<ApiTokensState>()((set) => ({
    creating: false,
    created: null,
    revoking: null,
    revokeOpen: false,
    start: () => set({ creating: true, created: null }),
    setCreating: (creating) => set({ creating }),
    setCreated: (created) => set({ created }),
    ask: (revoking) => set({ revoking, revokeOpen: true }),
    closeRevoke: () => set({ revokeOpen: false }),
  }))
}
