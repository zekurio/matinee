import { createSignal } from "solid-js"

/** A separate sign-in flow for each link-device button. */
export function createSettingsLinkDeviceStore() {
  const [open, setOpen] = createSignal(false)
  const [code, setCode] = createSignal<string | null>(null)
  return {
    open,
    code,
    start: () => {
      setOpen(true)
      setCode(null)
    },
    close: () => setOpen(false),
    setCode: (next: string | null) => setCode(next),
  }
}
