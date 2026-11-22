import type { ApiToken, CreatedApiToken } from "@matinee/contracts"
import { createStore } from "zustand/vanilla"

type ApiTokensState = {
  creating: boolean
  /**
   * The token just made, with its secret. Kept while its dialog fades, and
   * dropped when the next one starts, so nothing opens it again.
   */
  created: CreatedApiToken | null
  /** The token being changed, kept while its dialog closes. */
  editing: ApiToken | null
  editOpen: boolean
  /** The token waiting for a yes to revoke, kept the same way. */
  revoking: ApiToken | null
  revokeOpen: boolean
  start: () => void
  setCreating: (creating: boolean) => void
  setCreated: (created: CreatedApiToken) => void
  edit: (token: ApiToken) => void
  closeEdit: () => void
  ask: (token: ApiToken) => void
  closeRevoke: () => void
}

/** The API token dialogs. Each section makes its own. */
export function createSettingsApiTokensStore() {
  return createStore<ApiTokensState>()((set) => ({
    creating: false,
    created: null,
    editing: null,
    editOpen: false,
    revoking: null,
    revokeOpen: false,
    start: () => set({ creating: true, created: null }),
    setCreating: (creating) => set({ creating }),
    setCreated: (created) => set({ created }),
    edit: (editing) => set({ editing, editOpen: true }),
    closeEdit: () => set({ editOpen: false }),
    ask: (revoking) => set({ revoking, revokeOpen: true }),
    closeRevoke: () => set({ revokeOpen: false }),
  }))
}
