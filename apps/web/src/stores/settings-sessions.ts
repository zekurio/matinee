import type { Session } from "@matinee/contracts"
import { createSignal } from "solid-js"

/** The session confirmations, with the named session retained during closing. */
export function createSettingsSessionsStore() {
  const [revoking, setRevoking] = createSignal<Session | null>(null)
  const [open, setOpen] = createSignal(false)
  const [revokingOthers, setRevokingOthers] = createSignal(false)
  return {
    revoking,
    open,
    revokingOthers,
    ask: (session: Session) => {
      setRevoking(session)
      setOpen(true)
    },
    close: () => setOpen(false),
    setRevokingOthers: (next: boolean) => setRevokingOthers(next),
  }
}
