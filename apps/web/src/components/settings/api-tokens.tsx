import {
  type ApiToken,
  ApiTokenInput,
  ApiTokenName,
  type CreatedApiToken,
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
import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { Input } from "@matinee/ui/components/input"
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckIcon,
  CopyIcon,
  KeySquareIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { useStore } from "zustand"

import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { formatDate, formatRelative } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { useActionFeedback } from "@/lib/use-action-feedback"
import { createSettingsApiTokensStore } from "@/stores/settings-api-tokens"

import { RowIcon, SettingNote, SettingsSubsection } from "./settings-panel"

// The server moves a token's last use at most once a minute.
const LAST_USED_STEP_MS = 60 * 1000

/**
 * Tokens a service calls the API with as this account: making one, whose
 * secret shows once, and revoking those it has.
 */
export function ApiTokens() {
  const queryClient = useQueryClient()
  const tokens = useQuery(orpc.account.apiTokens.list.queryOptions())
  const [store] = useState(createSettingsApiTokensStore)
  const {
    creating,
    created,
    revoking,
    revokeOpen,
    start,
    setCreating,
    setCreated,
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
        <Button variant="outline" onClick={start}>
          <PlusIcon />
          {tr("account.apiTokens.create")}
        </Button>
      }
    >
      <SettingNote>{tr("account.apiTokens.description")}</SettingNote>
      {tokens.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : tokens.isError ? (
        <SettingNote>
          {tr("account.apiTokens.loadFailed", {
            reason: errorMessage(tokens.error),
          })}
        </SettingNote>
      ) : tokens.data.length === 0 ? (
        <SettingNote>{tr("account.apiTokens.empty")}</SettingNote>
      ) : (
        <List>
          {tokens.data.map((token) => (
            <ApiTokenRow
              key={token.id}
              token={token}
              revoking={revoke.isPending && revoke.variables.id === token.id}
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
        <DialogContent
          showCloseButton={false}
          className="gap-5 p-6 sm:max-w-md"
        >
          {created ? (
            <CreatedSecret
              created={created}
              onDone={() => setCreating(false)}
            />
          ) : (
            <ApiTokenForm
              onCreated={(token) => {
                setCreated(token)
                void refresh()
              }}
            />
          )}
        </DialogContent>
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
  onRevoke,
}: {
  token: ApiToken
  revoking: boolean
  onRevoke: () => void
}) {
  return (
    <ListItem className="pr-2">
      <RowIcon>
        <KeySquareIcon />
      </RowIcon>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 font-medium">{token.name}</p>
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

function ApiTokenForm({
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
  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: ({ value }) => {
      if (create.isPending) return
      create.mutate(ApiTokenInput.parse(value))
    },
  })

  return (
    <form.AppForm>
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogHeader>
          <DialogTitle>{tr("account.apiTokens.createTitle")}</DialogTitle>
          <DialogDescription>
            {tr("account.apiTokens.createDescription")}
          </DialogDescription>
        </DialogHeader>
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
        <DialogFooter showCancelButton className="-mx-6 -mb-6 px-6 py-4">
          <form.SubmitButton pending={create.isPending}>
            {tr("account.apiTokens.create")}
          </form.SubmitButton>
        </DialogFooter>
      </form>
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
    <div className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>
          {tr("account.apiTokens.secretTitle", {
            name: created.apiToken.name,
          })}
        </DialogTitle>
        <DialogDescription>
          {tr("account.apiTokens.secretDescription")}
        </DialogDescription>
      </DialogHeader>
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
      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button onClick={onDone}>{tr("account.apiTokens.done")}</Button>
      </DialogFooter>
    </div>
  )
}
