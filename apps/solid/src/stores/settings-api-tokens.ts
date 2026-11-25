import type { ApiToken, CreatedApiToken } from "@matinee/contracts"
import { createSignal } from "solid-js"

/** The API token dialogs. Each section makes its own. */
export function createSettingsApiTokensStore() {
  const [creating, setCreating] = createSignal(false)
  /**
   * The token just made, with its secret. Kept while its dialog fades, and
   * dropped when the next one starts, so nothing opens it again.
   */
  const [created, setCreated] = createSignal<CreatedApiToken | null>(null)
  /** The token being changed, kept while its dialog closes. */
  const [editing, setEditing] = createSignal<ApiToken | null>(null)
  const [editOpen, setEditOpen] = createSignal(false)
  /** The token waiting for a yes to revoke, kept the same way. */
  const [revoking, setRevoking] = createSignal<ApiToken | null>(null)
  const [revokeOpen, setRevokeOpen] = createSignal(false)
  return {
    creating,
    created,
    editing,
    editOpen,
    revoking,
    revokeOpen,
    start: () => {
      setCreating(true)
      setCreated(null)
    },
    setCreating: (next: boolean) => setCreating(next),
    setCreated: (next: CreatedApiToken) => setCreated(next),
    edit: (token: ApiToken) => {
      setEditing(token)
      setEditOpen(true)
    },
    closeEdit: () => setEditOpen(false),
    ask: (token: ApiToken) => {
      setRevoking(token)
      setRevokeOpen(true)
    },
    closeRevoke: () => setRevokeOpen(false),
  }
}
