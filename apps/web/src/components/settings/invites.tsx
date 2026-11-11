import {
  type CreatedInvite,
  DEFAULT_INVITE_EXPIRY_DAYS,
  type Invite,
  INVITE_EXPIRY_DAYS,
  InviteInput,
  InviteLabel,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { FieldGroup, FieldLegend, FieldSet } from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Switch } from "@matinee/ui/components/switch"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckIcon,
  CopyIcon,
  LinkIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react"
import { useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { SelectField } from "@/components/select-field"
import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { formatDate, formatDateTime, formatRelative } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { useActionFeedback } from "@/lib/use-action-feedback"

import { formatList } from "./access-facts"
import { RowIcon, SettingNote, SettingsSubsection } from "./settings-panel"

/**
 * Invite links under the users list: making one for a person to create an
 * account with a passkey while sign-up is closed, and revoking those that
 * still work. Without passkeys nobody could use one, so none can be made.
 */
export function Invites({ passkeysOn }: { passkeysOn: boolean }) {
  const queryClient = useQueryClient()
  const invites = useQuery(orpc.admin.invites.list.queryOptions())
  const [creating, setCreating] = useState(false)
  // The link shows once, so a stray click outside the dialog mustn't close
  // it. The buttons and Escape still do.
  const [linkShown, setLinkShown] = useState(false)
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.admin.invites.key() })

  // No question first: a revoked link is quick to make again.
  const revoke = useMutation({
    mutationFn: (invite: Invite) =>
      client.admin.invites.revoke({ id: invite.id }),
    onSuccess: () => toast.success(tr("users.invites.revoked")),
    onError: (error) =>
      toast.error(tr("users.invites.revokeFailed"), {
        description: errorMessage(error),
      }),
    onSettled: refresh,
  })

  return (
    <SettingsSubsection
      id="invites"
      title={tr("users.invites.title")}
      action={
        passkeysOn ? (
          <Button
            variant="outline"
            onClick={() => {
              setLinkShown(false)
              setCreating(true)
            }}
          >
            <UserPlusIcon />
            {tr("users.invites.create")}
          </Button>
        ) : null
      }
    >
      {!passkeysOn && (
        <SettingNote>{tr("users.invites.passkeysOff")}</SettingNote>
      )}
      {invites.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : invites.isError ? (
        <SettingNote>
          {tr("users.invites.loadFailed", {
            error: errorMessage(invites.error),
          })}
        </SettingNote>
      ) : invites.data.length === 0 ? (
        passkeysOn && <SettingNote>{tr("users.invites.empty")}</SettingNote>
      ) : (
        <List>
          {invites.data.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              revoking={revoke.isPending && revoke.variables.id === invite.id}
              onRevoke={() => revoke.mutate(invite)}
            />
          ))}
        </List>
      )}

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        disablePointerDismissal={linkShown}
      >
        <DialogContent className="gap-5 p-6 sm:max-w-md">
          {creating && (
            <CreateInvite
              onCreated={() => {
                setLinkShown(true)
                void refresh()
              }}
              onDone={() => setCreating(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </SettingsSubsection>
  )
}

function InviteRow({
  invite,
  revoking,
  onRevoke,
}: {
  invite: Invite
  revoking: boolean
  onRevoke: () => void
}) {
  const details = [
    tr("users.invites.made", { date: formatDate(invite.createdAt) }),
    tr("users.invites.expires", { when: formatRelative(invite.expiresAt) }),
    ...(invite.groups.length > 0
      ? [
          tr("users.invites.joins", {
            groups: formatList(invite.groups.map((group) => group.name)),
          }),
        ]
      : []),
  ]
  return (
    <ListItem className="pr-2">
      <RowIcon>
        <LinkIcon />
      </RowIcon>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 font-medium">
          {invite.label ?? (
            <span className="text-muted-foreground font-normal">
              {tr("users.invites.noNote")}
            </span>
          )}
        </p>
        <p
          className="text-muted-foreground truncate text-[13px] leading-5"
          title={tr("users.invites.expiresAt", {
            date: formatDateTime(invite.expiresAt),
          })}
        >
          {details.join(" · ")}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive shrink-0"
        aria-label={
          invite.label
            ? tr("users.invites.revokeNamed", { note: invite.label })
            : tr("users.invites.revoke")
        }
        disabled={revoking}
        onClick={onRevoke}
      >
        <Trash2Icon />
      </Button>
    </ListItem>
  )
}

/** The dialog's two steps: the note and expiry, then the link, once. */
function CreateInvite({
  onCreated,
  onDone,
}: {
  onCreated: () => void
  onDone: () => void
}) {
  const [created, setCreated] = useState<CreatedInvite | null>(null)
  if (created) return <CreatedLink invite={created} onDone={onDone} />
  return (
    <InviteForm
      onCreated={(invite) => {
        setCreated(invite)
        onCreated()
      }}
      onCancel={onDone}
    />
  )
}

function InviteForm({
  onCreated,
  onCancel,
}: {
  onCreated: (invite: CreatedInvite) => void
  onCancel: () => void
}) {
  const create = useMutation({
    mutationFn: (input: InviteInput) => client.admin.invites.create(input),
    onSuccess: onCreated,
  })
  // Everyone holds every account already, so it isn't offered.
  const groups = useQuery({
    ...orpc.admin.groups.list.queryOptions(),
    select: (list) => list.filter((group) => !group.everyone),
  })
  const noGroups: string[] = []
  const form = useAppForm({
    // The select holds strings, so the days are one until the submit.
    defaultValues: {
      label: "",
      expiresInDays: String(DEFAULT_INVITE_EXPIRY_DAYS),
      groupIds: noGroups,
    },
    onSubmit: ({ value }) =>
      create.mutate(
        InviteInput.parse({
          label: value.label,
          expiresInDays: Number(value.expiresInDays),
          groupIds: value.groupIds,
        }),
      ),
  })
  const expiries = INVITE_EXPIRY_DAYS.map((days) => ({
    value: String(days),
    label: tr("format.daysLong", { count: days }),
  }))

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
          <DialogTitle>{tr("users.invites.create")}</DialogTitle>
          <DialogDescription>
            {tr("users.invites.dialog.description")}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <form.AppField name="label" validators={{ onChange: InviteLabel }}>
            {(field) => (
              <field.TextField
                label={tr("users.invites.dialog.note")}
                description={tr("users.invites.dialog.noteHint")}
                maxLength={64}
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppField name="expiresInDays">
            {() => (
              <SelectField
                id="invite-expiry"
                label={tr("users.invites.dialog.expiry")}
                items={expiries}
              />
            )}
          </form.AppField>
          {groups.data && groups.data.length > 0 && (
            <form.Field name="groupIds">
              {(field) => (
                <FieldSet>
                  <FieldLegend variant="label">
                    {tr("users.invites.dialog.groups")}
                  </FieldLegend>
                  <ul className="-mt-1 flex flex-col gap-2.5">
                    {groups.data.map((group) => (
                      <li key={group.id}>
                        <label className="flex min-w-0 items-center gap-3 text-sm">
                          <Switch
                            checked={field.state.value.includes(group.id)}
                            onCheckedChange={(on) =>
                              field.handleChange(
                                on
                                  ? [...field.state.value, group.id]
                                  : field.state.value.filter(
                                      (id) => id !== group.id,
                                    ),
                              )
                            }
                          />
                          <span className="truncate">{group.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground -mt-1 text-sm">
                    {tr("users.invites.dialog.groupsHint")}
                  </p>
                </FieldSet>
              )}
            </form.Field>
          )}
        </FieldGroup>
        {create.error && <FormAlert message={errorMessage(create.error)} />}
        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {tr("users.dialog.cancel")}
          </Button>
          <form.SubmitButton pending={create.isPending}>
            {tr("users.invites.dialog.submit")}
          </form.SubmitButton>
        </DialogFooter>
      </form>
    </form.AppForm>
  )
}

function CreatedLink({
  invite,
  onDone,
}: {
  invite: CreatedInvite
  onDone: () => void
}) {
  const { feedback, run } = useActionFeedback(1500)
  const copied = feedback.state === "success"
  return (
    <div className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>{tr("users.invites.link.title")}</DialogTitle>
        <DialogDescription>
          {tr("users.invites.link.description", {
            date: formatDateTime(invite.expiresAt),
          })}
        </DialogDescription>
      </DialogHeader>
      <div className="flex gap-2">
        <Input
          readOnly
          value={invite.url}
          aria-label={tr("users.invites.link.label")}
          className="font-mono text-[13px]"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          variant="outline"
          className="shrink-0"
          onClick={() =>
            void run(() => navigator.clipboard.writeText(invite.url))
          }
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied
            ? tr("users.invites.link.copied")
            : tr("users.invites.link.copy")}
        </Button>
      </div>
      {feedback.state === "error" && <FormAlert message={feedback.message} />}
      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button onClick={onDone}>{tr("users.invites.link.done")}</Button>
      </DialogFooter>
    </div>
  )
}
