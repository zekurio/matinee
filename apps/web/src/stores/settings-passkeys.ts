import type { Passkey } from "@matinee/contracts"
import { createSignal } from "solid-js"

/** Holds the passkey's name through the confirmation's closing animation. */
export function createSettingsPasskeysStore() {
  const [removing, setRemoving] = createSignal<Passkey | null>(null)
  const [open, setOpen] = createSignal(false)
  return {
    removing,
    open,
    ask: (passkey: Passkey) => {
      setRemoving(passkey)
      setOpen(true)
    },
    close: () => setOpen(false),
  }
}
