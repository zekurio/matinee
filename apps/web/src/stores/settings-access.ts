import type { AccessGroup } from "@matinee/contracts"
import { createSignal } from "solid-js"

/**
 * Each panel keeps its dialog contents while the closing animation runs.
 * Signals rather than a store, so the editor gets the group as the list
 * sent it.
 */
export function createSettingsAccessStore() {
  const [editing, setEditing] = createSignal<{ group?: AccessGroup }>({})
  const [editOpen, setEditOpen] = createSignal(false)
  const [deleting, setDeleting] = createSignal<AccessGroup | null>(null)
  const [deleteOpen, setDeleteOpen] = createSignal(false)
  return {
    editing,
    editOpen,
    deleting,
    deleteOpen,
    edit: (group?: AccessGroup) => {
      setEditing({ group })
      setEditOpen(true)
    },
    setEditOpen: (open: boolean) => setEditOpen(open),
    askDelete: (group: AccessGroup) => {
      setDeleting(group)
      setDeleteOpen(true)
    },
    closeDelete: () => setDeleteOpen(false),
  }
}
