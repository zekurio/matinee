import {
  type ApiToken,
  ApiTokenInput,
  ApiTokenName,
  ApiTokenPermissions,
  type CreatedApiToken,
  PERMISSIONS,
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
import { Badge } from "@matinee/ui/components/badge"
import { Button } from "@matinee/ui/components/button"
import { Dialog } from "@matinee/ui/components/dialog"
import { Input } from "@matinee/ui/components/input"
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouteContext } from "@tanstack/react-router"
import {
  CheckIcon,
  CopyIcon,
  KeySquareIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { useStore } from "zustand"

import { tr } from "@/i18n"
import { firstError, useAppForm } from "@/lib/form"
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
  const tokens = useQuery(orpc.account.apiTokens.list.queryOptions())
  const { user } = useRouteContext({ from: "/_authed" })
  // A group's API tokens capability grants making them. The ones an
  // account has stay its own.
  const mayCreate = can(user, "apiToken.create")
  const [store] = useState(createSettingsApiTokensStore)
  const {
    creating,
    created,
    editing,
    editOpen,
    revoking,
    revokeOpen,
    start,
    setCreating,
    setCreated,
    edit,
    closeEdit,
    ask,
    closeRevoke,
  } = useStore(store)
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.account.apiTokens.list.key(),
    })

  const revoke = useMutation({
    mutationFn: (token: ApiToken) =>
      client.account.apiTokens.revoke({ id: token.id }),
    onSuccess: (_, token) =>
      toast.success(tr("account.apiTokens.revoked", { name: token.name })),
    onError: (error) =>
      toast.error(tr("account.apiTokens.revokeFailed"), {
        description: errorMessage(error),
      }),
    onSettled: refresh,
  })

  return (
    <SettingsSubsection
      id="api-tokens"
      title={tr("account.apiTokens.title")}
      action={
        mayCreate && (
          <Button variant="outline" onClick={start}>
            <PlusIcon />
            {tr("account.apiTokens.create")}
          </Button>
        )
      }
    >
      <SettingNote>{tr("account.apiTokens.description")}</SettingNote>
      {/* Says why there is no create button, with tokens or without. */}
      {!mayCreate && (
        <SettingNote>{tr("account.apiTokens.notAllowed")}</SettingNote>
      )}
      {tokens.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : tokens.isError ? (
        <SettingNote>
          {tr("account.apiTokens.loadFailed", {
            reason: errorMessage(tokens.error),
          })}
        </SettingNote>
      ) : tokens.data.length === 0 ? (
        mayCreate && <SettingNote>{tr("account.apiTokens.empty")}</SettingNote>
      ) : (
        <List>
          {tokens.data.map((token) => (
            <ApiTokenRow
              key={token.id}
              token={token}
              revoking={revoke.isPending && revoke.variables.id === token.id}
              onEdit={() => edit(token)}
              onRevoke={() => ask(token)}
            />
          ))}
        </List>
      )}

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        // The secret shows only here, so a stray click mustn't lose it.
        disablePointerDismissal={created !== null}
      >
        <FormDialogContent width={created ? "md" : "lg"}>
          {created ? (
            <CreatedSecret
              created={created}
              onDone={() => setCreating(false)}
            />
          ) : (
            <CreateForm
              onCreated={(token) => {
                setCreated(token)
                void refresh()
              }}
            />
          )}
        </FormDialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(open) => !open && closeEdit()}>
        <FormDialogContent width="lg">
          {editing && (
            <EditForm
              // A form per token, so one opened after another starts from it.
              key={editing.id}
              token={editing}
              onSaved={() => {
                closeEdit()
                void refresh()
              }}
            />
          )}
        </FormDialogContent>
      </Dialog>

      <AlertDialog
        open={revokeOpen}
        onOpenChange={(open) => !open && closeRevoke()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("account.apiTokens.revokeTitle", {
                name: revoking?.name ?? "",
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
                if (revoking) revoke.mutate(revoking)
                closeRevoke()
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

function ApiTokenRow({
  token,
  revoking,
  onEdit,
  onRevoke,
}: {
  token: ApiToken
  revoking: boolean
  onEdit: () => void
  onRevoke: () => void
}) {
  return (
    <ListItem className="pr-2">
      <RowIcon>
        <KeySquareIcon />
      </RowIcon>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm leading-5 font-medium">
            {token.name}
          </span>
          <Badge
            variant={token.permissions.length > 0 ? "secondary" : "outline"}
            // The names themselves, for whoever wants to check.
            title={token.permissions.join(", ") || undefined}
          >
            {token.permissions.includes("all")
              ? tr("account.apiTokens.allPermissions")
              : tr("account.apiTokens.permissionCount", {
                  count: token.permissions.length,
                })}
          </Badge>
        </p>
        <p className="text-muted-foreground text-13px truncate leading-5">
          {[
            lastUsed(token),
            tr("account.apiTokens.created", {
              date: formatDate(token.createdAt),
            }),
          ].join(" · ")}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground shrink-0"
        aria-label={tr("account.apiTokens.editNamed", { name: token.name })}
        onClick={onEdit}
      >
        <PencilIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive shrink-0"
        aria-label={tr("account.apiTokens.revokeNamed", { name: token.name })}
        disabled={revoking}
        onClick={onRevoke}
      >
        <Trash2Icon />
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

function CreateForm({
  onCreated,
}: {
  onCreated: (token: CreatedApiToken) => void
}) {
  const create = useMutation({
    mutationFn: (input: ApiTokenInput) =>
      client.account.apiTokens.create(input),
    onSuccess: onCreated,
    onError: (error) =>
      toast.error(tr("account.apiTokens.createFailed"), {
        description: errorMessage(error),
      }),
  })
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

function EditForm({
  token,
  onSaved,
}: {
  token: ApiToken
  onSaved: () => void
}) {
  const save = useMutation({
    mutationFn: (input: ApiTokenInput) =>
      client.account.apiTokens.update({ id: token.id, ...input }),
    onSuccess: (saved) => {
      toast.success(tr("account.apiTokens.saved", { name: saved.name }))
      onSaved()
    },
    onError: (error) =>
      toast.error(tr("account.apiTokens.saveFailed"), {
        description: errorMessage(error),
      }),
  })
  return (
    <TokenForm
      title={tr("account.apiTokens.editTitle", { name: token.name })}
      description={tr("account.apiTokens.editDescription")}
      submitLabel={tr("account.apiTokens.save")}
      initial={{ name: token.name, permissions: token.permissions }}
      pending={save.isPending}
      onSubmit={(input) => save.mutate(input)}
    />
  )
}

/** A token's name and what it may do, for making one and for changing one. */
function TokenForm({
  title,
  description,
  submitLabel,
  initial,
  pending,
  onSubmit,
}: {
  title: string
  description: string
  submitLabel: string
  initial: ApiTokenInput
  pending: boolean
  onSubmit: (input: ApiTokenInput) => void
}) {
  const { user } = useRouteContext({ from: "/_authed" })
  const form = useAppForm({
    defaultValues: initial,
    onSubmit: ({ value }) => {
      if (!pending) onSubmit(ApiTokenInput.parse(value))
    },
  })
  // A token never does more than its account, so only what the account
  // may do is worth picking. One it already has stays in the list.
  const offered = PERMISSIONS.filter(
    (permission) =>
      can(user, permission) || initial.permissions.includes(permission),
  )

  return (
    <form.AppForm>
      <FormDialogForm onSubmit={() => void form.handleSubmit()}>
        <FormDialogHeader title={title} description={description} />
        <FormDialogBody>
          <div className="md:max-w-md">
            <form.AppField name="name" validators={{ onChange: ApiTokenName }}>
              {(field) => (
                <field.TextField
                  id="api-token-name"
                  label={tr("account.apiTokens.name")}
                  placeholder={tr("account.apiTokens.namePlaceholder")}
                  maxLength={64}
                  autoComplete="off"
                />
              )}
            </form.AppField>
          </div>
          {/* Checked when the form is sent, so the dialog doesn't open on an error. */}
          <form.Field
            name="permissions"
            validators={{ onSubmit: ApiTokenPermissions }}
          >
            {(field) => (
              <PermissionPicker
                legend={tr("account.apiTokens.permissions")}
                offered={offered}
                all={{
                  label: tr("account.apiTokens.allPermissions"),
                  hint: tr("account.apiTokens.allPermissionsHint"),
                }}
                value={field.state.value}
                error={firstError(field.state.meta.errors)}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        </FormDialogBody>
        <FormDialogFooter>
          <form.SubmitButton pending={pending}>{submitLabel}</form.SubmitButton>
        </FormDialogFooter>
      </FormDialogForm>
    </form.AppForm>
  )
}

function CreatedSecret({
  created,
  onDone,
}: {
  created: CreatedApiToken
  onDone: () => void
}) {
  const { feedback, run } = useActionFeedback({ successDuration: 1500 })
  const copied = feedback.state === "success"
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FormDialogHeader
        title={tr("account.apiTokens.secretTitle", {
          name: created.apiToken.name,
        })}
        description={tr("account.apiTokens.secretDescription")}
      />
      <FormDialogBody>
        <div className="flex gap-2">
          <Input
            readOnly
            value={created.token}
            aria-label={tr("account.apiTokens.secretLabel")}
            className="text-13px font-mono"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() =>
              void run(() => navigator.clipboard.writeText(created.token))
            }
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied
              ? tr("account.apiTokens.copied")
              : tr("account.apiTokens.copy")}
          </Button>
        </div>
      </FormDialogBody>
      <FormDialogFooter cancel={false}>
        <Button onClick={onDone}>{tr("account.apiTokens.done")}</Button>
      </FormDialogFooter>
    </div>
  )
}
