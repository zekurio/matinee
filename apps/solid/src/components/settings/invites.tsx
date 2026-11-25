import {
  type AccessGroup,
  type CreatedInvite,
  type Invite,
  InviteInput,
  InviteLabel,
  type InviteOptions,
} from "@matinee/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { Check, Copy, Link as LinkIcon, Trash2, UserPlus } from "lucide"
import { For, Match, onSettled, Show, Switch } from "solid-js"

import { SelectField } from "@/components/select-field"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Dialog } from "@/kit/dialog"
import { FieldGroup } from "@/kit/field"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import { List, ListItem } from "@/kit/list"
import { Skeleton } from "@/kit/skeleton"
import { toast } from "@/kit/toast"
import { createForm } from "@/lib/form"
import { SubmitButton, TextField } from "@/lib/form-fields"
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
export function Invites(props: {
  passkeysOn: boolean
  /** The account holds `invite.create`. */
  mayCreate: boolean
  /** The account holds `invite.delete`. */
  mayRevoke: boolean
}) {
  const queryClient = useQueryClient()
  const invites = useQuery(() => orpc.admin.invites.list.queryOptions())
  const store = createSettingsInvitesStore()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.admin.invites.key() })
  const offering = () => props.passkeysOn && props.mayCreate
  // Everyone holds every account already, so it isn't offered. Without
  // other groups the form is a single column. Loaded with the panel, so the
  // dialog opens at its width.
  const groups = useQuery(() => ({
    ...orpc.admin.groups.list.queryOptions(),
    select: (list: AccessGroup[]) => list.filter((group) => !group.everyone),
    enabled: offering(),
  }))
  const joinable = () => groups.data ?? []
  // How long a link can work, which the form starts from.
  const options = useQuery(() => ({
    ...orpc.admin.invites.options.queryOptions(),
    enabled: offering(),
  }))

  // No question first: a revoked link is quick to make again.
  const revoke = useMutation(() => ({
    mutationFn: (invite: Invite) =>
      client.admin.invites.revoke({ id: invite.id }),
    onSuccess: () => toast.success(tr("users.invites.revoked")),
    onError: (error) =>
      toast.error(tr("users.invites.revokeFailed"), {
        description: errorMessage(error),
      }),
    onSettled: refresh,
  }))

  return (
    <SettingsSubsection
      id="invites"
      title={tr("users.invites.title")}
      action={
        <Show when={offering()}>
          <Button
            variant="outline"
            disabled={!options.data}
            onClick={() => store.start()}
          >
            <Icon icon={UserPlus} />
            {tr("users.invites.create")}
          </Button>
        </Show>
      }
    >
      <Show when={!props.passkeysOn}>
        <SettingNote>{tr("users.invites.passkeysOff")}</SettingNote>
      </Show>
      <Show when={options.isError}>
        <SettingNote>
          {tr("users.invites.loadFailed", {
            error: errorMessage(options.error),
          })}
        </SettingNote>
      </Show>
      <Switch>
        <Match when={invites.isPending}>
          <Skeleton class="h-16 rounded-xl" />
        </Match>
        <Match when={invites.isError}>
          <SettingNote>
            {tr("users.invites.loadFailed", {
              error: errorMessage(invites.error),
            })}
          </SettingNote>
        </Match>
        <Match when={invites.data?.length === 0}>
          <Show when={props.passkeysOn}>
            <SettingNote>{tr("users.invites.empty")}</SettingNote>
          </Show>
        </Match>
        <Match when={invites.data}>
          {(list) => (
            <List>
              <For each={list()} keyed={(invite) => invite.id}>
                {(invite) => (
                  <InviteRow
                    invite={invite()}
                    revoking={
                      revoke.isPending && revoke.variables?.id === invite().id
                    }
                    onRevoke={
                      props.mayRevoke ? () => revoke.mutate(invite()) : null
                    }
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
        disablePointerDismissal={store.created() !== null}
      >
        <FormDialogContent
          width={store.created() || joinable().length > 0 ? "md" : "sm"}
        >
          <Show
            when={store.created()}
            fallback={
              <Show when={options.data}>
                {(loaded) => (
                  <InviteForm
                    options={loaded()}
                    groups={joinable()}
                    onCreated={(invite) => {
                      store.setCreated(invite)
                      void refresh()
                    }}
                  />
                )}
              </Show>
            }
          >
            {(created) => (
              <CreatedLink
                invite={created()}
                onDone={() => store.setCreating(false)}
              />
            )}
          </Show>
        </FormDialogContent>
      </Dialog>
    </SettingsSubsection>
  )
}

function InviteRow(props: {
  invite: Invite
  revoking: boolean
  /** Null for an account that may not revoke links. */
  onRevoke: (() => void) | null
}) {
  const details = () =>
    [
      tr("users.invites.made", { date: formatDate(props.invite.createdAt) }),
      tr("users.invites.expires", {
        when: formatRelative(props.invite.expiresAt),
      }),
      ...(props.invite.groups.length > 0
        ? [
            tr("users.invites.joins", {
              groups: formatList(
                props.invite.groups.map((group) => group.name),
              ),
            }),
          ]
        : []),
    ].join(" · ")
  return (
    <ListItem class="pr-2">
      <RowIcon>
        <Icon icon={LinkIcon} />
      </RowIcon>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm leading-5 font-medium">
          <Show
            when={props.invite.label}
            fallback={
              <span class="text-muted-foreground font-normal">
                {tr("users.invites.noNote")}
              </span>
            }
          >
            {props.invite.label}
          </Show>
        </p>
        <p
          class="text-muted-foreground text-13px truncate leading-5"
          title={tr("users.invites.expiresAt", {
            date: formatDateTime(props.invite.expiresAt),
          })}
        >
          {details()}
        </p>
      </div>
      <Show when={props.onRevoke}>
        {(onRevoke) => (
          <Button
            variant="ghost"
            size="icon"
            class="text-muted-foreground hover:text-destructive shrink-0"
            aria-label={(() => {
              const note = props.invite.label
              return note
                ? tr("users.invites.revokeNamed", { note })
                : tr("users.invites.revoke")
            })()}
            disabled={props.revoking}
            onClick={() => onRevoke()()}
          >
            <Icon icon={Trash2} />
          </Button>
        )}
      </Show>
    </ListItem>
  )
}

type InviteValues = { label: string; expiresInDays: string; groupIds: string[] }

function InviteForm(props: {
  options: InviteOptions
  /** The groups an invite can put the account in. */
  groups: AccessGroup[]
  onCreated: (invite: CreatedInvite) => void
}) {
  const create = useMutation(() => ({
    mutationFn: (input: InviteInput) => client.admin.invites.create(input),
    onSuccess: (invite: CreatedInvite) => props.onCreated(invite),
    onError: (error) => toast.error(errorMessage(error)),
  }))
  const form = createForm<InviteValues>({
    // The select holds strings, so the days are one until the submit.
    defaultValues: { label: "", expiresInDays: "", groupIds: [] },
    checks: { label: InviteLabel },
    onSubmit: (values) => {
      create.mutate(
        InviteInput.parse({
          label: values.label,
          expiresInDays: Number(values.expiresInDays),
          groupIds: [...values.groupIds],
        }),
      )
    },
  })
  // Starts from the server's default length; a form per opening.
  onSettled(() => {
    form.reset({
      label: "",
      expiresInDays: String(props.options.defaultExpiryDays),
      groupIds: [],
    })
  })
  const expiries = () =>
    props.options.expiryDays.map((days) => ({
      value: String(days),
      label: tr("format.daysLong", { count: days }),
    }))

  const fields = () => (
    <FieldGroup>
      <TextField
        form={form}
        name="label"
        label={tr("users.invites.dialog.note")}
        description={tr("users.invites.dialog.noteHint")}
        maxlength={64}
        autocomplete="off"
      />
      <SelectField
        form={form}
        name="expiresInDays"
        id="invite-expiry"
        label={tr("users.invites.dialog.expiry")}
        items={expiries()}
      />
    </FieldGroup>
  )

  return (
    <FormDialogForm onSubmit={() => void form.submit()}>
      <FormDialogHeader
        title={tr("users.invites.create")}
        description={tr("users.invites.dialog.description")}
      />
      <FormDialogBody>
        <Show when={props.groups.length > 0} fallback={fields()}>
          <FormColumns>
            <FormColumn>{fields()}</FormColumn>
            <FormColumn>
              <FormSection
                title={tr("users.invites.dialog.groups")}
                description={tr("users.invites.dialog.groupsHint")}
              >
                <SettingRows>
                  <For each={props.groups} keyed={(group) => group.id}>
                    {(group) => (
                      <SwitchRow
                        title={group().name}
                        checked={form.values().groupIds.includes(group().id)}
                        onChange={(on) => {
                          const ids = form.values().groupIds
                          form.set(
                            "groupIds",
                            on
                              ? [...ids, group().id]
                              : ids.filter((id) => id !== group().id),
                          )
                        }}
                      />
                    )}
                  </For>
                </SettingRows>
              </FormSection>
            </FormColumn>
          </FormColumns>
        </Show>
      </FormDialogBody>
      <FormDialogFooter>
        <SubmitButton form={form} pending={create.isPending}>
          {tr("users.invites.dialog.submit")}
        </SubmitButton>
      </FormDialogFooter>
    </FormDialogForm>
  )
}

function CreatedLink(props: { invite: CreatedInvite; onDone: () => void }) {
  const action = useActionFeedback({ successDuration: 1500 })
  const copied = () => action.feedback().state === "success"
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <FormDialogHeader
        title={tr("users.invites.link.title")}
        description={tr("users.invites.link.description", {
          date: formatDateTime(props.invite.expiresAt),
        })}
      />
      <FormDialogBody>
        <div class="flex gap-2">
          <Input
            readonly
            value={props.invite.url}
            aria-label={tr("users.invites.link.label")}
            class="text-13px font-mono"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            variant="outline"
            class="shrink-0"
            onClick={() =>
              void action.run(() =>
                navigator.clipboard.writeText(props.invite.url),
              )
            }
          >
            <Show when={copied()} fallback={<Icon icon={Copy} />}>
              <Icon icon={Check} />
            </Show>
            {copied()
              ? tr("users.invites.link.copied")
              : tr("users.invites.link.copy")}
          </Button>
        </div>
      </FormDialogBody>
      <FormDialogFooter cancel={false}>
        <Button onClick={() => props.onDone()}>
          {tr("users.invites.link.done")}
        </Button>
      </FormDialogFooter>
    </div>
  )
}
