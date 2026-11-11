import {
  AUTH_ERROR_QUERY_KEY,
  DisplayName,
  oidcStartPath,
  type Passkey,
  PasskeyName,
  type User,
} from "@matinee/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@matinee/ui/components/alert-dialog"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { Input } from "@matinee/ui/components/input"
import { Label } from "@matinee/ui/components/label"
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import {
  ImageUpIcon,
  KeyRoundIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react"
import { useRef, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { prepareAvatar } from "@/lib/avatar"
import { firstError, useAppForm } from "@/lib/form"
import { formatDate, formatRelative } from "@/lib/format"
import { addPasskey } from "@/lib/passkey"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { SharingRows } from "./profile-sharing"
import { Sessions } from "./sessions"
import { RowIcon, SettingsSections, SettingsSubsection } from "./settings-panel"

/** Where an OIDC link round trip lands, success or failure. */
const LINK_RETURN = "/settings/account"

export function AccountPanel() {
  const search = useSearch({ from: "/_authed/_shell" })
  const config = useQuery(orpc.auth.config.queryOptions())
  const session = useQuery(orpc.auth.session.queryOptions())
  const oidc = config.data?.oidc ?? null
  const authError = search[AUTH_ERROR_QUERY_KEY]
  const user = session.data?.user ?? null

  return (
    <SettingsSections>
      {authError ? <FormAlert message={authError} /> : null}
      {user ? (
        <Profile user={user} providerName={oidc?.displayName ?? null} />
      ) : null}
      {config.data?.passkeys ? <Passkeys oidcEnabled={oidc !== null} /> : null}
      {oidc ? <LinkedAccount displayName={oidc.displayName} /> : null}
      <Sessions />
    </SettingsSections>
  )
}

/** Store the user a profile change returned, wherever the app shows it. */
function useProfileSaved() {
  const queryClient = useQueryClient()
  return async (user: User) => {
    queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
    await queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() })
  }
}

function Profile({
  user,
  providerName,
}: {
  user: User
  /** The single sign-on provider while it's on. */
  providerName: string | null
}) {
  return (
    <SettingsSubsection id="profile" title={tr("account.profile.title")}>
      <div className="flex items-center gap-4">
        <AvatarPicker user={user} providerName={providerName} />
        <DisplayNameField user={user} />
      </div>
      <SharingRows sharing={user.sharing} />
    </SettingsSubsection>
  )
}

/**
 * The picture itself is the control. With a picture or a provider one to
 * pick, clicking opens a menu; otherwise it opens the file picker.
 */
function AvatarPicker({
  user,
  providerName,
}: {
  user: User
  providerName: string | null
}) {
  const saved = useProfileSaved()
  const fileInput = useRef<HTMLInputElement>(null)
  const linked = useQuery({
    ...orpc.account.oidc.get.queryOptions(),
    enabled: providerName !== null,
  })
  const followsProvider =
    user.avatarSource === "provider" && user.avatarId !== null
  const canUseProvider =
    providerName !== null &&
    !followsProvider &&
    (linked.data?.hasPicture ?? false)

  const change = useMutation({
    mutationFn: async (
      action: { kind: "upload"; file: File } | { kind: "provider" | "remove" },
    ) => {
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
  })

  const pickFile = () => fileInput.current?.click()
  const surface =
    "group focus-visible:ring-ring focus-visible:ring-offset-background relative size-16 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default"
  const face = (
    <>
      <UserAvatar user={user} className="size-full text-2xl" />
      <span
        className={cn(
          "absolute inset-0 grid place-items-center rounded-full bg-black/50 text-white transition-opacity [&_svg]:size-4",
          change.isPending
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {change.isPending ? <Spinner /> : <PencilIcon />}
      </span>
    </>
  )

  return (
    <>
      {user.avatarId || canUseProvider ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={tr("account.picture.change")}
            disabled={change.isPending}
            className={surface}
          >
            {face}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
            <DropdownMenuItem onClick={pickFile}>
              <ImageUpIcon />
              {tr("account.picture.upload")}
            </DropdownMenuItem>
            {canUseProvider && (
              <DropdownMenuItem
                onClick={() => change.mutate({ kind: "provider" })}
              >
                <UserRoundIcon />
                {tr("account.picture.useProvider", {
                  provider: providerName,
                })}
              </DropdownMenuItem>
            )}
            {user.avatarId && (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => change.mutate({ kind: "remove" })}
              >
                <Trash2Icon />
                {tr("account.picture.remove")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          aria-label={tr("account.picture.upload")}
          disabled={change.isPending}
          onClick={pickFile}
          className={surface}
        >
          {face}
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) change.mutate({ kind: "upload", file })
        }}
      />
    </>
  )
}

/** Saves on Enter or when focus leaves; Escape puts the saved name back. */
function DisplayNameField({ user }: { user: User }) {
  const saved = useProfileSaved()
  const current = user.displayName ?? ""
  const save = useMutation({
    mutationFn: (displayName: string) =>
      client.account.profile.update({ displayName }),
  })
  const form = useAppForm({
    defaultValues: { displayName: current },
    onSubmit: async ({ value, formApi }) => {
      const displayName = DisplayName.parse(value.displayName)
      if (displayName === current) return
      try {
        const updated = await save.mutateAsync(displayName)
        await saved(updated)
        formApi.reset({ displayName: updated.displayName ?? "" })
      } catch {
        // The failure shows under the field, over the saved name.
        formApi.reset()
      }
    },
  })
  const commit = () => {
    if (form.state.isSubmitting) return
    // Still the saved name: nothing to send. A submit would mark the form
    // touched, and a touched form stops following the saved name.
    if (form.state.values.displayName === current) form.reset()
    else void form.handleSubmit()
  }

  return (
    <form.Field name="displayName" validators={{ onChange: DisplayName }}>
      {(field) => {
        const message =
          firstError(field.state.meta.errors) ??
          (save.isError
            ? tr("account.displayName.saveFailed", {
                reason: errorMessage(save.error),
              })
            : undefined)
        return (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="profile-display-name">
              {tr("account.displayName.label")}
            </Label>
            <Input
              id="profile-display-name"
              placeholder={user.username}
              maxLength={64}
              autoComplete="nickname"
              value={field.state.value}
              aria-invalid={message ? true : undefined}
              aria-describedby={
                message ? "profile-display-name-error" : undefined
              }
              onChange={(event) => {
                field.handleChange(event.target.value)
                if (save.isError) save.reset()
              }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit()
                if (event.key === "Escape" && field.state.value !== current) {
                  event.stopPropagation()
                  form.reset()
                }
              }}
            />
            {message && (
              <p
                id="profile-display-name-error"
                role="alert"
                className="text-destructive text-xs"
              >
                {message}
              </p>
            )}
          </div>
        )
      }}
    </form.Field>
  )
}

function Passkeys({ oidcEnabled }: { oidcEnabled: boolean }) {
  const queryClient = useQueryClient()
  const passkeys = useQuery(orpc.account.passkeys.list.queryOptions())
  const linked = useQuery({
    ...orpc.account.oidc.get.queryOptions(),
    enabled: oidcEnabled,
  })
  // The server refuses to remove the last way to sign in, so say so here.
  const methods =
    (passkeys.data?.length ?? 0) + (oidcEnabled && linked.data?.signsIn ? 1 : 0)
  const isLast = passkeys.isSuccess && methods <= 1
  const [removing, setRemoving] = useState<Passkey | null>(null)

  const remove = useMutation({
    mutationFn: (id: string) => client.account.passkeys.remove({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.account.key() })
      toast.success(tr("account.passkeys.removed"))
    },
    onError: (error) =>
      toast.error(tr("account.passkeys.removeFailed"), {
        description: errorMessage(error),
      }),
  })

  return (
    <SettingsSubsection
      id="passkeys"
      title={tr("account.passkeys.title")}
      action={<AddPasskey />}
    >
      {passkeys.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : passkeys.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {tr("account.passkeys.empty")}
        </p>
      ) : (
        <List>
          {passkeys.data?.map((passkey) => (
            <ListItem key={passkey.id} className="pr-2">
              <RowIcon>
                <KeyRoundIcon />
              </RowIcon>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm leading-5 font-medium">
                  {passkey.name ?? tr("account.passkeys.unnamed")}
                </p>
                <p className="text-muted-foreground truncate text-[13px] leading-5">
                  {[
                    passkey.backedUp ? tr("account.passkeys.synced") : null,
                    passkey.lastUsedAt
                      ? tr("account.passkeys.used", {
                          time: formatRelative(passkey.lastUsedAt),
                        })
                      : tr("account.passkeys.added", {
                          date: formatDate(passkey.createdAt),
                        }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {/* The server keeps at least one way to sign in. */}
              {!isLast && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  aria-label={
                    passkey.name
                      ? tr("account.passkeys.removeNamed", {
                          name: passkey.name,
                        })
                      : tr("account.passkeys.remove")
                  }
                  onClick={() => setRemoving(passkey)}
                >
                  <Trash2Icon />
                </Button>
              )}
            </ListItem>
          ))}
        </List>
      )}

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing?.name
                ? tr("account.passkeys.removeTitle", { name: removing.name })
                : tr("account.passkeys.removeTitleUnnamed")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr("account.passkeys.removeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("account.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => removing && remove.mutate(removing.id)}
            >
              {tr("account.passkeys.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSubsection>
  )
}

/** The section's add button and the dialog that names the new passkey. */
function AddPasskey() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const form = useAppForm({
    defaultValues: { passkeyName: "" },
    onSubmit: ({ value }) => {
      if (add.isPending) return
      add.mutate(PasskeyName.parse(value.passkeyName) || null)
    },
  })
  // Lives outside the dialog content, so closing it while the browser prompt
  // is up still records the new passkey.
  const add = useMutation({
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
  })

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon />
        {tr("account.passkeys.add")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-5 p-6 sm:max-w-md">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <DialogHeader>
              <DialogTitle>{tr("account.passkeys.addTitle")}</DialogTitle>
              <DialogDescription>
                {tr("account.passkeys.addDescription")}
              </DialogDescription>
            </DialogHeader>
            <form.AppField
              name="passkeyName"
              validators={{
                // The contract's check, which takes null too: no name.
                onChange: ({ value }) =>
                  PasskeyName.safeParse(value).error?.issues[0],
              }}
            >
              {(field) => (
                <field.TextField
                  id="passkey-name"
                  label={tr("account.passkeys.name")}
                  placeholder={tr("account.passkeys.namePlaceholder")}
                  maxLength={64}
                />
              )}
            </form.AppField>
            <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                {tr("account.cancel")}
              </Button>
              <form.AppForm>
                <form.SubmitButton pending={add.isPending}>
                  {add.isPending
                    ? tr("account.passkeys.waiting")
                    : tr("account.passkeys.add")}
                </form.SubmitButton>
              </form.AppForm>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LinkedAccount({ displayName }: { displayName: string }) {
  const queryClient = useQueryClient()
  const linked = useQuery(orpc.account.oidc.get.queryOptions())
  const unlink = useMutation({
    mutationFn: () => client.account.oidc.unlink(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.account.key() })
      toast.success(tr("account.oidc.unlinked", { provider: displayName }))
    },
    onError: (error) =>
      toast.error(tr("account.oidc.unlinkFailed", { provider: displayName }), {
        description: errorMessage(error),
      }),
  })
  const account = linked.data

  return (
    <SettingsSubsection
      id="single-sign-on"
      title={displayName}
      action={
        // One account per user: linking another means unlinking this one,
        // unless it can't sign in anyway, and then linking replaces it.
        linked.isSuccess && !account?.signsIn ? (
          <a
            href={oidcStartPath("link", LINK_RETURN)}
            className={buttonVariants({ variant: "outline" })}
          >
            <LinkIcon />
            {tr("account.oidc.link", { provider: displayName })}
          </a>
        ) : null
      }
    >
      {linked.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : account ? (
        <List>
          <ListItem className="pr-2">
            <RowIcon>
              <LinkIcon />
            </RowIcon>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {account.label ?? displayName}
              </p>
              <p className="text-muted-foreground text-[13px]">
                {account.signsIn
                  ? tr("account.oidc.linked", {
                      date: formatDate(account.createdAt),
                    })
                  : tr("account.oidc.stale", { provider: displayName })}
              </p>
            </div>
            <Button
              variant="ghost"
              className="shrink-0"
              disabled={unlink.isPending}
              onClick={() => unlink.mutate()}
            >
              {tr("account.oidc.unlink")}
            </Button>
          </ListItem>
        </List>
      ) : (
        <p className="text-muted-foreground text-sm">
          {tr("account.oidc.none", { provider: displayName })}
        </p>
      )}
    </SettingsSubsection>
  )
}
