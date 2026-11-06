import {
  type AdminUser,
  type IssuedLink,
  Username,
  type UserRole,
} from "@matinee/contracts"
import { Alert, AlertDescription } from "@matinee/ui/components/alert"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CheckIcon,
  CopyIcon,
  TriangleAlertIcon,
  UserPlusIcon,
} from "lucide-react"
import { type ReactNode, useState } from "react"

import { formatDate } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"

const roles: { value: UserRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
]

/** A link the server just made, with the account it signs in to. */
export type ShownLink = { username: string; issued: IssuedLink }

/** The section's add button, and the dialog that ends with the invite link. */
export function AddUserDialog() {
  const [open, setOpen] = useState(false)
  // Set once the account exists; the dialog then shows its link.
  const [created, setCreated] = useState<ShownLink | null>(null)

  return (
    <>
      <Button
        onClick={() => {
          setCreated(null)
          setOpen(true)
        }}
      >
        <UserPlusIcon />
        Add user
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-5 p-6 sm:max-w-md">
          {open &&
            (created ? (
              <LinkView shown={created} onDone={() => setOpen(false)} />
            ) : (
              <AddUserForm
                onCreated={setCreated}
                onCancel={() => setOpen(false)}
              />
            ))}
        </DialogContent>
      </Dialog>
    </>
  )
}

function AddUserForm({
  onCreated,
  onCancel,
}: {
  onCreated: (created: ShownLink) => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState("")
  const [role, setRole] = useState<UserRole>("user")
  const [touched, setTouched] = useState(false)
  const parsed = Username.safeParse(username)
  const create = useMutation({
    mutationFn: (input: { username: string; role: UserRole }) =>
      client.admin.users.create(input),
    onSuccess: async ({ user, ...issued }) => {
      onCreated({ username: user.username, issued })
      await queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() })
    },
  })
  const message =
    touched && !parsed.success
      ? parsed.error?.issues[0]?.message
      : create.error
        ? errorMessage(create.error)
        : undefined

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        setTouched(true)
        if (parsed.success && !create.isPending) {
          create.mutate({ username: parsed.data, role })
        }
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          Add a user
        </DialogTitle>
        <DialogDescription>
          Matinee makes an invite link for the account. Whoever opens it creates
          a passkey and signs in.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={message ? true : undefined}>
          <FieldLabel htmlFor="new-user-username">Username</FieldLabel>
          <Input
            id="new-user-username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            aria-invalid={message ? true : undefined}
            onChange={(event) => setUsername(event.target.value)}
            onBlur={() => setTouched(username.length > 0)}
          />
          {message && <FieldError>{message}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="new-user-role">Role</FieldLabel>
          <Select
            items={roles}
            value={role}
            onValueChange={(value) => value && setRole(value)}
          >
            <SelectTrigger id="new-user-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {role === "admin"
              ? "Admins manage libraries, sign-in settings, and every account."
              : "Users watch the libraries on this server."}
          </FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending && <Spinner />}
          Create and get link
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Shows a link the server just made. It can't be shown again. */
export function LinkDialog({
  shown,
  onClose,
}: {
  shown: ShownLink | null
  onClose: () => void
}) {
  return (
    <Dialog open={shown !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        {shown && <LinkView shown={shown} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function LinkView({
  shown: { username, issued },
  onDone,
}: {
  shown: ShownLink
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)
  const invite = issued.link.kind === "invite"

  return (
    <div className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          {invite
            ? `Send ${username} this invite`
            : `Recovery link for ${username}`}
        </DialogTitle>
        <DialogDescription>
          {invite
            ? "Opening it lets them create a passkey and sign in."
            : "Opening it lets them add a new passkey and sign in. Their other passkeys keep working."}{" "}
          It works once, until {formatDate(issued.link.expiresAt)}, and replaces
          any earlier link for {username}.
        </DialogDescription>
      </DialogHeader>
      <div className="flex gap-2">
        <Input
          readOnly
          aria-label="Link"
          value={issued.url}
          className="font-mono text-[13px]"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => {
            void navigator.clipboard
              .writeText(issued.url)
              .then(() => setCopied(true))
              .then(() => setTimeout(() => setCopied(false), 1500))
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Alert>
        <TriangleAlertIcon />
        <AlertDescription className="text-foreground">
          Anyone with the link can sign in as {username}, so send it only to
          them. Matinee won't show it again.
        </AlertDescription>
      </Alert>
      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}

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
      description:
        "Admins manage libraries, sign-in settings, and every account, yours included.",
      confirmLabel: "Make admin",
    }
  }
  if (self) {
    return {
      title: "Step down as admin?",
      description:
        "You lose access to administration right away. Another admin has to give it back.",
      confirmLabel: "Step down",
    }
  }
  return {
    title: `Remove ${name}'s admin role?`,
    description:
      "They keep their account and watch progress, and lose administration on their next request.",
    confirmLabel: "Remove admin role",
  }
}
