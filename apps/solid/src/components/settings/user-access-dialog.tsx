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
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { LogIn } from "lucide"
import { createMemo, For, Show, snapshot, untrack } from "solid-js"

import { tr, translateKnown } from "@/i18n"
import { Button } from "@/kit/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"
import { FeedbackButton } from "@/kit/feedback-button"
import { Icon } from "@/kit/icon"
import { Spinner } from "@/kit/spinner"
import { createForm } from "@/lib/form"
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

/** The form's values, in new arrays and objects, as the form clones them. */
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
    libraryIds: [...(override.libraries?.ids ?? [])],
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
    requestLimit: override.requestLimit && { ...override.requestLimit },
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
export function UserAccessDialog(props: {
  /** Kept while the dialog closes. */
  userId: string | null
  oidcName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <FormDialogContent width="2xl">
        <Show when={props.userId} keyed>
          {(userId) => (
            <AccessForm
              userId={userId}
              oidcName={props.oidcName}
              onDone={() => props.onOpenChange(false)}
            />
          )}
        </Show>
      </FormDialogContent>
    </Dialog>
  )
}

function AccessForm(props: {
  userId: string
  oidcName: string | null
  onDone: () => void
}) {
  // From the list, so the dialog shows the account as each save leaves it.
  const users = useQuery(() => orpc.admin.users.list.queryOptions())
  const user = () =>
    users.isSuccess
      ? users.data.find((entry) => entry.id === props.userId)
      : undefined
  // One editor while the account is there, however often the list changes.
  return (
    <Show
      when={user()}
      fallback={
        <Show
          when={!users.isPending}
          fallback={<Spinner class="mx-auto my-16 size-6 opacity-60" />}
        >
          <div class="flex flex-col gap-5 p-6">
            <DialogHeader>
              <DialogTitle>{tr("access.user.goneTitle")}</DialogTitle>
              <DialogDescription>{tr("access.user.gone")}</DialogDescription>
            </DialogHeader>
            <DialogFooter class="-mx-6 -mb-6 px-6 py-4">
              <Button onClick={() => props.onDone()}>
                {tr("access.done")}
              </Button>
            </DialogFooter>
          </div>
        </Show>
      }
    >
      {(found) => <AccessEditor user={found()} oidcName={props.oidcName} />}
    </Show>
  )
}

function AccessEditor(props: { user: AdminUser; oidcName: string | null }) {
  const queryClient = useQueryClient()
  const groups = useQuery(() => orpc.admin.groups.list.queryOptions())
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const librariesData = () => (libraries.isSuccess ? libraries.data : undefined)
  const name = () => props.user.displayName ?? props.user.username
  const provider = () => props.oidcName ?? tr("access.user.theProvider")
  const initial = createMemo(() => valuesOf(props.user.access))
  const save = useMutation(() => ({
    mutationFn: (input: UserAccessInput) => client.admin.users.setAccess(input),
  }))
  const { feedback, run } = useActionFeedback()

  // Seeded once from the account as it opened; each save resets it to the
  // account the server sends back.
  const form = createForm<AccessValues>({
    defaultValues: untrack(initial),
    onSubmit: () => {},
  })
  const values = () => form.values()

  const send = async () => {
    const value = snapshot(values())
    const parsed = UserAccessInput.safeParse({
      id: props.user.id,
      groupIds: value.groupIds,
      override: overrideOf(value),
    })
    if (!parsed.success) {
      const message = parsed.error.issues.find(
        (issue) => issue.message,
      )?.message
      throw new ShownError(
        message === undefined
          ? tr("access.user.checkFields")
          : translateKnown(message),
      )
    }
    const updated = await save.mutate(parsed.data)
    queryClient.setQueryData(
      orpc.admin.users.list.queryKey(),
      (list: AdminUser[] | undefined) =>
        list?.map((entry) => (entry.id === updated.id ? updated : entry)),
    )
    form.reset(valuesOf(updated.access))
    // Groups count their members.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.admin.groups.key() }),
    ])
  }
  const dirty = () => !sameValues(values(), initial())
  const submit = () => {
    if (feedback().state !== "pending") void run(send)
  }

  const fromProvider = () =>
    new Set(
      props.user.access.groups
        .filter((group) => group.source === "provider")
        .map((group) => group.id),
    )
  // What "From groups" gives, as of the last save. A change to the groups
  // that isn't saved yet could give something else, so then it's left
  // unsaid.
  const fromGroups = () => props.user.access.fromGroups
  const groupsSaved = () =>
    values().groupIds.toSorted().join() === initial().groupIds.toSorted().join()
  const inherited = (value: string) =>
    groupsSaved()
      ? tr("access.user.fromGroupsValue", { value })
      : tr("access.user.fromGroups")
  const allowedLabel = (allowed: boolean) =>
    allowed ? tr("access.user.allowed") : tr("access.user.notAllowed")
  const switchLabel = (given: () => boolean) => (choice: SwitchChoice) =>
    choice === FROM_GROUPS
      ? inherited(allowedLabel(given()))
      : allowedLabel(choice === "on")
  const limitLabel =
    (format: (value: string) => string, given: () => string) =>
    (value: string) =>
      value === FROM_GROUPS ? inherited(given()) : format(value)
  const requests = () =>
    values().requests === FROM_GROUPS
      ? fromGroups().requests
      : values().requests
  const overrideFromProvider = () =>
    props.user.access.overrideSource === "provider"

  return (
    <FormDialogForm onSubmit={submit}>
      <FormDialogHeader
        title={tr("access.user.title", { name: name() })}
        description={tr("access.user.description")}
      />

      <FormDialogBody>
        <FormColumns count={3}>
          <FormColumn>
            <FormSection title={tr("access.user.gets", { name: name() })}>
              <div class="bg-foreground/[0.02] rounded-xl border px-4 py-3">
                <PolicyFacts
                  policy={props.user.access.effective}
                  admin={props.user.role === "admin"}
                  libraries={librariesData()}
                  class="text-foreground text-sm"
                />
              </div>
              <Show when={dirty()}>
                <SettingNote>{tr("access.user.getsAfterSave")}</SettingNote>
              </Show>
              <Show when={props.user.oidcLinked}>
                <SettingNote>
                  <span
                    class="inline-flex"
                    title={
                      props.user.claimsSyncedAt
                        ? formatDateTime(props.user.claimsSyncedAt)
                        : undefined
                    }
                  >
                    <Fact icon={<Icon icon={LogIn} />}>
                      {props.user.claimsSyncedAt
                        ? tr("access.user.claimsSynced", {
                            provider: provider(),
                            when: formatRelative(props.user.claimsSyncedAt),
                          })
                        : tr("access.user.claimsNever", {
                            provider: provider(),
                          })}
                    </Fact>
                  </span>
                </SettingNote>
              </Show>
            </FormSection>

            <FormSection title={tr("access.user.groups")}>
              <SettingRows>
                <For
                  each={groups.isSuccess ? groups.data : []}
                  keyed={(group) => group.id}
                >
                  {(group) => (
                    <GroupSwitch
                      group={group()}
                      provider={provider()}
                      fromProvider={fromProvider().has(group().id)}
                      checked={values().groupIds.includes(group().id)}
                      onChange={(on) => {
                        const others = values().groupIds.filter(
                          (id) => id !== group().id,
                        )
                        // Never twice, however often the switch reports on.
                        form.set(
                          "groupIds",
                          on ? [...others, group().id] : others,
                        )
                      }}
                    />
                  )}
                </For>
              </SettingRows>
              <Show when={groups.isSuccess && groups.data.length === 1}>
                <SettingNote>{tr("access.user.noGroups")}</SettingNote>
              </Show>
            </FormSection>
          </FormColumn>

          <FormColumn tall>
            <FormSection
              title={tr("access.user.override")}
              description={
                overrideFromProvider()
                  ? undefined
                  : tr("access.user.overrideHint")
              }
            >
              <Show when={overrideFromProvider()}>
                <SettingWarning>
                  {tr("access.user.overrideFromProvider", {
                    provider: provider(),
                    name: name(),
                  })}
                </SettingWarning>
              </Show>
              <SettingRows>
                <SelectField
                  form={form}
                  name="libraries"
                  title={tr("access.libraries")}
                  layout="side"
                  options={LIBRARY_CHOICES}
                  labelOf={(choice) =>
                    choice === FROM_GROUPS
                      ? inherited(
                          librariesLabel(
                            fromGroups().libraries,
                            librariesData(),
                          ),
                        )
                      : choice === "all"
                        ? tr("access.libraries.all")
                        : tr("access.libraries.picked")
                  }
                  hint={
                    values().libraries === "all"
                      ? tr("access.libraries.allHint")
                      : undefined
                  }
                  footer={
                    <Show when={values().libraries === "some"}>
                      <LibraryPicker
                        libraries={librariesData()}
                        value={values().libraryIds}
                        onChange={(ids) => form.set("libraryIds", ids)}
                      />
                    </Show>
                  }
                />
                <SelectField
                  form={form}
                  name="maxBitrate"
                  title={tr("access.bitrate")}
                  layout="side"
                  options={withGroups(bitrateOptions, values().maxBitrate)}
                  labelOf={limitLabel(bitrateLabel, () =>
                    bitrateLimitLabel(fromGroups().maxBitrate),
                  )}
                />
                <SelectField
                  form={form}
                  name="transcode"
                  title={tr("access.transcode")}
                  layout="side"
                  options={SWITCH_CHOICES}
                  labelOf={switchLabel(() => fromGroups().transcode)}
                />
                <SelectField
                  form={form}
                  name="maxStreams"
                  title={tr("access.streams")}
                  layout="side"
                  options={withGroups(streamOptions, values().maxStreams)}
                  labelOf={limitLabel(streamLabel, () =>
                    streamLimitLabel(fromGroups().maxStreams),
                  )}
                />
                <SelectField
                  form={form}
                  name="downloads"
                  title={tr("access.downloads")}
                  layout="side"
                  options={SWITCH_CHOICES}
                  labelOf={switchLabel(() => fromGroups().downloads)}
                />
                <SelectField
                  form={form}
                  name="requests"
                  title={tr("access.requests")}
                  layout="side"
                  options={REQUEST_CHOICES}
                  labelOf={(choice) =>
                    choice === FROM_GROUPS
                      ? inherited(requestsLabel(fromGroups().requests))
                      : requestsLabel(choice)
                  }
                />
                <Show when={requests() !== "off"}>
                  <SelectRow
                    title={tr("access.requestLimit")}
                    layout="side"
                    options={QUOTA_CHOICES}
                    value={quotaChoice(values().requestLimit)}
                    labelOf={(choice) =>
                      choice === FROM_GROUPS
                        ? inherited(
                            requestLimitLabel(fromGroups().requestLimit),
                          )
                        : limitChoiceLabel(choice)
                    }
                    onChange={(choice) =>
                      form.set(
                        "requestLimit",
                        choice === FROM_GROUPS
                          ? undefined
                          : choice === NO_LIMIT
                            ? null
                            : (fromGroups().requestLimit ?? DEFAULT_QUOTA),
                      )
                    }
                    footer={
                      <Show when={values().requestLimit}>
                        {(limit) => (
                          <QuotaInputs
                            value={limit()}
                            onChange={(next) => form.set("requestLimit", next)}
                          />
                        )}
                      </Show>
                    }
                  />
                </Show>
                <SelectField
                  form={form}
                  name="apiTokens"
                  title={tr("access.apiTokens")}
                  layout="side"
                  options={SWITCH_CHOICES}
                  labelOf={switchLabel(() => fromGroups().apiTokens)}
                />
              </SettingRows>
            </FormSection>
          </FormColumn>

          <FormColumn>
            <FormSection
              title={tr("access.section.server")}
              description={tr("access.section.serverHint")}
            >
              <SettingRows>
                <For each={MANAGED_AREAS}>
                  {(area) => (
                    <SelectRow
                      title={areaLabel(area)}
                      layout="side"
                      options={[FROM_GROUPS, ...areaLevels(area)]}
                      value={values().manages[area]}
                      labelOf={(choice) =>
                        choice === FROM_GROUPS
                          ? inherited(
                              levelLabel(area, fromGroups().manages[area]),
                            )
                          : levelLabel(area, choice)
                      }
                      onChange={(choice) =>
                        form.set("manages", {
                          ...values().manages,
                          [area]: choice,
                        })
                      }
                      hint={areaHint(area)}
                    />
                  )}
                </For>
              </SettingRows>
            </FormSection>
          </FormColumn>
        </FormColumns>
      </FormDialogBody>

      <DialogFooter class="m-0 px-6 py-4">
        <FeedbackButton
          type="submit"
          state={feedback().state}
          pendingLabel={tr("access.user.saving")}
          successLabel={tr("access.user.saved")}
          errorLabel={tr("access.user.retry")}
          disabled={!dirty() && feedback().state !== "success"}
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
function GroupSwitch(props: {
  group: AccessGroup
  provider: string
  fromProvider: boolean
  checked: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <Show
      when={props.group.everyone}
      fallback={
        <Show
          when={props.fromProvider}
          fallback={
            <SwitchRow
              title={props.group.name}
              checked={props.checked}
              hint={
                props.group.providerGroup
                  ? tr("access.user.groupFollows", {
                      provider: props.provider,
                      group: props.group.providerGroup,
                    })
                  : undefined
              }
              onChange={(on) => props.onChange(on)}
            />
          }
        >
          <SwitchRow
            title={props.group.name}
            checked
            disabled
            hint={tr("access.user.groupFromProvider", {
              provider: props.provider,
            })}
            onChange={() => {}}
          />
        </Show>
      }
    >
      <SwitchRow
        title={tr("access.everyone")}
        checked
        disabled
        hint={tr("access.user.everyoneHint")}
        onChange={() => {}}
      />
    </Show>
  )
}
