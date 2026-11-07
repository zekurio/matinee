import type { AdminUser } from "@matinee/contracts"
import { createStore } from "zustand/vanilla"

/** What the users panel asks about before it does it. */
export type UserAction = "role" | "sign-out" | "delete"

type UsersPanelState = {
  /**
   * The action waiting for a yes, and whose account it's on. Kept after the
   * dialog closes, so its words stay put while it fades.
   */
  confirming: { action: UserAction; user: AdminUser } | null
  confirmOpen: boolean
  openConfirm: (action: UserAction, user: AdminUser) => void
  closeConfirm: () => void
}

/**
 * The users panel's dialogs. Each panel makes its own, so one opened again
 * starts with them closed.
 */
export function createUsersPanelStore() {
  return createStore<UsersPanelState>()((set) => ({
    confirming: null,
    confirmOpen: false,
    openConfirm: (action, user) =>
      set({ confirming: { action, user }, confirmOpen: true }),
    closeConfirm: () => set({ confirmOpen: false }),
  }))
}
