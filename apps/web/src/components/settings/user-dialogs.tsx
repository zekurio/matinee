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
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
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
      title: `Make ${name} an admin?`,
      description: "Admins manage libraries, settings, and every account.",
      confirmLabel: "Make admin",
    }
  }
  if (self) {
    return {
      title: "Step down as admin?",
      description: "Only another admin can give it back.",
      confirmLabel: "Step down",
    }
  }
  return {
    title: `Remove ${name}'s admin role?`,
    description: "They keep their account and watch progress.",
    confirmLabel: "Remove admin role",
  }
}
