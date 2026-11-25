import type { AdminUser, Permission } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { useNavigate, useRouter } from "@tanstack/solid-router"
import {
  Ellipsis,
  KeyRound,
  KeySquare,
  LogIn,
  LogOut,
  RefreshCw,
  Shield,
  ShieldOff,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
} from "lucide"
import { For, omit, Show } from "solid-js"

import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { Badge } from "@/kit/badge"
import { Button, buttonVariants } from "@/kit/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { List, ListItem } from "@/kit/list"
import { Skeleton } from "@/kit/skeleton"
import { toast } from "@/kit/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/kit/tooltip"
import { formatDate, formatRelative } from "@/lib/format"
import { can } from "@/lib/permissions"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { createUsersPanelStore, type UserAction } from "@/stores/users-panel"

import { Fact } from "./access-facts"
import { Invites } from "./invites"
import { SettingsSections, SettingsSubsection } from "./settings-panel"
import { UserAccessDialog } from "./user-access-dialog"
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
  const users = useQuery(() => orpc.admin.users.list.queryOptions())
  const session = useQuery(() => orpc.auth.session.queryOptions())
  const config = useQuery(() => orpc.auth.config.queryOptions())
  const usersData = () => (users.isSuccess ? users.data : undefined)
  const me = () => (session.isSuccess ? session.data.user : null)
  // The menu offers only what the account may do. The server also keeps
  // anyone from changing an account that may do more than they may.
  const may = (permission: Permission) => {
    const user = me()
    return user !== null && can(user, permission)
  }
  const oidcName = () =>
    config.isSuccess ? (config.data.oidc?.displayName ?? null) : null
  const store = createUsersPanelStore()

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() })

  const setRole = useMutation(() => ({
    mutationFn: (user: AdminUser) =>
      client.admin.users.setRole({
        id: user.id,
        role: user.role === "admin" ? "user" : "admin",
      }),
    onSuccess: async (updated: AdminUser) => {
      store.closeConfirm()
      const self = updated.id === me()?.id
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
    onError: (error: Error) => toast.error(errorMessage(error)),
  }))

  const remove = useMutation(() => ({
    mutationFn: (user: AdminUser) => client.admin.users.remove({ id: user.id }),
    onSuccess: async (_result, user) => {
      store.closeConfirm()
      if (user.id === me()?.id) {
        queryClient.clear()
        await navigate({ to: "/login" })
        return
      }
      toast.success(tr("users.deleted", { name: displayName(user) }))
      await refresh()
    },
    onError: (error: Error) => toast.error(errorMessage(error)),
  }))

  const signOut = useMutation(() => ({
    mutationFn: (user: AdminUser) =>
      client.admin.users.signOut({ id: user.id }),
    onSuccess: async ({ ended }: { ended: number }, user: AdminUser) => {
      store.closeConfirm()
      toast.success(
        user.id === me()?.id
          ? tr("users.endedOwnSessions", { count: ended })
          : tr("users.endedSessions", {
              count: ended,
              name: displayName(user),
            }),
      )
      await refresh()
    },
    onError: (error: Error) => toast.error(errorMessage(error)),
  }))

  const revokeTokens = useMutation(() => ({
    mutationFn: (user: AdminUser) =>
      client.admin.users.revokeApiTokens({ id: user.id }),
    onSuccess: async ({ revoked }: { revoked: number }, user: AdminUser) => {
      store.closeConfirm()
      toast.success(
        tr("users.revokedTokens", { count: revoked, name: displayName(user) }),
      )
      await refresh()
      // Your own tokens are listed in your account too.
      if (user.id === me()?.id) {
        await queryClient.invalidateQueries({
          queryKey: orpc.account.apiTokens.key(),
        })
      }
    },
    onError: (error: Error) => toast.error(errorMessage(error)),
  }))

  const ask = (action: UserAction, user: AdminUser) => {
    setRole.reset()
    remove.reset()
    signOut.reset()
    revokeTokens.reset()
    store.openConfirm(action, user)
  }

  // The server refuses to demote or delete the last admin who can sign in,
  // so the menu says so up front.
  const passkeysOn = () => (config.isSuccess ? config.data.passkeys : true)
  const signInAdmins = () => {
    const oidcOn = oidcName() !== null
    return (
      usersData()?.filter(
        (user) =>
          user.role === "admin" &&
          ((passkeysOn() && user.passkeys > 0) || (oidcOn && user.oidcLinked)),
      ) ?? []
    )
  }
  const isLastAdmin = (user: AdminUser) =>
    user.role === "admin" &&
    signInAdmins().every((other) => other.id === user.id)

  // Kept while the dialog closes, so its words stay put as it fades.
  const mutation = () => {
    const confirming = store.confirming()
    if (!confirming) return null
    switch (confirming.action) {
      case "role":
        return setRole
      case "sign-out":
        return signOut
      case "revoke-tokens":
        return revokeTokens
      case "delete":
        return remove
    }
  }
  const copy = () => {
    const confirming = store.confirming()
    return confirming
      ? confirmCopy(
          confirming.action,
          confirming.user,
          confirming.user.id === me()?.id,
        )
      : null
  }

  return (
    <SettingsSections>
      <SettingsSubsection id="users" title={tr("users.title")}>
        <Show
          when={usersData()}
          fallback={
            <Show
              when={users.isError}
              fallback={<Skeleton class="h-32 rounded-xl" />}
            >
              <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
                <p class="text-muted-foreground text-sm">
                  {tr("users.loadFailed", { error: errorMessage(users.error) })}
                </p>
                <Button variant="outline" onClick={() => void users.refetch()}>
                  <Icon icon={RefreshCw} />
                  {tr("users.retry")}
                </Button>
              </div>
            </Show>
          }
        >
          {(list) => (
            <List>
              <For each={list()} keyed={(user) => user.id}>
                {(user) => (
                  <UserItem
                    user={user()}
                    self={user().id === me()?.id}
                    oidcName={oidcName()}
                    passkeysOn={passkeysOn()}
                    lastAdmin={isLastAdmin(user())}
                    may={may}
                    onConfirm={(action) => ask(action, user())}
                    onAccess={() => store.openAccess(user())}
                  />
                )}
              </For>
            </List>
          )}
        </Show>
      </SettingsSubsection>

      <Show when={may("invite.read")}>
        <Invites
          passkeysOn={passkeysOn()}
          mayCreate={may("invite.create")}
          mayRevoke={may("invite.delete")}
        />
      </Show>

      <UserAccessDialog
        userId={store.accessUserId()}
        oidcName={oidcName()}
        open={store.accessOpen()}
        onOpenChange={(open) => {
          if (!open) store.closeAccess()
        }}
      />

      <ConfirmDialog
        open={store.confirmOpen()}
        title={copy()?.title ?? ""}
        description={copy()?.description}
        confirmLabel={copy()?.confirmLabel ?? ""}
        destructive={
          store.confirming()?.action !== "role" ||
          store.confirming()?.user.role === "admin"
        }
        pending={mutation()?.isPending ?? false}
        onConfirm={() => {
          const confirming = store.confirming()
          if (confirming) mutation()?.mutate(confirming.user)
        }}
        onClose={store.closeConfirm}
      />
    </SettingsSections>
  )
}

function UserItem(props: {
  user: AdminUser
  self: boolean
  oidcName: string | null
  passkeysOn: boolean
  lastAdmin: boolean
  may: (permission: Permission) => boolean
  onConfirm: (action: UserAction) => void
  onAccess: () => void
}) {
  const name = () => displayName(props.user)
  const lastAdminNote = tr("users.lastAdmin")
  // The access dialog lists the groups to put the account in.
  const mayAccess = () =>
    props.may("adminUser.update") && props.may("group.read")
  // Making an admin hands over every permission, so it takes them all.
  const mayRole = () => props.may("all")
  const maySignOut = () => props.may("adminSession.delete")
  const mayRevoke = () => props.may("adminApiToken.delete")
  const mayDelete = () => props.may("adminUser.delete")
  // Only an admin changes an admin's account, their own aside.
  const reachable = () => props.user.role !== "admin" || mayRole() || props.self
  const anything = () =>
    reachable() &&
    (mayAccess() || mayRole() || maySignOut() || mayRevoke() || mayDelete())
  const admin = () => props.user.role === "admin"

  return (
    <ListItem class="gap-3 py-2.5 pr-2">
      {/* Centered on the name and details lines (20 + 2 + 20px), not the
          group badges that may wrap below them. */}
      <UserAvatar
        user={props.user}
        class="text-13px mt-1.25 size-8 self-start"
      />
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 text-sm leading-5 font-medium">
          <span class="truncate">{name()}</span>
          <Show when={props.user.displayName}>
            <span class="text-muted-foreground truncate font-normal">
              @{props.user.username}
            </span>
          </Show>
          <Show when={admin()}>
            <Icon
              icon={Shield}
              aria-label={tr("users.admin")}
              class="text-muted-foreground size-3.5 shrink-0"
            />
          </Show>
          <Show when={props.self}>
            <span class="text-muted-foreground font-normal">
              {tr("users.you")}
            </span>
          </Show>
        </p>
        <UserDetails
          user={props.user}
          self={props.self}
          oidcName={props.oidcName}
          passkeysOn={props.passkeysOn}
        />
        <UserGroups user={props.user} oidcName={props.oidcName} />
      </div>
      <Show when={anything()}>
        <DropdownMenu>
          <DropdownMenuTrigger
            class={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "text-muted-foreground hover:text-foreground data-open:text-foreground shrink-0",
            )}
            aria-label={tr("users.actions", { name: name() })}
          >
            <Icon icon={Ellipsis} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} class="min-w-56">
            {/* An admin's access is everything, so there's nothing to set. */}
            <Show when={mayAccess()}>
              <BlockableItem
                blocked={admin() ? tr("users.adminAccess") : null}
                onSelect={() => props.onAccess()}
              >
                <Icon icon={SlidersHorizontal} />
                {tr("users.menu.access")}
              </BlockableItem>
            </Show>
            <Show
              when={mayAccess() && (mayRole() || maySignOut() || mayRevoke())}
            >
              <DropdownMenuSeparator />
            </Show>
            <Show when={mayRole()}>
              <BlockableItem
                blocked={admin() && props.lastAdmin ? lastAdminNote : null}
                onSelect={() => props.onConfirm("role")}
              >
                <Icon icon={admin() ? ShieldOff : Shield} />
                {admin()
                  ? props.self
                    ? tr("users.menu.stepDown")
                    : tr("users.menu.removeAdmin")
                  : tr("users.menu.makeAdmin")}
              </BlockableItem>
            </Show>
            <Show when={maySignOut()}>
              <DropdownMenuItem
                disabled={props.user.sessions <= (props.self ? 1 : 0)}
                onSelect={() => props.onConfirm("sign-out")}
              >
                <Icon icon={LogOut} />
                {props.self
                  ? tr("users.menu.signOutOthers")
                  : tr("users.menu.signOut")}
              </DropdownMenuItem>
            </Show>
            <Show when={mayRevoke()}>
              <DropdownMenuItem
                disabled={props.user.apiTokens === 0}
                onSelect={() => props.onConfirm("revoke-tokens")}
              >
                <Icon icon={KeySquare} />
                {tr("users.menu.revokeTokens")}
              </DropdownMenuItem>
            </Show>
            <Show
              when={
                mayDelete() &&
                (mayAccess() || mayRole() || maySignOut() || mayRevoke())
              }
            >
              <DropdownMenuSeparator />
            </Show>
            <Show when={mayDelete()}>
              <BlockableItem
                variant="destructive"
                blocked={props.lastAdmin ? lastAdminNote : null}
                onSelect={() => props.onConfirm("delete")}
              >
                <Icon icon={Trash2} />
                {props.self
                  ? tr("users.menu.deleteOwn")
                  : tr("users.menu.delete")}
              </BlockableItem>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>
    </ListItem>
  )
}

/**
 * A menu item that may be off for a reason. A disabled item can't be
 * hovered, so a blocked one stays focusable, looks disabled, does nothing,
 * and gives the reason in a tooltip.
 */
function BlockableItem(props: {
  blocked: string | null
  variant?: "default" | "destructive"
  onSelect: () => void
  children: JSX.Element
}) {
  return (
    <Show
      when={props.blocked}
      fallback={
        <DropdownMenuItem
          variant={props.variant}
          onSelect={() => props.onSelect()}
        >
          {props.children}
        </DropdownMenuItem>
      }
    >
      {(blocked) => (
        <Tooltip>
          <TooltipTrigger
            render={(trigger) => (
              <DropdownMenuItem
                // The trigger's button type means nothing on a menu item.
                {...omit(trigger, "type")}
                variant={props.variant}
                aria-disabled="true"
                closeOnSelect={false}
                class="cursor-not-allowed opacity-50"
                onSelect={(event) => event.preventDefault()}
              />
            )}
          >
            {props.children}
          </TooltipTrigger>
          <TooltipContent side="left">{blocked()}</TooltipContent>
        </Tooltip>
      )}
    </Show>
  )
}

/**
 * The line under a user's name: where they stand, then how they sign in.
 * Each fact gets a glyph, so the line reads without separators.
 */
function UserDetails(props: {
  user: AdminUser
  self: boolean
  oidcName: string | null
  passkeysOn: boolean
}) {
  const presence = () => activity(props.user, props.self)
  // A service can still call the API with a token of an account nobody
  // signs in to.
  const tokens = () => (
    <Show when={props.user.apiTokens > 0}>
      <Fact icon={<Icon icon={KeySquare} />}>
        {tr("users.apiTokens", { count: props.user.apiTokens })}
      </Fact>
    </Show>
  )

  return (
    <p
      class="text-muted-foreground text-13px mt-0.5 flex flex-wrap items-center gap-x-3.5 gap-y-0.5 leading-5"
      title={tr("users.joined", { date: formatDate(props.user.createdAt) })}
    >
      <Show
        when={hasSignInMethod(props.user)}
        fallback={
          <>
            <Fact icon={<Icon icon={TriangleAlert} class="text-warning" />}>
              {tr("users.noSignIn")}
            </Fact>
            {tokens()}
          </>
        }
      >
        <Fact icon={<StatusDot tone={presence().tone} />}>
          {presence().label}
        </Fact>
        <Show when={props.user.passkeys > 0}>
          <Fact icon={<Icon icon={KeyRound} />}>
            {props.passkeysOn
              ? tr("users.passkeys", { count: props.user.passkeys })
              : tr("users.passkeysOff", { count: props.user.passkeys })}
          </Fact>
        </Show>
        <Show when={props.user.oidcLinked}>
          <Fact icon={<Icon icon={LogIn} />}>
            {props.oidcName ?? tr("users.oidcOff")}
          </Fact>
        </Show>
        {tokens()}
      </Show>
    </p>
  )
}

/**
 * The groups an account is in besides Everyone, with the ones the provider
 * put it in marked, and whether it has settings of its own.
 */
function UserGroups(props: { user: AdminUser; oidcName: string | null }) {
  const own = () => Object.keys(props.user.access.override).length > 0
  const provider = () => props.oidcName ?? tr("access.user.theProvider")
  const fromProvider = () => props.user.access.overrideSource === "provider"
  return (
    <Show when={props.user.access.groups.length > 0 || own()}>
      <p class="mt-1.5 flex flex-wrap gap-1">
        <For each={props.user.access.groups} keyed={(group) => group.id}>
          {(group) => (
            <Show
              when={group().source === "provider"}
              fallback={<Badge variant="secondary">{group().name}</Badge>}
            >
              <Badge
                variant="secondary"
                title={tr("users.groupFromProvider", { provider: provider() })}
              >
                <Icon icon={LogIn} />
                {group().name}
                <span class="sr-only">
                  {tr("users.groupFromProviderShort", { provider: provider() })}
                </span>
              </Badge>
            </Show>
          )}
        </For>
        <Show when={own()}>
          <Badge
            variant="outline"
            title={
              fromProvider()
                ? tr("users.ownAccessFromProvider", { provider: provider() })
                : tr("users.ownAccessHint")
            }
          >
            <Show when={fromProvider()}>
              <Icon icon={LogIn} />
            </Show>
            {tr("users.ownAccess")}
          </Badge>
        </Show>
      </p>
    </Show>
  )
}

type Tone = "live" | "idle"

const dotClassName = {
  live: "bg-success ring-[3px] ring-success-soft",
  idle: "border-[1.5px] border-muted-foreground/60",
} satisfies Record<Tone, string>

/** A presence dot, sized to sit in an icon's slot. */
function StatusDot(props: { tone: Tone }) {
  return (
    <span aria-hidden="true" class="grid size-3.5 shrink-0 place-items-center">
      <span class={["size-2 rounded-full", dotClassName[props.tone]]} />
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
