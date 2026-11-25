import type { Library } from "@matinee/contracts"
import { createSignal } from "solid-js"

/** Keeps the edited library in place while its dialog closes. */
export function createSettingsLibrariesStore() {
  // Signals, not a store: the library goes into a form as it is.
  const [library, setLibrary] = createSignal<Library | undefined>()
  const [open, setOpen] = createSignal(false)
  return {
    library,
    open,
    edit: (next?: Library) => {
      setLibrary(() => next)
      setOpen(true)
    },
    close: () => setOpen(false),
  }
}
