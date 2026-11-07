import type { AdminUser } from "@matinee/contracts"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@matinee/ui/components/alert-dialog"
import { Button } from "@matinee/ui/components/button"
import { Spinner } from "@matinee/ui/components/spinner"
import type { ReactNode } from "react"

import { tr } from "@/i18n"
import { errorMessage } from "@/lib/rpc"

/** Asks before an action on an account, and shows why it failed. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  destructive?: boolean
  pending: boolean
  error: Error | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !next && !pending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {tr("users.dialog.cancel")}
          </AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && <Spinner />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** The words for confirming a role change, by direction and whose it is. */
export function roleChangeCopy(user: AdminUser, self: boolean) {
  const name = user.displayName ?? user.username
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
