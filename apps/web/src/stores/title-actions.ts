import type { MediaItem } from "@matinee/contracts"
import { createStore } from "zustand/vanilla"

type ActionsState = {
  file: MediaItem | null
  downloading: boolean | null
  titleId: string | null
  identifying: boolean
  editingImages: boolean
  setFile: (file: MediaItem) => void
  setDownloading: (downloading: boolean) => void
  setTitleId: (titleId: string) => void
  setIdentifying: (identifying: boolean) => void
  setEditingImages: (editingImages: boolean) => void
}

/** One menu's dialogs, retained while they animate closed. */
export function createTitleActionsStore() {
  return createStore<ActionsState>()((set) => ({
    file: null,
    downloading: null,
    titleId: null,
    identifying: false,
    editingImages: false,
    setFile: (file) => set({ file }),
    setDownloading: (downloading) => set({ downloading }),
    setTitleId: (titleId) => set({ titleId }),
    setIdentifying: (identifying) => set({ identifying }),
    setEditingImages: (editingImages) => set({ editingImages }),
  }))
}
