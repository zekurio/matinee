import {
  type AccessGroup,
  type AccessOverride,
  type AdminUser,
  type UserAccess,
  UserAccessInput,
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
import { FeedbackButton } from "@matinee/ui/components/feedback-button"
import { Spinner } from "@matinee/ui/components/spinner"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LogInIcon } from "lucide-react"
import type { ReactNode } from "react"

import { FormAlert } from "@/components/form-alert"
import { tr } from "@/i18n"
import { firstError, useAppForm } from "@/lib/form"
import { formatDateTime, formatRelative } from "@/lib/format"
import { client, orpc } from "@/lib/rpc"
import { useActionFeedback } from "@/lib/use-action-feedback"

import {
  bitrateLabel,
  bitrateOptions,
  LibraryPicker,
  limitOf,
  limitValue,
  NO_LIMIT,
  streamLabel,
  streamOptions,
} from "./access-controls"
import { Fact, PolicyFacts } from "./access-facts"
import { SelectField, SettingWarning, SwitchRow } from "./setting-controls"
import { SettingNote, SettingRows } from "./settings-panel"

/** A field of the override left out, so the groups decide it. */
const FROM_GROUPS = "groups"

type LibraryChoice = typeof FROM_GROUPS | "all" | "some"
const LIBRARY_CHOICES: readonly LibraryChoice[] = [FROM_GROUPS, "all", "some"]

type SwitchChoice = typeof FROM_GROUPS | "on" | "off"
const SWITCH_CHOICES: readonly SwitchChoice[] = [FROM_GROUPS, "on", "off"]

/** The dialog's form. Limits are text, as the selects hold them. */
type AccessValues = {
  /** The groups an admin or an invite put the account in. */
  groupIds: string[]
  libraries: LibraryChoice
  libraryIds: string[]
  maxBitrate: string
  transcode: SwitchChoice
  downloads: SwitchChoice
  maxStreams: string
}

function switchChoice(value: boolean | undefined): SwitchChoice {
  if (value === undefined) return FROM_GROUPS
  return value ? "on" : "off"
}

function valuesOf(access: UserAccess): AccessValues {
  const { override } = access
  return {
    groupIds: access.groups
      .filter((group) => group.source === "manual")
      .map((group) => group.id),
    libraries: !override.libraries
      ? FROM_GROUPS
      : override.libraries.all
        ? "all"
        : "some",
    libraryIds: override.libraries?.ids ?? [],
    maxBitrate:
      override.maxBitrate === undefined
        ? FROM_GROUPS
        : limitValue(override.maxBitrate),
    transcode: switchChoice(override.transcode),
    downloads: switchChoice(override.downloads),
    maxStreams:
      override.maxStreams === undefined
        ? FROM_GROUPS
        : limitValue(override.maxStreams),
  }
}

function overrideOf(value: AccessValues): AccessOverride {
  const all = value.libraries === "all"
  return {
    ...(value.libraries !== FROM_GROUPS && {
      libraries: { all, ids: all ? [] : value.libraryIds },
    }),
    ...(value.maxBitrate !== FROM_GROUPS && {
      maxBitrate: limitOf(value.maxBitrate),
    }),
    ...(value.transcode !== FROM_GROUPS && {
      transcode: value.transcode === "on",
    }),
    ...(value.downloads !== FROM_GROUPS && {
      downloads: value.downloads === "on",
    }),
    ...(value.maxStreams !== FROM_GROUPS && {
      maxStreams: limitOf(value.maxStreams),
    }),
  }
}

/** The same choices, whatever order the switches were flipped in. */
const sameValues = (a: AccessValues, b: AccessValues) => {
  const key = (value: AccessValues) =>
    JSON.stringify({
      ...value,
      groupIds: value.groupIds.toSorted(),
      libraryIds: value.libraries === "some" ? value.libraryIds.toSorted() : [],
    })
  return key(a) === key(b)
}

/** A limit's options with "From groups" first. */
function withGroups(options: (current: string) => string[], current: string) {
  return [FROM_GROUPS, ...options(current === FROM_GROUPS ? NO_LIMIT : current)]
}

/**
 * One account's access: the groups an admin puts it in, and what's set on
 * the account over them. A save keeps the dialog open, so the admin sees
 * what the account gets with it.
 */
export function UserAccessDialog({
  userId,
  oidcName,
  open,
  onOpenChange,
}: {
  /** Kept while the dialog closes. */
  userId: string | null
  oidcName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-lg">
        {open && userId && (
          <AccessForm
            userId={userId}
            oidcName={oidcName}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function AccessForm({
  userId,
  oidcName,
  onDone,
}: {
  userId: string
  oidcName: string | null
  onDone: () => void
}) {
  // From the list, so the dialog shows the account as each save leaves it.
  const users = useQuery(orpc.admin.users.list.queryOptions())
  const user = users.data?.find((entry) => entry.id === userId)
  if (!user) {
    return users.isPending ? (
      <Spinner className="mx-auto my-16 size-6 opacity-60" />
    ) : (
      <>
        <DialogHeader>
          <DialogTitle>{tr("access.user.goneTitle")}</DialogTitle>
          <DialogDescription>{tr("access.user.gone")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <Button onClick={onDone}>{tr("access.done")}</Button>
        </DialogFooter>
      </>
    )
  }
  return <AccessEditor user={user} oidcName={oidcName} onDone={onDone} />
}

function AccessEditor({
  user,
  oidcName,
  onDone,
}: {
  user: AdminUser
  oidcName: string | null
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const groups = useQuery(orpc.admin.groups.list.queryOptions())
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const name = user.displayName ?? user.username
  const provider = oidcName ?? tr("access.user.theProvider")
  const initial = valuesOf(user.access)
  const save = useMutation({
    mutationFn: (input: UserAccessInput) => client.admin.users.setAccess(input),
  })
  const { feedback, run } = useActionFeedback()

  const form = useAppForm({
    defaultValues: initial,
    onSubmit: async ({ value, formApi }) => {
      const parsed = UserAccessInput.safeParse({
        id: user.id,
        groupIds: value.groupIds,
        override: overrideOf(value),
      })
      if (!parsed.success) {
        throw new Error(
          firstError(parsed.error.issues) ?? tr("access.user.checkFields"),
        )
      }
      const updated = await save.mutateAsync(parsed.data)
      queryClient.setQueryData(
        orpc.admin.users.list.queryKey(),
        (list: AdminUser[] | undefined) =>
          list?.map((entry) => (entry.id === updated.id ? updated : entry)),
      )
      formApi.reset(valuesOf(updated.access))
      // Groups count their members.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.admin.groups.key() }),
      ])
    },
  })
  const dirty = useSelector(
    form.store,
    (state) => !sameValues(state.values, initial),
  )
  const values = useSelector(form.store, (state) => state.values)
  const submit = () => {
    if (feedback.state !== "pending") void run(() => form.handleSubmit())
  }

  const fromProvider = new Set(
    user.access.groups
      .filter((group) => group.source === "provider")
      .map((group) => group.id),
  )
  const switchLabel = (choice: SwitchChoice) =>
    choice === FROM_GROUPS
      ? tr("access.user.fromGroups")
      : choice === "on"
        ? tr("access.user.allowed")
        : tr("access.user.notAllowed")
  const limitLabel = (format: (value: string) => string) => (value: string) =>
    value === FROM_GROUPS ? tr("access.user.fromGroups") : format(value)

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          {tr("access.user.title", { name })}
        </DialogTitle>
        <DialogDescription>{tr("access.user.description")}</DialogDescription>
      </DialogHeader>

      <Block title={tr("access.user.gets", { name })}>
        <div className="bg-foreground/[0.02] rounded-xl border px-4 py-3">
          <PolicyFacts
            policy={user.access.effective}
            libraries={libraries.data}
            className="text-foreground text-sm"
          />
        </div>
        {dirty && <SettingNote>{tr("access.user.getsAfterSave")}</SettingNote>}
        {user.oidcLinked && (
          <SettingNote>
            <span
              className="inline-flex"
              title={
                user.claimsSyncedAt
                  ? formatDateTime(user.claimsSyncedAt)
                  : undefined
              }
            >
              <Fact icon={<LogInIcon />}>
                {user.claimsSyncedAt
                  ? tr("access.user.claimsSynced", {
                      provider,
                      when: formatRelative(user.claimsSyncedAt),
                    })
                  : tr("access.user.claimsNever", { provider })}
              </Fact>
            </span>
          </SettingNote>
        )}
      </Block>

      <Block title={tr("access.user.groups")}>
        <SettingRows>
          {(groups.data ?? []).map((group) => (
            <GroupSwitch
              key={group.id}
              group={group}
              provider={provider}
              fromProvider={fromProvider.has(group.id)}
              checked={values.groupIds.includes(group.id)}
              onChange={(on) =>
                form.setFieldValue("groupIds", (ids) =>
                  on ? [...ids, group.id] : ids.filter((id) => id !== group.id),
                )
              }
            />
          ))}
        </SettingRows>
        {groups.data?.length === 1 && (
          <SettingNote>{tr("access.user.noGroups")}</SettingNote>
        )}
      </Block>

      <Block title={tr("access.user.override")}>
        {user.access.overrideSource === "provider" ? (
          <SettingWarning>
            {tr("access.user.overrideFromProvider", { provider, name })}
          </SettingWarning>
        ) : (
          <SettingNote>{tr("access.user.overrideHint")}</SettingNote>
        )}
        <SettingRows>
          <form.AppField name="libraries">
            {() => (
              <SelectField
                title={tr("access.libraries")}
                options={LIBRARY_CHOICES}
                labelOf={(choice) =>
                  choice === FROM_GROUPS
                    ? tr("access.user.fromGroups")
                    : choice === "all"
                      ? tr("access.libraries.all")
                      : tr("access.libraries.picked")
                }
                footer={
                  values.libraries === "all" ? (
                    <SettingNote>{tr("access.libraries.allHint")}</SettingNote>
                  ) : values.libraries === "some" ? (
                    <form.Field name="libraryIds">
                      {(field) => (
                        <LibraryPicker
                          libraries={libraries.data}
                          value={field.state.value}
                          onChange={field.handleChange}
                        />
                      )}
                    </form.Field>
                  ) : null
                }
              />
            )}
          </form.AppField>
          <form.AppField name="maxBitrate">
            {() => (
              <SelectField
                title={tr("access.bitrate")}
                options={withGroups(bitrateOptions, values.maxBitrate)}
                labelOf={limitLabel(bitrateLabel)}
                footer={<SettingNote>{tr("access.bitrate.hint")}</SettingNote>}
              />
            )}
          </form.AppField>
          <form.AppField name="transcode">
            {() => (
              <SelectField
                title={tr("access.transcode")}
                options={SWITCH_CHOICES}
                labelOf={switchLabel}
              />
            )}
          </form.AppField>
          <form.AppField name="downloads">
            {() => (
              <SelectField
                title={tr("access.downloads")}
                options={SWITCH_CHOICES}
                labelOf={switchLabel}
              />
            )}
          </form.AppField>
          <form.AppField name="maxStreams">
            {() => (
              <SelectField
                title={tr("access.streams")}
                options={withGroups(streamOptions, values.maxStreams)}
                labelOf={limitLabel(streamLabel)}
              />
            )}
          </form.AppField>
        </SettingRows>
      </Block>

      {feedback.state === "error" && <FormAlert message={feedback.message} />}

      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          {dirty ? tr("access.cancel") : tr("access.done")}
        </Button>
        <FeedbackButton
          type="submit"
          state={feedback.state}
          pendingLabel={tr("access.user.saving")}
          successLabel={tr("access.user.saved")}
          errorLabel={tr("access.user.retry")}
          disabled={!dirty && feedback.state !== "success"}
        >
          {tr("access.user.save")}
        </FeedbackButton>
      </DialogFooter>
    </form>
  )
}

/** A titled part of the dialog. */
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

/**
 * A group the account can be put in. Everyone holds every account, and a
 * group the provider put it in stays until the provider takes it out.
 */
function GroupSwitch({
  group,
  provider,
  fromProvider,
  checked,
  onChange,
}: {
  group: AccessGroup
  provider: string
  fromProvider: boolean
  checked: boolean
  onChange: (on: boolean) => void
}) {
  if (group.everyone) {
    return (
      <SwitchRow
        title={tr("access.everyone")}
        checked
        disabled
        footer={<SettingNote>{tr("access.user.everyoneHint")}</SettingNote>}
        onChange={() => {}}
      />
    )
  }
  if (fromProvider) {
    return (
      <SwitchRow
        title={group.name}
        checked
        disabled
        footer={
          <SettingNote>
            {tr("access.user.groupFromProvider", { provider })}
          </SettingNote>
        }
        onChange={() => {}}
      />
    )
  }
  return (
    <SwitchRow
      title={group.name}
      checked={checked}
      footer={
        group.providerGroup ? (
          <SettingNote>
            {tr("access.user.groupFollows", {
              provider,
              group: group.providerGroup,
            })}
          </SettingNote>
        ) : undefined
      }
      onChange={onChange}
    />
  )
}
