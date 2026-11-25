import {
  AUTH_ERROR_QUERY_KEY,
  DisplayName,
  oidcStartPath,
  type Passkey,
  PasskeyName,
  type User,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { useNavigate, useSearch } from "@tanstack/solid-router"
import {
  ImageUp,
  KeyRound,
  Link as LinkIcon,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide"
import {
  createEffect,
  createSignal,
  For,
  Match,
  onSettled,
  Show,
  Switch,
} from "solid-js"

import { UserAvatar } from "@/components/user-avatar"
import { knownMessage, tr } from "@/i18n"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/kit/alert-dialog"
import { Button, buttonVariants } from "@/kit/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import { Label } from "@/kit/label"
import { List, ListItem } from "@/kit/list"
import { Skeleton } from "@/kit/skeleton"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { prepareAvatar } from "@/lib/avatar"
import { createForm } from "@/lib/form"
import { SubmitButton, TextField } from "@/lib/form-fields"
import { formatDate, formatRelative } from "@/lib/format"
import { addPasskey } from "@/lib/passkey"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { createSettingsPasskeysStore } from "@/stores/settings-passkeys"

import { SharingRows } from "./profile-sharing"
import { Sessions } from "./sessions"
import { RowIcon, SettingsSections, SettingsSubsection } from "./settings-panel"

/** Where an OIDC link round trip lands, success or failure. */
const LINK_RETURN = "/settings/account"

export function AccountPanel() {
  const search = useSearch({ from: "/_authed/_shell" })
  const config = useQuery(() => orpc.auth.config.queryOptions())
  const session = useQuery(() => orpc.auth.session.queryOptions())
  const oidc = () => config.data?.oidc ?? null
  useLinkErrorToast(() => search()[AUTH_ERROR_QUERY_KEY])

  return (
    <SettingsSections>
      <Show when={session.data?.user}>
        {(user) => (
          <Profile user={user()} providerName={oidc()?.displayName ?? null} />
        )}
      </Show>
      <Show when={config.data?.passkeys}>
        <Passkeys oidcEnabled={oidc() !== null} />
      </Show>
      <Show when={oidc()}>
        {(provider) => <LinkedAccount displayName={provider().displayName} />}
      </Show>
      <Sessions />
    </SettingsSections>
  )
}

/**
 * Toasts the error an OIDC link round trip brought back in the URL, then
 * drops it from the URL so a reload or a back step doesn't show it again.
 */
function useLinkErrorToast(error: () => string | undefined) {
  const navigate = useNavigate()
  createEffect(error, (message) => {
    if (message === undefined) return
    // The URL can carry any text, so only a message the catalog knows is
    // shown as it is.
    toast.error(knownMessage(message) ?? tr("auth.signIn.failed"), {
      id: "auth-error",
    })
    // The router reads its match store when building the next location.
    queueMicrotask(() => {
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, [AUTH_ERROR_QUERY_KEY]: undefined }),
        replace: true,
      })
    })
  })
}

/** Store the user a profile change returned, wherever the app shows it. */
function useProfileSaved() {
  const queryClient = useQueryClient()
  return async (user: User) => {
    queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
    await queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() })
  }
}

function Profile(props: {
  user: User
  /** The single sign-on provider while it's on. */
  providerName: string | null
}) {
  return (
    <SettingsSubsection id="profile" title={tr("account.profile.title")}>
      <div class="flex items-center gap-4">
        <AvatarPicker user={props.user} providerName={props.providerName} />
        <DisplayNameField user={props.user} />
      </div>
      <SharingRows sharing={props.user.sharing} />
    </SettingsSubsection>
  )
}

type AvatarChange =
  | { kind: "upload"; file: File }
  | { kind: "provider" | "remove" }

/**
 * The picture itself is the control. With a picture or a provider one to
 * pick, clicking opens a menu; otherwise it opens the file picker.
 */
function AvatarPicker(props: { user: User; providerName: string | null }) {
  const saved = useProfileSaved()
  let fileInput: HTMLInputElement | undefined
  const linked = useQuery(() => ({
    ...orpc.account.oidc.get.queryOptions(),
    enabled: props.providerName !== null,
  }))
  const followsProvider = () =>
    props.user.avatarSource === "provider" && props.user.avatarUrl !== null
  const canUseProvider = () =>
    props.providerName !== null &&
    !followsProvider() &&
    (linked.data?.hasPicture ?? false)

  const change = useMutation(() => ({
    mutationFn: async (action: AvatarChange) => {
      if (action.kind === "upload") {
        const file = await prepareAvatar(action.file)
        return client.account.avatar.upload({ file })
      }
      return action.kind === "provider"
        ? client.account.avatar.useProvider()
        : client.account.avatar.remove()
    },
    onSuccess: (updated) => saved(updated),
    onError: (error) =>
      toast.error(tr("account.picture.changeFailed"), {
        description: errorMessage(error),
      }),
  }))

  const pickFile = () => fileInput?.click()
  const surface =
    "group focus-visible:ring-ring focus-visible:ring-offset-background relative size-16 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default"
  const face = () => (
    <>
      <UserAvatar user={props.user} class="size-full text-2xl" />
      <span
        class={cn(
          "absolute inset-0 grid place-items-center rounded-full bg-black/50 text-white transition-opacity [&_svg]:size-4",
          change.isPending
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        <Show when={change.isPending} fallback={<Icon icon={Pencil} />}>
          <Spinner />
        </Show>
      </span>
    </>
  )

  return (
    <>
      <Show
        when={props.user.avatarUrl || canUseProvider()}
        fallback={
          <button
            type="button"
            aria-label={tr("account.picture.upload")}
            disabled={change.isPending}
            onClick={pickFile}
            class={surface}
          >
            {face()}
          </button>
        }
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={tr("account.picture.change")}
            disabled={change.isPending}
            class={surface}
          >
            {face()}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="min-w-48">
            <DropdownMenuItem onSelect={pickFile}>
              <Icon icon={ImageUp} />
              {tr("account.picture.upload")}
            </DropdownMenuItem>
            <Show when={canUseProvider()}>
              <DropdownMenuItem
                onSelect={() => change.mutate({ kind: "provider" })}
              >
                <Icon icon={UserRound} />
                {tr("account.picture.useProvider", {
                  provider: props.providerName ?? "",
                })}
              </DropdownMenuItem>
            </Show>
            <Show when={props.user.avatarUrl}>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => change.mutate({ kind: "remove" })}
              >
                <Icon icon={Trash2} />
                {tr("account.picture.remove")}
              </DropdownMenuItem>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>
      <input
        ref={(el) => (fileInput = el)}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (file) change.mutate({ kind: "upload", file })
        }}
      />
    </>
  )
}

/** Saves on Enter or when focus leaves; Escape puts the saved name back. */
function DisplayNameField(props: { user: User }) {
  const saved = useProfileSaved()
  const current = () => props.user.displayName ?? ""
  const form = createForm({
    defaultValues: { displayName: "" },
    checks: { displayName: DisplayName },
    onSubmit: async (values) => {
      const displayName = DisplayName.parse(values.displayName)
      if (displayName === current()) return
      try {
        const updated = await client.account.profile.update({ displayName })
        await saved(updated)
        form.reset({ displayName: updated.displayName ?? "" })
      } catch (cause) {
        // The failure gets a toast, and the field goes back to the saved name.
        toast.error(
          tr("account.displayName.saveFailed", { reason: errorMessage(cause) }),
        )
        form.reset()
      }
    },
  })
  // Starts from the saved name; a save resets the form to the new one.
  onSettled(() => {
    form.reset({ displayName: current() })
  })
  const commit = () => {
    if (form.submitting()) return
    // Still the saved name: nothing to send.
    if (form.values().displayName === current()) form.reset()
    else void form.submit()
  }
  const message = () => form.message("displayName")

  return (
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label for="profile-display-name">
        {tr("account.displayName.label")}
      </Label>
      <Input
        id="profile-display-name"
        placeholder={props.user.username}
        maxlength={64}
        autocomplete="nickname"
        value={form.values().displayName}
        aria-invalid={message() ? "true" : undefined}
        aria-describedby={message() ? "profile-display-name-error" : undefined}
        onValueChange={(value) => {
          form.set("displayName", value)
          form.blur("displayName")
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit()
          if (
            event.key === "Escape" &&
            form.values().displayName !== current()
          ) {
            event.stopPropagation()
            form.reset()
          }
        }}
      />
      <Show when={message()}>
        <p
          id="profile-display-name-error"
          role="alert"
          class="text-destructive text-xs"
        >
          {message()}
        </p>
      </Show>
    </div>
  )
}

function Passkeys(props: { oidcEnabled: boolean }) {
  const queryClient = useQueryClient()
  const passkeys = useQuery(() => orpc.account.passkeys.list.queryOptions())
  const linked = useQuery(() => ({
    ...orpc.account.oidc.get.queryOptions(),
    enabled: props.oidcEnabled,
  }))
  // The server refuses to remove the last way to sign in, so say so here.
  const isLast = () => {
    const methods =
      (passkeys.data?.length ?? 0) +
      (props.oidcEnabled && linked.data?.signsIn ? 1 : 0)
    return passkeys.isSuccess && methods <= 1
  }
  const store = createSettingsPasskeysStore()

  const remove = useMutation(() => ({
    mutationFn: (id: string) => client.account.passkeys.remove({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.account.key() })
      toast.success(tr("account.passkeys.removed"))
    },
    onError: (error) =>
      toast.error(tr("account.passkeys.removeFailed"), {
        description: errorMessage(error),
      }),
  }))

  return (
    <SettingsSubsection
      id="passkeys"
      title={tr("account.passkeys.title")}
      action={<AddPasskey />}
    >
      <Switch>
        <Match when={passkeys.isPending}>
          <Skeleton class="h-16 rounded-xl" />
        </Match>
        <Match when={passkeys.data?.length === 0}>
          <p class="text-muted-foreground text-sm">
            {tr("account.passkeys.empty")}
          </p>
        </Match>
        <Match when={passkeys.data}>
          {(list) => (
            <List>
              <For each={list()} keyed={(passkey) => passkey.id}>
                {(passkey) => (
                  <ListItem class="pr-2">
                    <RowIcon>
                      <Icon icon={KeyRound} />
                    </RowIcon>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm leading-5 font-medium">
                        {passkey().name ?? tr("account.passkeys.unnamed")}
                      </p>
                      <p class="text-muted-foreground text-13px truncate leading-5">
                        {passkeyDetails(passkey())}
                      </p>
                    </div>
                    {/* The server keeps at least one way to sign in. */}
                    <Show when={!isLast()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="text-muted-foreground hover:text-destructive shrink-0"
                        aria-label={(() => {
                          const name = passkey().name
                          return name
                            ? tr("account.passkeys.removeNamed", { name })
                            : tr("account.passkeys.remove")
                        })()}
                        onClick={() => store.ask(passkey())}
                      >
                        <Icon icon={Trash2} />
                      </Button>
                    </Show>
                  </ListItem>
                )}
              </For>
            </List>
          )}
        </Match>
      </Switch>

      <AlertDialog
        open={store.open()}
        onOpenChange={(open) => {
          if (!open) store.close()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(() => {
                const name = store.removing()?.name
                return name
                  ? tr("account.passkeys.removeTitle", { name })
                  : tr("account.passkeys.removeTitleUnnamed")
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr("account.passkeys.removeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("account.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const removing = store.removing()
                if (removing) remove.mutate(removing.id)
              }}
            >
              {tr("account.passkeys.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSubsection>
  )
}

function passkeyDetails(passkey: Passkey): string {
  return [
    passkey.backedUp ? tr("account.passkeys.synced") : null,
    passkey.lastUsedAt
      ? tr("account.passkeys.used", {
          time: formatRelative(passkey.lastUsedAt),
        })
      : tr("account.passkeys.added", { date: formatDate(passkey.createdAt) }),
  ]
    .filter(Boolean)
    .join(" · ")
}

/** The section's add button and the dialog that names the new passkey. */
function AddPasskey() {
  const queryClient = useQueryClient()
  const [open, setOpen] = createSignal(false)
  const form = createForm({
    defaultValues: { passkeyName: "" },
    // The contract's check, which takes null too: no name.
    checks: {
      passkeyName: (value) =>
        PasskeyName.safeParse(value).error?.issues[0]?.message,
    },
    onSubmit: (values) => {
      if (add.isPending) return
      add.mutate(PasskeyName.parse(values.passkeyName) || null)
    },
  })
  // Lives outside the dialog content, so closing it while the browser prompt
  // is up still records the new passkey.
  const add = useMutation(() => ({
    mutationFn: (name: string | null) => addPasskey(name),
    onSuccess: async () => {
      setOpen(false)
      form.reset()
      await queryClient.invalidateQueries({ queryKey: orpc.account.key() })
      toast.success(tr("account.passkeys.addSucceeded"))
    },
    onError: (error) =>
      toast.error(tr("account.passkeys.addFailed"), {
        description: errorMessage(error),
      }),
  }))

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Icon icon={Plus} />
        {tr("account.passkeys.add")}
      </Button>
      <Dialog open={open()} onOpenChange={(next) => setOpen(next)}>
        <DialogContent showCloseButton={false} class="gap-5 p-6 sm:max-w-md">
          <form
            class="contents"
            onSubmit={(event) => {
              event.preventDefault()
              void form.submit()
            }}
          >
            <DialogHeader>
              <DialogTitle>{tr("account.passkeys.addTitle")}</DialogTitle>
              <DialogDescription>
                {tr("account.passkeys.addDescription")}
              </DialogDescription>
            </DialogHeader>
            <TextField
              form={form}
              name="passkeyName"
              id="passkey-name"
              label={tr("account.passkeys.name")}
              placeholder={tr("account.passkeys.namePlaceholder")}
              maxlength={64}
            />
            <DialogFooter showCancelButton class="-mx-6 -mb-6 px-6 py-4">
              <SubmitButton form={form} pending={add.isPending}>
                {add.isPending
                  ? tr("account.passkeys.waiting")
                  : tr("account.passkeys.add")}
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LinkedAccount(props: { displayName: string }) {
  const queryClient = useQueryClient()
  const linked = useQuery(() => orpc.account.oidc.get.queryOptions())
  const unlink = useMutation(() => ({
    mutationFn: () => client.account.oidc.unlink(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.account.key() })
      toast.success(
        tr("account.oidc.unlinked", { provider: props.displayName }),
      )
    },
    onError: (error) =>
      toast.error(
        tr("account.oidc.unlinkFailed", { provider: props.displayName }),
        { description: errorMessage(error) },
      ),
  }))

  return (
    <SettingsSubsection
      id="single-sign-on"
      title={props.displayName}
      action={
        // One account per user: linking another means unlinking this one,
        // unless it can't sign in anyway, and then linking replaces it.
        <Show when={linked.isSuccess && !linked.data?.signsIn}>
          <a
            href={oidcStartPath("link", LINK_RETURN)}
            class={buttonVariants({ variant: "outline" })}
          >
            <Icon icon={LinkIcon} />
            {tr("account.oidc.link", { provider: props.displayName })}
          </a>
        </Show>
      }
    >
      <Switch
        fallback={
          <p class="text-muted-foreground text-sm">
            {tr("account.oidc.none", { provider: props.displayName })}
          </p>
        }
      >
        <Match when={linked.isPending}>
          <Skeleton class="h-16 rounded-xl" />
        </Match>
        <Match when={linked.data}>
          {(account) => (
            <List>
              <ListItem class="pr-2">
                <RowIcon>
                  <Icon icon={LinkIcon} />
                </RowIcon>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">
                    {account().label ?? props.displayName}
                  </p>
                  <p class="text-muted-foreground text-13px">
                    {account().signsIn
                      ? tr("account.oidc.linked", {
                          date: formatDate(account().createdAt),
                        })
                      : tr("account.oidc.stale", {
                          provider: props.displayName,
                        })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  class="shrink-0"
                  disabled={unlink.isPending}
                  onClick={() => unlink.mutate()}
                >
                  {tr("account.oidc.unlink")}
                </Button>
              </ListItem>
            </List>
          )}
        </Match>
      </Switch>
    </SettingsSubsection>
  )
}
