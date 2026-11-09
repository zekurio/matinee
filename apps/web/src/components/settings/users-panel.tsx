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
import { tr } from "@/i18n"
import { formatDate, formatRelative } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { createUsersPanelStore, type UserAction } from "@/stores/users-panel"

import { SettingsSections, SettingsSubsection } from "./settings-panel"
import { confirmCopy, ConfirmDialog } from "./user-dialogs"

// The server moves a session's last-seen time at most hourly, so anything
// more recent than that only says "within the last hour".
const LAST_SEEN_PRECISION_MS = 60 * 60 * 1000

const displayName = (user: AdminUser) => user.displayName ?? user.username

/** A passkey or linked account, whether or not it signs in now. */
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
          ? tr("users.madeAdmin", { name: displayName(updated) })
          : self
            ? tr("users.steppedDown")
            : tr("users.removedAdmin", { name: displayName(updated) }),
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
      toast.success(tr("users.deleted", { name: displayName(user) }))
      await refresh()
    },
  })

  const signOut = useMutation({
    mutationFn: (user: AdminUser) =>
      client.admin.users.signOut({ id: user.id }),
    onSuccess: async ({ ended }, user) => {
      closeConfirm()
      toast.success(
        user.id === me?.id
          ? tr("users.endedOwnSessions", { count: ended })
          : tr("users.endedSessions", {
              count: ended,
              name: displayName(user),
            }),
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
  const passkeysOn = config.data?.passkeys ?? true
  const signInAdmins =
    users.data?.filter(
      (user) =>
        user.role === "admin" &&
        ((passkeysOn && user.passkeys > 0) || (oidcOn && user.oidcLinked)),
    ) ?? []
  const isLastAdmin = (user: AdminUser) =>
    user.role === "admin" && signInAdmins.every((other) => other.id === user.id)

  // Kept while the dialog closes, so its words stay put as it fades.
  const mutation = confirming
    ? { role: setRole, "sign-out": signOut, delete: remove }[confirming.action]
    : null
  const copy = confirming
    ? confirmCopy(
        confirming.action,
        confirming.user,
        confirming.user.id === me?.id,
      )
    : null

  return (
    <SettingsSections>
      <SettingsSubsection id="users" title={tr("users.title")}>
        {users.isPending ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : users.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
            <p className="text-muted-foreground text-sm">
              {tr("users.loadFailed", { error: errorMessage(users.error) })}
            </p>
            <Button variant="outline" onClick={() => void users.refetch()}>
              <RefreshCwIcon />
              {tr("users.retry")}
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
                passkeysOn={passkeysOn}
                lastAdmin={isLastAdmin(user)}
                onConfirm={(action) => ask(action, user)}
              />
            ))}
          </List>
        )}
      </SettingsSubsection>

      <ConfirmDialog
        open={confirmOpen}
        title={copy?.title ?? ""}
        description={copy?.description}
        confirmLabel={copy?.confirmLabel ?? ""}
        destructive={
          confirming?.action !== "role" || confirming.user.role === "admin"
        }
        pending={mutation?.isPending ?? false}
        error={mutation?.error ?? null}
        onConfirm={() => confirming && mutation?.mutate(confirming.user)}
        onClose={closeConfirm}
      />
    </SettingsSections>
  )
}

function UserItem({
  user,
  self,
  oidcName,
  passkeysOn,
  lastAdmin,
  onConfirm,
}: {
  user: AdminUser
  self: boolean
  oidcName: string | null
  passkeysOn: boolean
  lastAdmin: boolean
  onConfirm: (action: UserAction) => void
}) {
  const name = displayName(user)
  const signOutLabel = self
    ? tr("users.menu.signOutOthers")
    : tr("users.menu.signOut")
  const lastAdminNote = tr("users.lastAdmin")

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
              aria-label={tr("users.admin")}
              className="text-muted-foreground size-3.5 shrink-0"
            />
          )}
          {self && (
            <span className="text-muted-foreground font-normal">
              {tr("users.you")}
            </span>
          )}
        </p>
        <UserDetails
          user={user}
          self={self}
          oidcName={oidcName}
          passkeysOn={passkeysOn}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label={tr("users.actions", { name })}
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
                ? tr("users.menu.stepDown")
                : tr("users.menu.removeAdmin")
              : tr("users.menu.makeAdmin")}
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
            {self ? tr("users.menu.deleteOwn") : tr("users.menu.delete")}
          </BlockableItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListItem>
  )
}

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
  passkeysOn,
}: {
  user: AdminUser
  self: boolean
  oidcName: string | null
  passkeysOn: boolean
}) {
  let facts: ReactNode
  if (hasSignInMethod(user)) {
    const { label, tone } = activity(user, self)
    facts = (
      <>
        <Fact icon={<StatusDot tone={tone} />}>{label}</Fact>
        {user.passkeys > 0 && (
          <Fact icon={<KeyRoundIcon />}>
            {passkeysOn
              ? tr("users.passkeys", { count: user.passkeys })
              : tr("users.passkeysOff", { count: user.passkeys })}
          </Fact>
        )}
        {user.oidcLinked && (
          <Fact icon={<LogInIcon />}>{oidcName ?? tr("users.oidcOff")}</Fact>
        )}
      </>
    )
  } else {
    facts = (
      <Fact icon={<TriangleAlertIcon className="text-warning" />}>
        {tr("users.noSignIn")}
      </Fact>
    )
  }

  return (
    <p
      className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3.5 gap-y-0.5 text-[13px] leading-5"
      title={tr("users.joined", { date: formatDate(user.createdAt) })}
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
  if (self) return { label: tr("users.activeNow"), tone: "live" }
  if (!user.lastSeenAt) return { label: tr("users.signedOut"), tone: "idle" }
  if (Date.now() - user.lastSeenAt.getTime() < LAST_SEEN_PRECISION_MS) {
    return { label: tr("users.activeRecently"), tone: "live" }
  }
  return {
    label: tr("users.lastSeen", { when: formatRelative(user.lastSeenAt) }),
    tone: "idle",
  }
}
