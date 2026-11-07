import { create } from "zustand"

type SettingsDialogState = {
  /**
   * Where the open panel's save bar renders: a slot on the panel's bottom
   * edge, outside the scrolling content. Null while no section is open.
   */
  saveBarSlot: HTMLElement | null
  /** The slot's ref callback. */
  setSaveBarSlot: (node: HTMLElement | null) => void
}

/** The settings dialog's state. There is one dialog, so one store. */
export const useSettingsDialogStore = create<SettingsDialogState>()((set) => ({
  saveBarSlot: null,
  setSaveBarSlot: (node) => {
    set({ saveBarSlot: node })
  },
}))
