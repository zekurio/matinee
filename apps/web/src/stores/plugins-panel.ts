import type { PluginPreview } from "@matinee/contracts"
import { createStore } from "zustand/vanilla"

/** Where the install dialog stands: naming a plugin, or its consent step. */
export type InstallStep =
  | { step: "pick" }
  | {
      step: "consent"
      preview: PluginPreview
      /** The package or address it came from, as the admin named it. */
      source: string
    }

type PluginsPanelState = {
  /** The plugin whose page is open in the panel, or null for the list. */
  openId: string | null
  /**
   * The plugin whose page was open last, so going back to the list puts
   * focus on its row again.
   */
  returnId: string | null
  /** The open plugin's settings have edits that aren't saved. */
  configDirty: boolean
  installOpen: boolean
  /** Kept after the dialog closes, so its content stays while it fades. */
  install: InstallStep
  openPlugin: (id: string) => void
  backToList: () => void
  setConfigDirty: (dirty: boolean) => void
  startAdd: () => void
  /** Opens the dialog at the consent step, as an update does. */
  showPreview: (preview: PluginPreview, source: string) => void
  backToPick: () => void
  closeInstall: () => void
}

/**
 * The plugins panel: which plugin's page is open, and the install dialog.
 * Each panel makes its own, so one opened again starts on the list.
 */
export function createPluginsPanelStore() {
  return createStore<PluginsPanelState>()((set) => ({
    openId: null,
    returnId: null,
    configDirty: false,
    installOpen: false,
    install: { step: "pick" },
    openPlugin: (id) => set({ openId: id, returnId: id, configDirty: false }),
    backToList: () => set({ openId: null, configDirty: false }),
    setConfigDirty: (configDirty) => set({ configDirty }),
    startAdd: () => set({ installOpen: true, install: { step: "pick" } }),
    showPreview: (preview, source) =>
      set({ installOpen: true, install: { step: "consent", preview, source } }),
    backToPick: () => set({ install: { step: "pick" } }),
    closeInstall: () => set({ installOpen: false }),
  }))
}

export type PluginsPanelStore = ReturnType<typeof createPluginsPanelStore>
