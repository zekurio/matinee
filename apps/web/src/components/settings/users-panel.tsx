import type { AdminUser, InviteLink } from "@matinee/contracts"
import { Badge } from "@matinee/ui/components/badge"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  EllipsisIcon,
  LinkIcon,
  LogOutIcon,
  RefreshCwIcon,
  ShieldIcon,
  ShieldOffIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import { formatDate, formatRelative } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { SettingsSections, SettingsSubsection } from "./settings-panel"
import {
  AddUserDialog,
  ConfirmDialog,
  LinkDialog,
  roleChangeCopy,
  type ShownLink,
} from "./user-dialogs"

// The server moves a session's last-seen time at most hourly, so anything
// more recent than that only says "within the last hour".
const LAST_SEEN_PRECISION_MS = 60 * 60 * 1000

type Confirming = {
  action: "role" | "sign-out" | "delete"
  user: AdminUser
}

const displayName = (user: AdminUser) => user.displayName ?? user.username

/** A passkey or linked account, whether or not single sign-on is on. */
const hasSignInMethod = (user: AdminUser) =>
  user.passkeys > 0 || user.oidcAccounts > 0

export function UsersPanel() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const router = useRouter()
  const users = useQuery(orpc.admin.users.list.queryOptions())
  const session = useQuery(orpc.auth.session.queryOptions())
  const config = useQuery(orpc.auth.config.queryOptions())
  const me = session.data?.user ?? null
  const oidcName = config.data?.oidc?.displayName ?? null
  // Kept after the dialog closes, so its words stay put while it fades.
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [shown, setShown] = useState<ShownLink | null>(null)

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() })

  const setRole = useMutation({
    mutationFn: (user: AdminUser) =>
      client.admin.users.setRole({
        id: user.id,
        role: user.role === "admin" ? "user" : "admin",
      }),
    onSuccess: async (updated) => {
      setConfirmOpen(false)
      const self = updated.id === me?.id
      toast.success(
        updated.role === "admin"
          ? `${displayName(updated)} is now an admin`
          : self
            ? "You're no longer an admin"
            : `${displayName(updated)} is no longer an admin`,
      )
      // Stepping down hides administration, this section included. The
      // shell reads the user from the route, so the route loads again.
      if (self) {
        await queryClient.invalidateQueries({
          queryKey: orpc.auth.session.key(),
        })
        await router.invalidate()
      }
      await refresh()
    },
  })

  const remove = useMutation({
    mutationFn: (user: AdminUser) => client.admin.users.remove({ id: user.id }),
    onSuccess: async (_result, user) => {
      setConfirmOpen(false)
      if (user.id === me?.id) {
        queryClient.clear()
        await navigate({ to: "/login" })
        return
      }
      toast.success(`Deleted ${displayName(user)}`)
      await refresh()
    },
  })

  const signOut = useMutation({
    mutationFn: (user: AdminUser) =>
      client.admin.users.signOut({ id: user.id }),
    onSuccess: async ({ ended }, user) => {
      setConfirmOpen(false)
      const sessions = ended === 1 ? "1 session" : `${ended} sessions`
      toast.success(
        user.id === me?.id
          ? `Ended ${sessions} on other devices`
          : `Signed ${displayName(user)} out of ${sessions}`,
      )
      await refresh()
    },
  })

  const createLink = useMutation({
    mutationFn: (user: AdminUser) =>
      client.admin.users.links.create({ userId: user.id }),
    onSuccess: async (issued, user) => {
      setShown({ username: user.username, issued })
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const revokeLink = useMutation({
    mutationFn: (link: InviteLink) =>
      client.admin.users.links.revoke({ id: link.id }),
    onSuccess: async () => {
      toast.success("Revoked the link")
      await refresh()
    },
    onError: async (error) => {
      toast.error(errorMessage(error))
      await refresh()
    },
  })

  const ask = (action: Confirming["action"], user: AdminUser) => {
    setRole.reset()
    remove.reset()
    signOut.reset()
    setConfirming({ action, user })
    setConfirmOpen(true)
  }
  const closeConfirm = () => setConfirmOpen(false)

  // The server refuses to demote or delete the last admin who can sign in,
  // so the menu says so up front.
  const oidcOn = oidcName !== null
  const signInAdmins =
    users.data?.filter(
      (user) =>
        user.role === "admin" &&
        (user.passkeys > 0 || (oidcOn && user.oidcAccounts > 0)),
    ) ?? []
  const isLastAdmin = (user: AdminUser) =>
    user.role === "admin" && signInAdmins.every((other) => other.id === user.id)

  const action = confirmOpen ? confirming?.action : null
  const target = confirming?.user
  const self = target !== undefined && target.id === me?.id
  const targetName = target ? displayName(target) : ""
  const roleCopy = target ? roleChangeCopy(target, self) : null

  return (
    <SettingsSections>
      <SettingsSubsection
        id="users"
        title="Users"
        description="Everyone with an account on this server. New accounts sign in the first time through a link you send them."
        action={<AddUserDialog />}
      >
        {users.isPending ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : users.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
            <p className="text-muted-foreground text-sm">
              Couldn't load users. {errorMessage(users.error)}
            </p>
            <Button variant="outline" onClick={() => void users.refetch()}>
              <RefreshCwIcon />
              Try again
            </Button>
          </div>
        ) : (
          <List>
            {users.data.map((user) => (
              <UserItem
                key={user.id}
                user={user}
                self={user.id === me?.id}
                oidcName={oidcName}
                lastAdmin={isLastAdmin(user)}
                linkPending={
                  createLink.isPending && createLink.variables?.id === user.id
                }
                onConfirm={(action) => ask(action, user)}
                onNewLink={() => createLink.mutate(user)}
                onRevokeLink={(link) => revokeLink.mutate(link)}
              />
            ))}
          </List>
        )}
      </SettingsSubsection>

      <LinkDialog shown={shown} onClose={() => setShown(null)} />

      <ConfirmDialog
        open={action === "role"}
        title={roleCopy?.title ?? ""}
        description={roleCopy?.description}
        confirmLabel={roleCopy?.confirmLabel ?? ""}
        destructive={target?.role === "admin"}
        pending={setRole.isPending}
        error={setRole.error}
        onConfirm={() => target && setRole.mutate(target)}
        onClose={closeConfirm}
      />
      <ConfirmDialog
        open={action === "sign-out"}
        title={
          self
            ? "Sign out your other sessions?"
            : `Sign ${targetName} out everywhere?`
        }
        description={
          self
            ? "Every other browser and app signed in as you has to sign in again. This one stays signed in."
            : "Every browser and app signed in to this account has to sign in again. Passkeys and links keep working."
        }
        confirmLabel={self ? "Sign out others" : "Sign out everywhere"}
        destructive
        pending={signOut.isPending}
        error={signOut.error}
        onConfirm={() => target && signOut.mutate(target)}
        onClose={closeConfirm}
      />
      <ConfirmDialog
        open={action === "delete"}
        title={self ? "Delete your account?" : `Delete ${targetName}?`}
        description={
          self
            ? "This deletes your account with its passkeys, sessions, and watch progress, and signs you out. It can't be undone."
            : "This deletes the account with its passkeys, sessions, and watch progress. It can't be undone."
        }
        confirmLabel={self ? "Delete my account" : "Delete user"}
        destructive
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() => target && remove.mutate(target)}
        onClose={closeConfirm}
      />
    </SettingsSections>
  )
}

function UserItem({
  user,
  self,
  oidcName,
  lastAdmin,
  linkPending,
  onConfirm,
  onNewLink,
  onRevokeLink,
}: {
  user: AdminUser
  self: boolean
  oidcName: string | null
  lastAdmin: boolean
  linkPending: boolean
  onConfirm: (action: Confirming["action"]) => void
  onNewLink: () => void
  onRevokeLink: (link: InviteLink) => void
}) {
  const name = displayName(user)
  const details = [
    user.displayName ? `@${user.username}` : null,
    signInSummary(user, oidcName),
  ].filter((part) => part !== null)
  const invited = !hasSignInMethod(user) && user.links.length > 0
  const signOutLabel = self ? "Sign out other sessions" : "Sign out everywhere"

  return (
    <ListItem className="items-start gap-3 py-3 pr-2">
      <span
        aria-hidden
        className="bg-secondary mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm leading-5 font-medium">
          <span className="truncate">{name}</span>
          {user.role === "admin" && <Badge variant="secondary">Admin</Badge>}
          {invited && <Badge variant="outline">Invited</Badge>}
          {self && <Badge variant="outline">You</Badge>}
        </p>
        <p className="text-muted-foreground text-[13px] leading-5">
          {details.join(" · ")}
        </p>
        <p className="text-muted-foreground text-[13px] leading-5">
          Joined {formatDate(user.createdAt)} · {activity(user, self)}
        </p>
        {user.links.length > 0 && (
          <ul aria-label="Pending links" className="mt-1.5 flex flex-col gap-1">
            {user.links.map((link) => (
              <li
                key={link.id}
                className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-[13px] leading-5"
              >
                <LinkIcon className="size-3.5 shrink-0" />
                <span>
                  {link.kind === "invite" ? "Invite link" : "Recovery link"}{" "}
                  expires {formatRelative(link.expiresAt)}
                  {link.createdBy && `, made by ${link.createdBy}`}
                </span>
                <Button
                  variant="link"
                  size="xs"
                  className="h-auto px-0"
                  onClick={() => onRevokeLink(link)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label={`Actions for ${name}`}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-56">
          <DropdownMenuItem
            disabled={user.role === "admin" && lastAdmin}
            onClick={() => onConfirm("role")}
          >
            {user.role === "admin" ? <ShieldOffIcon /> : <ShieldIcon />}
            {user.role === "admin"
              ? self
                ? "Step down as admin"
                : "Remove admin role"
              : "Make admin"}
          </DropdownMenuItem>
          {/* Your own passkeys are in the account section. */}
          {!self && (
            <DropdownMenuItem disabled={linkPending} onClick={onNewLink}>
              <LinkIcon />
              {hasSignInMethod(user) ? "New recovery link" : "New invite link"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={user.sessions <= (self ? 1 : 0)}
            onClick={() => onConfirm("sign-out")}
          >
            <LogOutIcon />
            {signOutLabel}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={lastAdmin}
            onClick={() => onConfirm("delete")}
          >
            <Trash2Icon />
            {self ? "Delete my account" : "Delete user"}
          </DropdownMenuItem>
          {lastAdmin && (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="max-w-60 pt-2 font-normal">
                {self ? "You're" : `${name} is`} the only admin who can sign in.
                Make someone who can sign in an admin first.
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </ListItem>
  )
}

/** How the user signs in: passkeys, then linked single sign-on. */
function signInSummary(user: AdminUser, oidcName: string | null): string {
  const parts: string[] = []
  if (user.passkeys > 0) {
    parts.push(user.passkeys === 1 ? "1 passkey" : `${user.passkeys} passkeys`)
  }
  if (user.oidcAccounts > 0) {
    parts.push(
      oidcName ? `${oidcName} linked` : "single sign-on linked, but it's off",
    )
  }
  if (parts.length > 0) return parts.join(", ")
  return user.links.length > 0
    ? "Hasn't used the invite yet"
    : "No way to sign in. Make a new link."
}

function activity(user: AdminUser, self: boolean): string {
  if (self) return "Active now"
  if (!user.lastSeenAt) {
    return hasSignInMethod(user) ? "Not signed in anywhere" : "Never signed in"
  }
  if (Date.now() - user.lastSeenAt.getTime() < LAST_SEEN_PRECISION_MS) {
    return "Active within the last hour"
  }
  return `Last seen ${formatRelative(user.lastSeenAt)}`
}
