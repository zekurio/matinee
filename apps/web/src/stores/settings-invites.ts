import type { CreatedInvite } from "@matinee/contracts"
import { createSignal } from "solid-js"

/** The invite link stays visible until its dialog is explicitly closed. */
export function createSettingsInvitesStore() {
  const [creating, setCreating] = createSignal(false)
  const [created, setCreated] = createSignal<CreatedInvite | null>(null)
  return {
    creating,
    created,
    start: () => {
      setCreating(true)
      setCreated(null)
    },
    setCreating: (next: boolean) => setCreating(next),
    setCreated: (next: CreatedInvite) => setCreated(next),
  }
}
