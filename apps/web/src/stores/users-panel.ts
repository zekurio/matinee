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
  /** The account whose access is open, kept the same way. */
  accessUserId: string | null
  accessOpen: boolean
  openConfirm: (action: UserAction, user: AdminUser) => void
  closeConfirm: () => void
  openAccess: (user: AdminUser) => void
  closeAccess: () => void
}

/**
 * The users panel's dialogs. Each panel makes its own, so one opened again
 * starts with them closed.
 */
export function createUsersPanelStore() {
  return createStore<UsersPanelState>()((set) => ({
    confirming: null,
    confirmOpen: false,
    accessUserId: null,
    accessOpen: false,
    openConfirm: (action, user) =>
      set({ confirming: { action, user }, confirmOpen: true }),
    closeConfirm: () => set({ confirmOpen: false }),
    openAccess: (user) => set({ accessUserId: user.id, accessOpen: true }),
    closeAccess: () => set({ accessOpen: false }),
  }))
}
