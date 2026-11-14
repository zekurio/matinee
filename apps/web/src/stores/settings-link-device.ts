import { createStore } from "zustand/vanilla"

type LinkDeviceState = {
  open: boolean
  code: string | null
  start: () => void
  close: () => void
  setCode: (code: string | null) => void
}

/** A separate sign-in flow for each link-device button. */
export function createSettingsLinkDeviceStore() {
  return createStore<LinkDeviceState>()((set) => ({
    open: false,
    code: null,
    start: () => set({ open: true, code: null }),
    close: () => set({ open: false }),
    setCode: (code) => set({ code }),
  }))
}
