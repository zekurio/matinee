import {
  type ApiToken,
  ApiTokenInput,
  ApiTokenName,
  ApiTokenPermissions,
  type CreatedApiToken,
  PERMISSIONS,
} from "@matinee/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { useRouteContext } from "@tanstack/solid-router"
import { Check, Copy, KeySquare, Pencil, Plus, Trash2 } from "lucide"
import { For, Match, onSettled, Show, Switch } from "solid-js"

import { tr } from "@/i18n"
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
import { Badge } from "@/kit/badge"
import { Button } from "@/kit/button"
import { Dialog } from "@/kit/dialog"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import { List, ListItem } from "@/kit/list"
import { Skeleton } from "@/kit/skeleton"
import { toast } from "@/kit/toast"
import { createForm } from "@/lib/form"
import { SubmitButton, TextField } from "@/lib/form-fields"
import { formatDate, formatRelative } from "@/lib/format"
import { can } from "@/lib/permissions"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { useActionFeedback } from "@/lib/use-action-feedback"
import { createSettingsApiTokensStore } from "@/stores/settings-api-tokens"

import {
  FormDialogBody,
  FormDialogContent,
  FormDialogFooter,
  FormDialogForm,
  FormDialogHeader,
} from "./form-dialog"
import { PermissionPicker } from "./permission-picker"
import {
  RowIcon,
  SettingNote,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"

// The server moves a token's last use at most once a minute.
const LAST_USED_STEP_MS = 60 * 1000

/** Settings → API tokens. */
export function ApiTokensPanel() {
  return (
    <SettingsSections>
      <ApiTokens />
    </SettingsSections>
  )
}

/**
 * Tokens a service or an app calls the API with as this account: making
 * one, whose secret shows once, changing what it may do, and revoking it.
 */
function ApiTokens() {
  const queryClient = useQueryClient()
  const tokens = useQuery(() => orpc.account.apiTokens.list.queryOptions())
  const context = useRouteContext({ from: "/_authed" })
  // A group's API tokens capability grants making them. The ones an
  // account has stay its own.
  const mayCreate = () => can(context().user, "apiToken.create")
  const store = createSettingsApiTokensStore()
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.account.apiTokens.list.key(),
    })

  const revoke = useMutation(() => ({
    mutationFn: (token: ApiToken) =>
      client.account.apiTokens.revoke({ id: token.id }),
    onSuccess: (_, token) =>
      toast.success(tr("account.apiTokens.revoked", { name: token.name })),
    onError: (error) =>
      toast.error(tr("account.apiTokens.revokeFailed"), {
        description: errorMessage(error),
      }),
    onSettled: refresh,
  }))

  return (
    <SettingsSubsection
      id="api-tokens"
      title={tr("account.apiTokens.title")}
      action={
        <Show when={mayCreate()}>
          <Button variant="outline" onClick={() => store.start()}>
            <Icon icon={Plus} />
            {tr("account.apiTokens.create")}
          </Button>
        </Show>
      }
    >
      {/* Says why there is no create button, with tokens or without. */}
      <Show when={!mayCreate()}>
        <SettingNote>{tr("account.apiTokens.notAllowed")}</SettingNote>
      </Show>
      <Switch>
        <Match when={tokens.isPending}>
          <Skeleton class="h-16 rounded-xl" />
        </Match>
        <Match when={tokens.isError}>
          <SettingNote>
            {tr("account.apiTokens.loadFailed", {
              reason: errorMessage(tokens.error),
            })}
          </SettingNote>
        </Match>
        <Match when={tokens.data?.length === 0}>
          <Show when={mayCreate()}>
            <SettingNote>{tr("account.apiTokens.empty")}</SettingNote>
          </Show>
        </Match>
        <Match when={tokens.data}>
          {(list) => (
            <List>
              <For each={list()} keyed={(token) => token.id}>
                {(token) => (
                  <ApiTokenRow
                    token={token()}
                    revoking={
                      revoke.isPending && revoke.variables?.id === token().id
                    }
                    onEdit={() => store.edit(token())}
                    onRevoke={() => store.ask(token())}
                  />
                )}
              </For>
            </List>
          )}
        </Match>
      </Switch>

      <Dialog
        open={store.creating()}
        onOpenChange={(open) => store.setCreating(open)}
        // The secret shows only here, so a stray click mustn't lose it.
        disablePointerDismissal={store.created() !== null}
      >
        <FormDialogContent width={store.created() ? "md" : "xl"}>
          <Show
            when={store.created()}
            fallback={
              <CreateForm
                onCreated={(token) => {
                  store.setCreated(token)
                  void refresh()
                }}
              />
            }
          >
            {(created) => (
              <CreatedSecret
                created={created()}
                onDone={() => store.setCreating(false)}
              />
            )}
          </Show>
        </FormDialogContent>
      </Dialog>

      <Dialog
        open={store.editOpen()}
        onOpenChange={(open) => {
          if (!open) store.closeEdit()
        }}
      >
        <FormDialogContent width="xl">
          {/* A form per token, so one opened after another starts from it. */}
          <Show when={store.editing()} keyed>
            {(editing) => (
              <EditForm
                token={editing}
                onSaved={() => {
                  store.closeEdit()
                  void refresh()
                }}
              />
            )}
          </Show>
        </FormDialogContent>
      </Dialog>

      <AlertDialog
        open={store.revokeOpen()}
        onOpenChange={(open) => {
          if (!open) store.closeRevoke()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("account.apiTokens.revokeTitle", {
                name: store.revoking()?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr("account.apiTokens.revokeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("account.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const revoking = store.revoking()
                if (revoking) revoke.mutate(revoking)
                store.closeRevoke()
              }}
            >
              {tr("account.apiTokens.revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSubsection>
  )
}

function ApiTokenRow(props: {
  token: ApiToken
  revoking: boolean
  onEdit: () => void
  onRevoke: () => void
}) {
  return (
    <ListItem class="pr-2">
      <RowIcon>
        <Icon icon={KeySquare} />
      </RowIcon>
      <div class="min-w-0 flex-1">
        <p class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm leading-5 font-medium">
            {props.token.name}
          </span>
          <Badge
            variant={
              props.token.permissions.length > 0 ? "secondary" : "outline"
            }
            // The names themselves, for whoever wants to check.
            title={props.token.permissions.join(", ") || undefined}
          >
            {props.token.permissions.includes("all")
              ? tr("account.apiTokens.allPermissions")
              : tr("account.apiTokens.permissionCount", {
                  count: props.token.permissions.length,
                })}
          </Badge>
        </p>
        <p class="text-muted-foreground text-13px truncate leading-5">
          {[
            lastUsed(props.token),
            tr("account.apiTokens.created", {
              date: formatDate(props.token.createdAt),
            }),
          ].join(" · ")}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-foreground shrink-0"
        aria-label={tr("account.apiTokens.editNamed", {
          name: props.token.name,
        })}
        onClick={() => props.onEdit()}
      >
        <Icon icon={Pencil} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-destructive shrink-0"
        aria-label={tr("account.apiTokens.revokeNamed", {
          name: props.token.name,
        })}
        disabled={props.revoking}
        onClick={() => props.onRevoke()}
      >
        <Icon icon={Trash2} />
      </Button>
    </ListItem>
  )
}

function lastUsed(token: ApiToken): string {
  if (!token.lastUsedAt) return tr("account.apiTokens.neverUsed")
  if (Date.now() - token.lastUsedAt.getTime() < LAST_USED_STEP_MS) {
    return tr("account.apiTokens.usedNow")
  }
  return tr("account.apiTokens.used", {
    time: formatRelative(token.lastUsedAt),
  })
}

function CreateForm(props: { onCreated: (token: CreatedApiToken) => void }) {
  const create = useMutation(() => ({
    mutationFn: (input: ApiTokenInput) =>
      client.account.apiTokens.create(input),
    onSuccess: (token: CreatedApiToken) => props.onCreated(token),
    onError: (error) =>
      toast.error(tr("account.apiTokens.createFailed"), {
        description: errorMessage(error),
      }),
  }))
  return (
    <TokenForm
      title={tr("account.apiTokens.createTitle")}
      description={tr("account.apiTokens.createDescription")}
      submitLabel={tr("account.apiTokens.create")}
      initial={{ name: "", permissions: [] }}
      pending={create.isPending}
      onSubmit={(input) => create.mutate(input)}
    />
  )
}

function EditForm(props: { token: ApiToken; onSaved: () => void }) {
  const save = useMutation(() => ({
    mutationFn: (input: ApiTokenInput) =>
      client.account.apiTokens.update({ id: props.token.id, ...input }),
    onSuccess: (saved: ApiToken) => {
      toast.success(tr("account.apiTokens.saved", { name: saved.name }))
      props.onSaved()
    },
    onError: (error) =>
      toast.error(tr("account.apiTokens.saveFailed"), {
        description: errorMessage(error),
      }),
  }))
  return (
    <TokenForm
      title={tr("account.apiTokens.editTitle", { name: props.token.name })}
      description={tr("account.apiTokens.editDescription")}
      submitLabel={tr("account.apiTokens.save")}
      initial={{ name: props.token.name, permissions: props.token.permissions }}
      pending={save.isPending}
      onSubmit={(input) => save.mutate(input)}
    />
  )
}

/** A token's name and what it may do, for making one and for changing one. */
function TokenForm(props: {
  title: string
  description: string
  submitLabel: string
  initial: ApiTokenInput
  pending: boolean
  onSubmit: (input: ApiTokenInput) => void
}) {
  const context = useRouteContext({ from: "/_authed" })
  const form = createForm<ApiTokenInput>({
    defaultValues: { name: "", permissions: [] },
    // Shown once the form is sent, so the dialog doesn't open on an error.
    checks: { name: ApiTokenName, permissions: ApiTokenPermissions },
    onSubmit: (values) => {
      if (!props.pending) props.onSubmit(ApiTokenInput.parse(values))
    },
  })
  // Starts from the token it edits. A form per token, so this runs once.
  onSettled(() => {
    // Plain copies, as the token's list is the query's store.
    form.reset({
      name: props.initial.name,
      permissions: [...props.initial.permissions],
    })
  })
  // A token never does more than its account, so only what the account
  // may do is worth picking. One it already has stays in the list.
  const offered = () =>
    PERMISSIONS.filter(
      (permission) =>
        can(context().user, permission) ||
        props.initial.permissions.includes(permission),
    )

  return (
    <FormDialogForm onSubmit={() => void form.submit()}>
      <FormDialogHeader title={props.title} description={props.description} />
      <FormDialogBody>
        <div class="md:max-w-md">
          <TextField
            form={form}
            name="name"
            id="api-token-name"
            label={tr("account.apiTokens.name")}
            placeholder={tr("account.apiTokens.namePlaceholder")}
            maxlength={64}
            autocomplete="off"
          />
        </div>
        <PermissionPicker
          legend={tr("account.apiTokens.permissions")}
          offered={offered()}
          all={{
            label: tr("account.apiTokens.allPermissions"),
            hint: tr("account.apiTokens.allPermissionsHint"),
          }}
          value={form.values().permissions}
          error={form.message("permissions")}
          onChange={(permissions) => form.set("permissions", permissions)}
        />
      </FormDialogBody>
      <FormDialogFooter>
        <SubmitButton form={form} pending={props.pending}>
          {props.submitLabel}
        </SubmitButton>
      </FormDialogFooter>
    </FormDialogForm>
  )
}

function CreatedSecret(props: {
  created: CreatedApiToken
  onDone: () => void
}) {
  const action = useActionFeedback({ successDuration: 1500 })
  const copied = () => action.feedback().state === "success"
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <FormDialogHeader
        title={tr("account.apiTokens.secretTitle", {
          name: props.created.apiToken.name,
        })}
        description={tr("account.apiTokens.secretDescription")}
      />
      <FormDialogBody>
        <div class="flex gap-2">
          <Input
            readonly
            value={props.created.token}
            aria-label={tr("account.apiTokens.secretLabel")}
            class="text-13px font-mono"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            variant="outline"
            class="shrink-0"
            onClick={() =>
              void action.run(() =>
                navigator.clipboard.writeText(props.created.token),
              )
            }
          >
            <Show when={copied()} fallback={<Icon icon={Copy} />}>
              <Icon icon={Check} />
            </Show>
            {copied()
              ? tr("account.apiTokens.copied")
              : tr("account.apiTokens.copy")}
          </Button>
        </div>
      </FormDialogBody>
      <FormDialogFooter cancel={false}>
        <Button onClick={() => props.onDone()}>
          {tr("account.apiTokens.done")}
        </Button>
      </FormDialogFooter>
    </div>
  )
}
