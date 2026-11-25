import type { AdminUser } from "@matinee/contracts"
import { createSignal } from "solid-js"

/** What the users panel asks about before it does it. */
export type UserAction = "role" | "sign-out" | "revoke-tokens" | "delete"

/**
 * The users panel's dialogs. Each panel makes its own, so one opened again
 * starts with them closed. Signals rather than a store, so the dialogs get
 * the account as the list sent it.
 */
export function createUsersPanelStore() {
  /**
   * The action waiting for a yes, and whose account it's on. Kept after the
   * dialog closes, so its words stay put while it fades.
   */
  const [confirming, setConfirming] = createSignal<{
    action: UserAction
    user: AdminUser
  } | null>(null)
  const [confirmOpen, setConfirmOpen] = createSignal(false)
  /** The account whose access is open, kept the same way. */
  const [accessUserId, setAccessUserId] = createSignal<string | null>(null)
  const [accessOpen, setAccessOpen] = createSignal(false)
  return {
    confirming,
    confirmOpen,
    accessUserId,
    accessOpen,
    openConfirm: (action: UserAction, user: AdminUser) => {
      setConfirming({ action, user })
      setConfirmOpen(true)
    },
    closeConfirm: () => setConfirmOpen(false),
    openAccess: (user: AdminUser) => {
      setAccessUserId(user.id)
      setAccessOpen(true)
    },
    closeAccess: () => setAccessOpen(false),
  }
}
