import type { AdminUser } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@matinee/ui/components/tooltip"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  EllipsisIcon,
  KeyRoundIcon,
  LogInIcon,
  LogOutIcon,
  RefreshCwIcon,
  ShieldIcon,
  ShieldOffIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"
import { type ComponentProps, type ReactNode, useState } from "react"
import { useStore } from "zustand"

import { UserAvatar } from "@/components/user-avatar"
import { formatDate, formatRelative } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { createUsersPanelStore, type UserAction } from "@/stores/users-panel"

import { SettingsSections, SettingsSubsection } from "./settings-panel"
import { ConfirmDialog, roleChangeCopy } from "./user-dialogs"

// The server moves a session's last-seen time at most hourly, so anything
// more recent than that only says "within the last hour".
const LAST_SEEN_PRECISION_MS = 60 * 60 * 1000

const displayName = (user: AdminUser) => user.displayName ?? user.username

/** A passkey or linked account, whether or not single sign-on is on. */
const hasSignInMethod = (user: AdminUser) =>
  user.passkeys > 0 || user.oidcLinked

export function UsersPanel() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const router = useRouter()
  const users = useQuery(orpc.admin.users.list.queryOptions())
  const session = useQuery(orpc.auth.session.queryOptions())
  const config = useQuery(orpc.auth.config.queryOptions())
  const me = session.data?.user ?? null
  const oidcName = config.data?.oidc?.displayName ?? null
  const [store] = useState(createUsersPanelStore)
  const confirming = useStore(store, (state) => state.confirming)
  const confirmOpen = useStore(store, (state) => state.confirmOpen)
  const { openConfirm, closeConfirm } = store.getState()

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() })

  const setRole = useMutation({
    mutationFn: (user: AdminUser) =>
      client.admin.users.setRole({
        id: user.id,
        role: user.role === "admin" ? "user" : "admin",
      }),
    onSuccess: async (updated) => {
      closeConfirm()
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
      closeConfirm()
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
      closeConfirm()
      const sessions = ended === 1 ? "1 session" : `${ended} sessions`
      toast.success(
        user.id === me?.id
          ? `Ended ${sessions} on other devices`
          : `Signed ${displayName(user)} out of ${sessions}`,
      )
      await refresh()
    },
  })

  const ask = (action: UserAction, user: AdminUser) => {
    setRole.reset()
    remove.reset()
    signOut.reset()
    openConfirm(action, user)
  }

  // The server refuses to demote or delete the last admin who can sign in,
  // so the menu says so up front.
  const oidcOn = oidcName !== null
  const signInAdmins =
    users.data?.filter(
      (user) =>
        user.role === "admin" &&
        (user.passkeys > 0 || (oidcOn && user.oidcLinked)),
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
      <SettingsSubsection id="users" title="Users">
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
                onConfirm={(action) => ask(action, user)}
              />
            ))}
          </List>
        )}
      </SettingsSubsection>

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
            ? "Every other device has to sign in again."
            : "Every device has to sign in again."
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
            ? "Your passkeys and watch progress go with it. This can't be undone."
            : "Their passkeys and watch progress go with it. This can't be undone."
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
  onConfirm,
}: {
  user: AdminUser
  self: boolean
  oidcName: string | null
  lastAdmin: boolean
  onConfirm: (action: UserAction) => void
}) {
  const name = displayName(user)
  const signOutLabel = self ? "Sign out other sessions" : "Sign out everywhere"

  return (
    <ListItem className="gap-3 py-2.5 pr-2">
      <UserAvatar user={user} className="size-8 self-start text-[13px]" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm leading-5 font-medium">
          <span className="truncate">{name}</span>
          {user.displayName && (
            <span className="text-muted-foreground truncate font-normal">
              @{user.username}
            </span>
          )}
          {user.role === "admin" && (
            <ShieldIcon
              role="img"
              aria-label="Admin"
              className="text-muted-foreground size-3.5 shrink-0"
            />
          )}
          {self && (
            <span className="text-muted-foreground font-normal">(you)</span>
          )}
        </p>
        <UserDetails user={user} self={self} oidcName={oidcName} />
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
          <BlockableItem
            blocked={user.role === "admin" && lastAdmin ? lastAdminNote : null}
            onClick={() => onConfirm("role")}
          >
            {user.role === "admin" ? <ShieldOffIcon /> : <ShieldIcon />}
            {user.role === "admin"
              ? self
                ? "Step down as admin"
                : "Remove admin role"
              : "Make admin"}
          </BlockableItem>
          <DropdownMenuItem
            disabled={user.sessions <= (self ? 1 : 0)}
            onClick={() => onConfirm("sign-out")}
          >
            <LogOutIcon />
            {signOutLabel}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <BlockableItem
            variant="destructive"
            blocked={lastAdmin ? lastAdminNote : null}
            onClick={() => onConfirm("delete")}
          >
            <Trash2Icon />
            {self ? "Delete my account" : "Delete user"}
          </BlockableItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListItem>
  )
}

const lastAdminNote = "Make someone else an admin first."

/**
 * A menu item that may be off for a reason. A disabled item can't be
 * hovered, so a blocked one stays focusable, looks disabled, does nothing,
 * and gives the reason in a tooltip.
 */
function BlockableItem({
  blocked,
  onClick,
  ...props
}: ComponentProps<typeof DropdownMenuItem> & { blocked: string | null }) {
  if (!blocked) return <DropdownMenuItem onClick={onClick} {...props} />
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <DropdownMenuItem
            {...props}
            aria-disabled
            closeOnClick={false}
            className="cursor-not-allowed opacity-50"
          />
        }
      />
      <TooltipContent side="left">{blocked}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The line under a user's name: where they stand, then how they sign in.
 * Each fact gets a glyph, so the line reads without separators.
 */
function UserDetails({
  user,
  self,
  oidcName,
}: {
  user: AdminUser
  self: boolean
  oidcName: string | null
}) {
  let facts: ReactNode
  if (hasSignInMethod(user)) {
    const { label, tone } = activity(user, self)
    facts = (
      <>
        <Fact icon={<StatusDot tone={tone} />}>{label}</Fact>
        {user.passkeys > 0 && (
          <Fact icon={<KeyRoundIcon />}>
            {user.passkeys === 1 ? "1 passkey" : `${user.passkeys} passkeys`}
          </Fact>
        )}
        {user.oidcLinked && (
          <Fact icon={<LogInIcon />}>{oidcName ?? "Single sign-on (off)"}</Fact>
        )}
      </>
    )
  } else {
    facts = (
      <Fact icon={<TriangleAlertIcon className="text-warning" />}>
        No way to sign in
      </Fact>
    )
  }

  return (
    <p
      className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3.5 gap-y-0.5 text-[13px] leading-5"
      title={`Joined ${formatDate(user.createdAt)}`}
    >
      {facts}
    </p>
  )
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:opacity-80">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

type Tone = "live" | "idle"

const dotClassName = {
  live: "bg-success ring-[3px] ring-success-soft",
  idle: "border-[1.5px] border-muted-foreground/60",
} satisfies Record<Tone, string>

/** A presence dot, sized to sit in an icon's slot. */
function StatusDot({ tone }: { tone: Tone }) {
  return (
    <span aria-hidden className="grid size-3.5 shrink-0 place-items-center">
      <span className={`size-2 rounded-full ${dotClassName[tone]}`} />
    </span>
  )
}

/** What a user's presence reads as, and the dot that goes with it. */
type Activity = { label: string; tone: Tone }

function activity(user: AdminUser, self: boolean): Activity {
  if (self) return { label: "Active now", tone: "live" }
  if (!user.lastSeenAt) return { label: "Signed out", tone: "idle" }
  if (Date.now() - user.lastSeenAt.getTime() < LAST_SEEN_PRECISION_MS) {
    return { label: "Active recently", tone: "live" }
  }
  return {
    label: `Last seen ${formatRelative(user.lastSeenAt)}`,
    tone: "idle",
  }
}
