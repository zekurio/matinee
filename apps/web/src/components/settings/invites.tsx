import {
  type AccessGroup,
  type CreatedInvite,
  DEFAULT_INVITE_EXPIRY_DAYS,
  type Invite,
  INVITE_EXPIRY_DAYS,
  InviteInput,
  InviteLabel,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { Dialog } from "@matinee/ui/components/dialog"
import { FieldGroup } from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckIcon,
  CopyIcon,
  LinkIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react"
import { useState } from "react"
import { useStore } from "zustand"

import { SelectField } from "@/components/select-field"
import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { formatDate, formatDateTime, formatRelative } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { useActionFeedback } from "@/lib/use-action-feedback"
import { createSettingsInvitesStore } from "@/stores/settings-invites"

import { formatList } from "./access-facts"
import {
  FormColumn,
  FormColumns,
  FormDialogBody,
  FormDialogContent,
  FormDialogFooter,
  FormDialogForm,
  FormDialogHeader,
  FormSection,
} from "./form-dialog"
import { SwitchRow } from "./setting-controls"
import {
  RowIcon,
  SettingNote,
  SettingRows,
  SettingsSubsection,
} from "./settings-panel"

/**
 * Invite links under the users list: making one for a person to create an
 * account with a passkey while sign-up is closed, and revoking those that
 * still work. Without passkeys nobody could use one, so none can be made.
 */
export function Invites({
  passkeysOn,
  mayCreate,
  mayRevoke,
}: {
  passkeysOn: boolean
  /** The account holds `invite.create`. */
  mayCreate: boolean
  /** The account holds `invite.delete`. */
  mayRevoke: boolean
}) {
  const queryClient = useQueryClient()
  const invites = useQuery(orpc.admin.invites.list.queryOptions())
  const [store] = useState(createSettingsInvitesStore)
  const { creating, created, start, setCreating, setCreated } = useStore(store)
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.admin.invites.key() })
  // Everyone holds every account already, so it isn't offered. Without
  // other groups the form is a single column. Loaded with the panel, so the
  // dialog opens at its width.
  const groups = useQuery({
    ...orpc.admin.groups.list.queryOptions(),
    select: (list) => list.filter((group) => !group.everyone),
    enabled: passkeysOn && mayCreate,
  })
  const joinable = groups.data ?? []

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
        passkeysOn && mayCreate ? (
          <Button variant="outline" onClick={start}>
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
              onRevoke={mayRevoke ? () => revoke.mutate(invite) : null}
            />
          ))}
        </List>
      )}

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        disablePointerDismissal={created !== null}
      >
        <FormDialogContent width={created || joinable.length > 0 ? "md" : "sm"}>
          {created ? (
            <CreatedLink invite={created} onDone={() => setCreating(false)} />
          ) : (
            <InviteForm
              groups={joinable}
              onCreated={(invite) => {
                setCreated(invite)
                void refresh()
              }}
            />
          )}
        </FormDialogContent>
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
  /** Null for an account that may not revoke links. */
  onRevoke: (() => void) | null
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
          className="text-muted-foreground text-13px truncate leading-5"
          title={tr("users.invites.expiresAt", {
            date: formatDateTime(invite.expiresAt),
          })}
        >
          {details.join(" · ")}
        </p>
      </div>
      {onRevoke && (
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
      )}
    </ListItem>
  )
}

function InviteForm({
  groups,
  onCreated,
}: {
  /** The groups an invite can put the account in. */
  groups: AccessGroup[]
  onCreated: (invite: CreatedInvite) => void
}) {
  const create = useMutation({
    mutationFn: (input: InviteInput) => client.admin.invites.create(input),
    onSuccess: onCreated,
    onError: (error) => toast.error(errorMessage(error)),
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

  const fields = (
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
    </FieldGroup>
  )

  return (
    <form.AppForm>
      <FormDialogForm onSubmit={() => void form.handleSubmit()}>
        <FormDialogHeader
          title={tr("users.invites.create")}
          description={tr("users.invites.dialog.description")}
        />
        <FormDialogBody>
          {groups.length === 0 ? (
            fields
          ) : (
            <FormColumns>
              <FormColumn>{fields}</FormColumn>
              <FormColumn>
                <FormSection
                  title={tr("users.invites.dialog.groups")}
                  description={tr("users.invites.dialog.groupsHint")}
                >
                  <form.Field name="groupIds">
                    {(field) => (
                      <SettingRows>
                        {groups.map((group) => (
                          <SwitchRow
                            key={group.id}
                            title={group.name}
                            checked={field.state.value.includes(group.id)}
                            onChange={(on) =>
                              field.handleChange(
                                on
                                  ? [...field.state.value, group.id]
                                  : field.state.value.filter(
                                      (id) => id !== group.id,
                                    ),
                              )
                            }
                          />
                        ))}
                      </SettingRows>
                    )}
                  </form.Field>
                </FormSection>
              </FormColumn>
            </FormColumns>
          )}
        </FormDialogBody>
        <FormDialogFooter>
          <form.SubmitButton pending={create.isPending}>
            {tr("users.invites.dialog.submit")}
          </form.SubmitButton>
        </FormDialogFooter>
      </FormDialogForm>
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
  const { feedback, run } = useActionFeedback({ successDuration: 1500 })
  const copied = feedback.state === "success"
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FormDialogHeader
        title={tr("users.invites.link.title")}
        description={tr("users.invites.link.description", {
          date: formatDateTime(invite.expiresAt),
        })}
      />
      <FormDialogBody>
        <div className="flex gap-2">
          <Input
            readOnly
            value={invite.url}
            aria-label={tr("users.invites.link.label")}
            className="text-13px font-mono"
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
      </FormDialogBody>
      <FormDialogFooter cancel={false}>
        <Button onClick={onDone}>{tr("users.invites.link.done")}</Button>
      </FormDialogFooter>
    </div>
  )
}
