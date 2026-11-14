import type { AccessGroup } from "@matinee/contracts"
import { createStore } from "zustand/vanilla"

type AccessPanelState = {
  editing: { group?: AccessGroup }
  editOpen: boolean
  deleting: AccessGroup | null
  deleteOpen: boolean
  edit: (group?: AccessGroup) => void
  setEditOpen: (open: boolean) => void
  askDelete: (group: AccessGroup) => void
  closeDelete: () => void
}

/** Each panel keeps its dialog contents while the closing animation runs. */
export function createSettingsAccessStore() {
  return createStore<AccessPanelState>()((set) => ({
    editing: {},
    editOpen: false,
    deleting: null,
    deleteOpen: false,
    edit: (group) => set({ editing: { group }, editOpen: true }),
    setEditOpen: (editOpen) => set({ editOpen }),
    askDelete: (deleting) => set({ deleting, deleteOpen: true }),
    closeDelete: () => set({ deleteOpen: false }),
  }))
}
