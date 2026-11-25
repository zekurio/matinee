import type { AdminUser } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { Show } from "solid-js"

import { tr } from "@/i18n"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/kit/alert-dialog"
import { Button } from "@/kit/button"
import { Spinner } from "@/kit/spinner"
import type { UserAction } from "@/stores/users-panel"

/** Asks before an action on an account. A failure gets a toast. */
export function ConfirmDialog(props: {
  open: boolean
  title: string
  description: JSX.Element
  confirmLabel: string
  destructive?: boolean
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next && !props.pending) props.onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.pending}>
            {tr("users.dialog.cancel")}
          </AlertDialogCancel>
          <Button
            variant={props.destructive ? "destructive" : "default"}
            disabled={props.pending}
            onClick={() => props.onConfirm()}
          >
            <Show when={props.pending}>
              <Spinner />
            </Show>
            {props.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type ConfirmCopy = { title: string; description: string; confirmLabel: string }

/** The words for confirming `action` on `user`, by whose account it is. */
export function confirmCopy(
  action: UserAction,
  user: AdminUser,
  self: boolean,
): ConfirmCopy {
  const name = user.displayName ?? user.username
  if (action === "role") return roleChangeCopy(user, name, self)
  if (action === "sign-out") {
    return {
      title: self
        ? tr("users.signOut.ownTitle")
        : tr("users.signOut.title", { name }),
      description: self
        ? tr("users.signOut.ownDescription")
        : tr("users.signOut.description"),
      confirmLabel: self
        ? tr("users.signOut.ownConfirm")
        : tr("users.signOut.confirm"),
    }
  }
  if (action === "revoke-tokens") {
    return {
      title: self
        ? tr("users.revokeTokens.ownTitle")
        : tr("users.revokeTokens.title", { name }),
      description: tr("users.revokeTokens.description"),
      confirmLabel: tr("users.revokeTokens.confirm"),
    }
  }
  return {
    title: self
      ? tr("users.delete.ownTitle")
      : tr("users.delete.title", { name }),
    description: self
      ? tr("users.delete.ownDescription")
      : tr("users.delete.description"),
    confirmLabel: self
      ? tr("users.delete.ownConfirm")
      : tr("users.delete.confirm"),
  }
}

/** The words for confirming a role change, by direction and whose it is. */
function roleChangeCopy(
  user: AdminUser,
  name: string,
  self: boolean,
): ConfirmCopy {
  if (user.role === "user") {
    return {
      title: tr("users.role.makeTitle", { name }),
      description: tr("users.role.makeDescription"),
      confirmLabel: tr("users.role.makeConfirm"),
    }
  }
  if (self) {
    return {
      title: tr("users.role.stepDownTitle"),
      description: tr("users.role.stepDownDescription"),
      confirmLabel: tr("users.role.stepDownConfirm"),
    }
  }
  return {
    title: tr("users.role.removeTitle", { name }),
    description: tr("users.role.removeDescription"),
    confirmLabel: tr("users.role.removeConfirm"),
  }
}
