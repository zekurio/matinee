import {
  type AccessGroup,
  type AccessOverride,
  type AdminUser,
  areaLevels,
  MANAGED_AREAS,
  type ManagedAccess,
  type ManagedArea,
  REQUEST_MODES,
  type RequestMode,
  type UserAccess,
  UserAccessInput,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
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

import { tr } from "@/i18n"
import { firstError, useAppForm } from "@/lib/form"
import { formatDateTime, formatRelative } from "@/lib/format"
import { client, orpc } from "@/lib/rpc"
import { ShownError } from "@/lib/shown-error"
import { useActionFeedback } from "@/lib/use-action-feedback"

import {
  bitrateLabel,
  bitrateOptions,
  DEFAULT_QUOTA,
  LibraryPicker,
  limitChoiceLabel,
  limitOf,
  limitValue,
  NO_LIMIT,
  QuotaInputs,
  requestsLabel,
  streamLabel,
  streamOptions,
} from "./access-controls"
import {
  areaHint,
  areaLabel,
  bitrateLimitLabel,
  Fact,
  levelLabel,
  librariesLabel,
  PolicyFacts,
  requestLimitLabel,
  streamLimitLabel,
} from "./access-facts"
import {
  FormColumn,
  FormColumns,
  FormDialogBody,
  FormDialogContent,
  FormDialogForm,
  FormDialogHeader,
  FormSection,
} from "./form-dialog"
import {
  SelectField,
  SelectRow,
  SettingWarning,
  SwitchRow,
} from "./setting-controls"
import { SettingNote, SettingRows } from "./settings-panel"

/** A field of the override left out, so the groups decide it. */
const FROM_GROUPS = "groups"
type FromGroups = typeof FROM_GROUPS

type LibraryChoice = FromGroups | "all" | "some"
const LIBRARY_CHOICES: readonly LibraryChoice[] = [FROM_GROUPS, "all", "some"]

type SwitchChoice = FromGroups | "on" | "off"
const SWITCH_CHOICES: readonly SwitchChoice[] = [FROM_GROUPS, "on", "off"]

const REQUEST_CHOICES: readonly (FromGroups | RequestMode)[] = [
  FROM_GROUPS,
  ...REQUEST_MODES,
]

type QuotaChoice = FromGroups | typeof NO_LIMIT | "some"
const QUOTA_CHOICES: readonly QuotaChoice[] = [FROM_GROUPS, NO_LIMIT, "some"]

function quotaChoice(limit: AccessOverride["requestLimit"]): QuotaChoice {
  if (limit === undefined) return FROM_GROUPS
  return limit === null ? NO_LIMIT : "some"
}

/** Each area's level set on the account, or left to the groups. */
type ManagedChoices = {
  [Area in ManagedArea]: FromGroups | ManagedAccess[Area]
}

/** The dialog's form. Limits are text, as the selects hold them. */
type AccessValues = {
  /** The groups an admin or an invite put the account in. */
  groupIds: string[]
  libraries: LibraryChoice
  libraryIds: string[]
  maxBitrate: string
  transcode: SwitchChoice
  maxStreams: string
  downloads: SwitchChoice
  requests: FromGroups | RequestMode
  requestLimit: AccessOverride["requestLimit"]
  apiTokens: SwitchChoice
  manages: ManagedChoices
}

function switchChoice(value: boolean | undefined): SwitchChoice {
  if (value === undefined) return FROM_GROUPS
  return value ? "on" : "off"
}

function switchValue(choice: SwitchChoice): boolean | undefined {
  return choice === FROM_GROUPS ? undefined : choice === "on"
}

function valuesOf(access: UserAccess): AccessValues {
  const { override } = access
  const area = <Area extends ManagedArea>(name: Area) =>
    override.manages?.[name] ?? FROM_GROUPS
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
    maxStreams:
      override.maxStreams === undefined
        ? FROM_GROUPS
        : limitValue(override.maxStreams),
    downloads: switchChoice(override.downloads),
    requests: override.requests ?? FROM_GROUPS,
    requestLimit: override.requestLimit,
    apiTokens: switchChoice(override.apiTokens),
    manages: {
      requests: area("requests"),
      connections: area("connections"),
      libraries: area("libraries"),
      metadata: area("metadata"),
      users: area("users"),
      server: area("server"),
    },
  }
}

/** The override to save: each field the form doesn't leave to the groups. */
function overrideOf(value: AccessValues): AccessOverride {
  const all = value.libraries === "all"
  const manages = Object.fromEntries(
    MANAGED_AREAS.flatMap((area) => {
      const level = value.manages[area]
      return level === FROM_GROUPS ? [] : [[area, level]]
    }),
  )
  const downloads = switchValue(value.downloads)
  const transcode = switchValue(value.transcode)
  const apiTokens = switchValue(value.apiTokens)
  return {
    ...(value.libraries !== FROM_GROUPS && {
      libraries: { all, ids: all ? [] : value.libraryIds },
    }),
    ...(value.maxBitrate !== FROM_GROUPS && {
      maxBitrate: limitOf(value.maxBitrate),
    }),
    ...(transcode !== undefined && { transcode }),
    ...(value.maxStreams !== FROM_GROUPS && {
      maxStreams: limitOf(value.maxStreams),
    }),
    ...(downloads !== undefined && { downloads }),
    ...(value.requests !== FROM_GROUPS && { requests: value.requests }),
    ...(value.requestLimit !== undefined && {
      requestLimit: value.requestLimit,
    }),
    ...(apiTokens !== undefined && { apiTokens }),
    ...(Object.keys(manages).length > 0 && { manages }),
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
      <FormDialogContent width="2xl">
        {userId && (
          <AccessForm
            userId={userId}
            oidcName={oidcName}
            onDone={() => onOpenChange(false)}
          />
        )}
      </FormDialogContent>
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
      <div className="flex flex-col gap-5 p-6">
        <DialogHeader>
          <DialogTitle>{tr("access.user.goneTitle")}</DialogTitle>
          <DialogDescription>{tr("access.user.gone")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <Button onClick={onDone}>{tr("access.done")}</Button>
        </DialogFooter>
      </div>
    )
  }
  return <AccessEditor user={user} oidcName={oidcName} />
}

function AccessEditor({
  user,
  oidcName,
}: {
  user: AdminUser
  oidcName: string | null
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
        throw new ShownError(
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
  // What "From groups" gives, as of the last save. A change to the groups
  // that isn't saved yet could give something else, so then it's left
  // unsaid.
  const { fromGroups } = user.access
  const groupsSaved =
    values.groupIds.toSorted().join() === initial.groupIds.toSorted().join()
  const inherited = (value: string) =>
    groupsSaved
      ? tr("access.user.fromGroupsValue", { value })
      : tr("access.user.fromGroups")
  const allowedLabel = (allowed: boolean) =>
    allowed ? tr("access.user.allowed") : tr("access.user.notAllowed")
  const switchLabel = (given: boolean) => (choice: SwitchChoice) =>
    choice === FROM_GROUPS
      ? inherited(allowedLabel(given))
      : allowedLabel(choice === "on")
  const limitLabel =
    (format: (value: string) => string, given: string) => (value: string) =>
      value === FROM_GROUPS ? inherited(given) : format(value)
  const requests =
    values.requests === FROM_GROUPS ? fromGroups.requests : values.requests

  return (
    <FormDialogForm onSubmit={submit}>
      <FormDialogHeader
        title={tr("access.user.title", { name })}
        description={tr("access.user.description")}
      />

      <FormDialogBody>
        <FormColumns count={3}>
          <FormColumn>
            <FormSection title={tr("access.user.gets", { name })}>
              <div className="bg-foreground/[0.02] rounded-xl border px-4 py-3">
                <PolicyFacts
                  policy={user.access.effective}
                  admin={user.role === "admin"}
                  libraries={libraries.data}
                  className="text-foreground text-sm"
                />
              </div>
              {dirty && (
                <SettingNote>{tr("access.user.getsAfterSave")}</SettingNote>
              )}
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
            </FormSection>

            <FormSection title={tr("access.user.groups")}>
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
                        on
                          ? [...ids, group.id]
                          : ids.filter((id) => id !== group.id),
                      )
                    }
                  />
                ))}
              </SettingRows>
              {groups.data?.length === 1 && (
                <SettingNote>{tr("access.user.noGroups")}</SettingNote>
              )}
            </FormSection>
          </FormColumn>

          <FormColumn tall>
            <FormSection
              title={tr("access.user.override")}
              description={
                user.access.overrideSource === "provider"
                  ? undefined
                  : tr("access.user.overrideHint")
              }
            >
              {user.access.overrideSource === "provider" && (
                <SettingWarning>
                  {tr("access.user.overrideFromProvider", { provider, name })}
                </SettingWarning>
              )}
              <SettingRows>
                <form.AppField name="libraries">
                  {() => (
                    <SelectField
                      title={tr("access.libraries")}
                      layout="side"
                      options={LIBRARY_CHOICES}
                      labelOf={(choice) =>
                        choice === FROM_GROUPS
                          ? inherited(
                              librariesLabel(
                                fromGroups.libraries,
                                libraries.data,
                              ),
                            )
                          : choice === "all"
                            ? tr("access.libraries.all")
                            : tr("access.libraries.picked")
                      }
                      hint={
                        values.libraries === "all"
                          ? tr("access.libraries.allHint")
                          : undefined
                      }
                      footer={
                        values.libraries === "some" && (
                          <form.Field name="libraryIds">
                            {(field) => (
                              <LibraryPicker
                                libraries={libraries.data}
                                value={field.state.value}
                                onChange={field.handleChange}
                              />
                            )}
                          </form.Field>
                        )
                      }
                    />
                  )}
                </form.AppField>
                <form.AppField name="maxBitrate">
                  {() => (
                    <SelectField
                      title={tr("access.bitrate")}
                      layout="side"
                      options={withGroups(bitrateOptions, values.maxBitrate)}
                      labelOf={limitLabel(
                        bitrateLabel,
                        bitrateLimitLabel(fromGroups.maxBitrate),
                      )}
                    />
                  )}
                </form.AppField>
                <form.AppField name="transcode">
                  {() => (
                    <SelectField
                      title={tr("access.transcode")}
                      layout="side"
                      options={SWITCH_CHOICES}
                      labelOf={switchLabel(fromGroups.transcode)}
                    />
                  )}
                </form.AppField>
                <form.AppField name="maxStreams">
                  {() => (
                    <SelectField
                      title={tr("access.streams")}
                      layout="side"
                      options={withGroups(streamOptions, values.maxStreams)}
                      labelOf={limitLabel(
                        streamLabel,
                        streamLimitLabel(fromGroups.maxStreams),
                      )}
                    />
                  )}
                </form.AppField>
                <form.AppField name="downloads">
                  {() => (
                    <SelectField
                      title={tr("access.downloads")}
                      layout="side"
                      options={SWITCH_CHOICES}
                      labelOf={switchLabel(fromGroups.downloads)}
                    />
                  )}
                </form.AppField>
                <form.AppField name="requests">
                  {() => (
                    <SelectField
                      title={tr("access.requests")}
                      layout="side"
                      options={REQUEST_CHOICES}
                      labelOf={(choice) =>
                        choice === FROM_GROUPS
                          ? inherited(requestsLabel(fromGroups.requests))
                          : requestsLabel(choice)
                      }
                    />
                  )}
                </form.AppField>
                {requests !== "off" && (
                  <form.Field name="requestLimit">
                    {(field) => (
                      <SelectRow
                        title={tr("access.requestLimit")}
                        layout="side"
                        options={QUOTA_CHOICES}
                        value={quotaChoice(field.state.value)}
                        labelOf={(choice) =>
                          choice === FROM_GROUPS
                            ? inherited(
                                requestLimitLabel(fromGroups.requestLimit),
                              )
                            : limitChoiceLabel(choice)
                        }
                        onChange={(choice) =>
                          field.handleChange(
                            choice === FROM_GROUPS
                              ? undefined
                              : choice === NO_LIMIT
                                ? null
                                : (fromGroups.requestLimit ?? DEFAULT_QUOTA),
                          )
                        }
                        footer={
                          field.state.value ? (
                            <QuotaInputs
                              value={field.state.value}
                              onChange={field.handleChange}
                            />
                          ) : undefined
                        }
                      />
                    )}
                  </form.Field>
                )}
                <form.AppField name="apiTokens">
                  {() => (
                    <SelectField
                      title={tr("access.apiTokens")}
                      layout="side"
                      options={SWITCH_CHOICES}
                      labelOf={switchLabel(fromGroups.apiTokens)}
                    />
                  )}
                </form.AppField>
              </SettingRows>
            </FormSection>
          </FormColumn>

          <FormColumn>
            <FormSection
              title={tr("access.section.server")}
              description={tr("access.section.serverHint")}
            >
              <SettingRows>
                {MANAGED_AREAS.map((area) => (
                  <SelectRow
                    key={area}
                    title={areaLabel(area)}
                    layout="side"
                    options={[FROM_GROUPS, ...areaLevels(area)]}
                    value={values.manages[area]}
                    labelOf={(choice) =>
                      choice === FROM_GROUPS
                        ? inherited(levelLabel(area, fromGroups.manages[area]))
                        : levelLabel(area, choice)
                    }
                    onChange={(choice) =>
                      form.setFieldValue("manages", (current) => ({
                        ...current,
                        [area]: choice,
                      }))
                    }
                    hint={areaHint(area)}
                  />
                ))}
              </SettingRows>
            </FormSection>
          </FormColumn>
        </FormColumns>
      </FormDialogBody>

      <DialogFooter className="m-0 px-6 py-4">
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
    </FormDialogForm>
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
        hint={tr("access.user.everyoneHint")}
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
        hint={tr("access.user.groupFromProvider", { provider })}
        onChange={() => {}}
      />
    )
  }
  return (
    <SwitchRow
      title={group.name}
      checked={checked}
      hint={
        group.providerGroup
          ? tr("access.user.groupFollows", {
              provider,
              group: group.providerGroup,
            })
          : undefined
      }
      onChange={onChange}
    />
  )
}
