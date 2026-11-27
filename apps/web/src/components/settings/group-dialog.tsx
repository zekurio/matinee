import {
  type AccessGroup,
  AccessGroupInput,
  type AccessPolicy,
  areaLevels,
  GroupName,
  MANAGED_AREAS,
  type ManagedAccess,
  MANAGES_NOTHING,
  ProviderGroupName,
  REQUEST_MODES,
  type RequestMode,
} from "@matinee/contracts"
import { FIELD_CLASS_NAME } from "@matinee/ui/lib/field"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { useRouteContext } from "@tanstack/solid-router"
import { createUniqueId, For, Show, snapshot, untrack } from "solid-js"

import { tr, translateKnown } from "@/i18n"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/kit/autocomplete"
import { Dialog } from "@/kit/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/kit/field"
import { toast } from "@/kit/toast"
import { createForm, type Form } from "@/lib/form"
import { SubmitButton, TextField } from "@/lib/form-fields"
import { canAll } from "@/lib/permissions"
import { client, errorMessage, orpc } from "@/lib/rpc"

import {
  bitrateLabel,
  bitrateOptions,
  type Capability,
  capabilityPermissions,
  DEFAULT_QUOTA,
  LIMIT_CHOICES,
  LibraryPicker,
  limitChoiceLabel,
  limitChoiceOf,
  limitOf,
  limitValue,
  NO_LIMIT,
  QuotaInputs,
  requestsLabel,
  streamLabel,
  streamOptions,
} from "./access-controls"
import { areaHint, areaLabel, groupName, levelLabel } from "./access-facts"
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
import { SelectField, SelectRow, SwitchField } from "./setting-controls"
import { SettingRows } from "./settings-panel"

type LibraryChoice = "all" | "some"
const LIBRARY_CHOICES: readonly LibraryChoice[] = ["all", "some"]

/** The editor's form. Limits are text, as the selects hold them. */
type GroupValues = {
  name: string
  providerGroup: string
  libraries: LibraryChoice
  libraryIds: string[]
  maxBitrate: string
  transcode: boolean
  maxStreams: string
  downloads: boolean
  requests: RequestMode
  requestLimit: AccessPolicy["requestLimit"]
  apiTokens: boolean
  manages: ManagedAccess
}

/**
 * A new group opens every library and limits nothing, as Everyone starts,
 * and lets members download and nothing else. Downloading starts off for
 * an editor who can't grant it, since the server would refuse the group.
 */
function valuesOf(
  group: AccessGroup | undefined,
  mayDownload: boolean,
): GroupValues {
  return {
    name: group?.name ?? "",
    providerGroup: group?.providerGroup ?? "",
    libraries: !group || group.policy.libraries.all ? "all" : "some",
    libraryIds: group?.policy.libraries.ids ?? [],
    maxBitrate: limitValue(group?.policy.maxBitrate ?? null),
    transcode: group?.policy.transcode ?? true,
    maxStreams: limitValue(group?.policy.maxStreams ?? null),
    downloads: group?.policy.downloads ?? mayDownload,
    requests: group?.policy.requests ?? "off",
    requestLimit: group?.policy.requestLimit ?? null,
    apiTokens: group?.policy.apiTokens ?? false,
    manages: group?.policy.manages ?? MANAGES_NOTHING,
  }
}

function policyOf(value: GroupValues): AccessPolicy {
  const all = value.libraries === "all"
  return {
    libraries: { all, ids: all ? [] : value.libraryIds },
    maxBitrate: limitOf(value.maxBitrate),
    transcode: value.transcode,
    maxStreams: limitOf(value.maxStreams),
    downloads: value.downloads,
    requests: value.requests,
    requestLimit: value.requestLimit,
    apiTokens: value.apiTokens,
    manages: value.manages,
  }
}

/** The kit input's look, for a field ui-sdk's autocomplete renders. */
const INPUT_CLASS = cn(
  FIELD_CLASS_NAME,
  "h-10 w-full min-w-0 rounded-lg px-3 py-1 md:h-9 [@media(pointer:coarse)]:h-11 text-base placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/60 aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
)

/** The first issue's message, in the interface's language. */
function firstIssue(
  issues: ReadonlyArray<{ message?: string }>,
): string | undefined {
  const message = issues.find((issue) => issue.message)?.message
  return message === undefined ? undefined : translateKnown(message)
}

/** Creates a group, or edits one. The built-in group only has its policy. */
export function GroupDialog(props: {
  /** Unset for a new group. */
  group?: AccessGroup
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // A form of its own for each group, as its values start from the group.
  const editing = () => ({ group: props.group })
  return (
    <Dialog open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <FormDialogContent width="xl">
        <Show when={editing()} keyed>
          {(entry) => (
            <GroupForm
              group={entry.group}
              onDone={() => props.onOpenChange(false)}
            />
          )}
        </Show>
      </FormDialogContent>
    </Dialog>
  )
}

function GroupForm(props: { group?: AccessGroup; onDone: () => void }) {
  const queryClient = useQueryClient()
  const context = useRouteContext({ from: "/_authed" })
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const librariesData = () => (libraries.isSuccess ? libraries.data : undefined)
  // The form starts from the group it opened with; another group gets
  // another form. A plain copy, as the form clones what it starts from.
  const group = props.group && snapshot(props.group)
  const everyone = group?.everyone ?? false
  // The server refuses a change to a permission its maker lacks, so a
  // capability whose permissions they don't all hold stays as it is.
  const mayGrant = (capability: Capability) =>
    canAll(context().user, capabilityPermissions(capability))
  const grantsAll = () => MANAGED_AREAS.every(mayGrant)

  const save = useMutation(() => ({
    mutationFn: (input: AccessGroupInput) =>
      group
        ? client.admin.groups.update({ ...input, id: group.id })
        : client.admin.groups.create(input),
    // The list shows the change. Accounts and invites name their groups.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.admin.groups.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.admin.invites.key() }),
      ])
      props.onDone()
    },
    onError: (error) => toast.error(errorMessage(error)),
  }))

  const toInput = (value: GroupValues) => ({
    // The server keeps the built-in group's name and provider group.
    name: everyone && group ? group.name : value.name,
    providerGroup: everyone ? null : value.providerGroup.trim() || null,
    policy: policyOf(value),
  })

  const form = createForm<GroupValues>({
    // Seeded once, from who opened it; another group opens another form.
    defaultValues: valuesOf(
      group,
      untrack(() => mayGrant("downloads")),
    ),
    // The built-in group has no name or provider group to check.
    checks: everyone
      ? {}
      : { name: GroupName, providerGroup: ProviderGroupName },
    onSubmit: (value) => {
      // One message for the whole form, in a toast.
      const parsed = AccessGroupInput.safeParse(toInput(value))
      if (!parsed.success) {
        toast.error(
          firstIssue(parsed.error.issues) ?? tr("access.group.checkFields"),
        )
        return
      }
      save.mutate(parsed.data)
    },
  })
  const values = () => form.values()

  const submit = () => {
    if (!everyone) {
      // Field errors show under their fields, and the first in a toast.
      const name = GroupName.safeParse(values().name)
      const provider = ProviderGroupName.safeParse(values().providerGroup)
      const message = !name.success
        ? firstIssue(name.error.issues)
        : !provider.success
          ? firstIssue(provider.error.issues)
          : undefined
      if (message) toast.error(message)
    }
    void form.submit()
  }

  return (
    <FormDialogForm onSubmit={submit}>
      <FormDialogHeader
        title={
          group
            ? tr("access.group.editTitle", { name: groupName(group) })
            : tr("access.group.newTitle")
        }
        description={
          everyone
            ? tr("access.group.everyoneDescription")
            : tr("access.group.description")
        }
      />

      <FormDialogBody>
        <Show when={!everyone}>
          <div class="grid items-start gap-x-8 gap-y-5 md:grid-cols-2">
            <TextField
              form={form}
              name="name"
              label={tr("access.group.name")}
              placeholder={tr("access.group.namePlaceholder")}
              maxlength={64}
              autocomplete="off"
              revealEmptyOnBlur={false}
            />
            <ProviderGroupField form={form} name="providerGroup" />
          </div>
        </Show>

        <FormColumns>
          <FormColumn>
            <FormSection title={tr("access.section.watching")}>
              <SettingRows>
                <SelectField
                  form={form}
                  name="libraries"
                  title={tr("access.libraries")}
                  layout="side"
                  options={LIBRARY_CHOICES}
                  labelOf={(choice) =>
                    choice === "all"
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
                  options={bitrateOptions(values().maxBitrate)}
                  labelOf={bitrateLabel}
                  hint={tr("access.bitrate.hint")}
                />
                <SwitchField
                  form={form}
                  name="transcode"
                  title={tr("access.transcode")}
                  hint={tr("access.transcode.hint")}
                />
                <SelectField
                  form={form}
                  name="maxStreams"
                  title={tr("access.streams")}
                  layout="side"
                  options={streamOptions(values().maxStreams)}
                  labelOf={streamLabel}
                />
                <SwitchField
                  form={form}
                  name="downloads"
                  title={tr("access.downloads")}
                  disabled={!mayGrant("downloads")}
                  hint={tr("access.downloads.hint")}
                />
              </SettingRows>
            </FormSection>

            <FormSection title={tr("access.section.requests")}>
              <SettingRows>
                <SelectField
                  form={form}
                  name="requests"
                  title={tr("access.requests")}
                  layout="side"
                  disabled={!mayGrant("requests")}
                  options={REQUEST_MODES}
                  labelOf={requestsLabel}
                />
                <Show when={values().requests !== "off"}>
                  <SelectRow
                    title={tr("access.requestLimit")}
                    layout="side"
                    options={LIMIT_CHOICES}
                    value={limitChoiceOf(values().requestLimit)}
                    labelOf={limitChoiceLabel}
                    onChange={(choice) =>
                      form.set(
                        "requestLimit",
                        choice === NO_LIMIT ? null : DEFAULT_QUOTA,
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
              </SettingRows>
            </FormSection>
          </FormColumn>

          <FormColumn>
            <FormSection
              title={tr("access.section.server")}
              description={
                grantsAll()
                  ? tr("access.section.serverHint")
                  : `${tr("access.section.serverHint")} ${tr("access.permissions.ownOnly")}`
              }
            >
              <SettingRows>
                <For each={MANAGED_AREAS}>
                  {(area) => (
                    <SelectRow
                      title={areaLabel(area)}
                      layout="side"
                      disabled={!mayGrant(area)}
                      options={areaLevels(area)}
                      value={values().manages[area]}
                      labelOf={(level) => levelLabel(area, level)}
                      onChange={(level) =>
                        form.set("manages", {
                          ...values().manages,
                          [area]: level,
                        })
                      }
                      hint={areaHint(area)}
                    />
                  )}
                </For>
              </SettingRows>
            </FormSection>

            <FormSection title={tr("access.section.api")}>
              <SettingRows>
                <SwitchField
                  form={form}
                  name="apiTokens"
                  title={tr("access.apiTokens")}
                  disabled={!mayGrant("apiTokens")}
                  hint={tr("access.apiTokens.hint")}
                />
              </SettingRows>
            </FormSection>
          </FormColumn>
        </FormColumns>
      </FormDialogBody>

      <FormDialogFooter>
        <SubmitButton
          form={form}
          disabled={!everyone && !values().name.trim()}
          pending={save.isPending}
        >
          {group ? tr("access.group.save") : tr("access.group.create")}
        </SubmitButton>
      </FormDialogFooter>
    </FormDialogForm>
  )
}

/**
 * The provider group a group follows: free text, with the names the
 * provider sent for linked accounts offered as it's typed.
 */
function ProviderGroupField(props: {
  form: Form<GroupValues>
  name: "providerGroup"
}) {
  const suggestions = useQuery(() =>
    orpc.admin.groups.providerGroups.queryOptions(),
  )
  const items = () => (suggestions.isSuccess ? suggestions.data : [])
  const id = createUniqueId()
  const message = () => props.form.message(props.name)
  return (
    <Field
      invalid={message() ? true : undefined}
      class="data-invalid:text-destructive"
    >
      <FieldLabel for={id}>{tr("access.group.providerGroup")}</FieldLabel>
      {/* The form only follows it: each group opens a form of its own, so
          nothing else changes the text. */}
      <Autocomplete
        defaultValue={props.form.values().providerGroup}
        openOnFocus
        onValueChange={(next) => props.form.set(props.name, next)}
      >
        <AutocompleteInput
          id={id}
          name={props.name}
          aria-invalid={message() ? "true" : undefined}
          placeholder={tr("access.group.providerGroupPlaceholder")}
          autocomplete="off"
          spellcheck={false}
          maxlength={256}
          onBlur={() => props.form.blur(props.name)}
          class={INPUT_CLASS}
        />
        <Show when={items().length > 0}>
          <AutocompleteContent
            anchor={`#${CSS.escape(id)}`}
            sideOffset={4}
            class="has-data-empty:hidden"
          >
            <AutocompleteList>
              <For each={items()} keyed={(item) => item.name}>
                {(item) => (
                  <AutocompleteItem value={item().name}>
                    <span class="min-w-0 flex-1 truncate">{item().name}</span>
                    <span class="text-muted-foreground shrink-0 text-xs">
                      {tr("access.group.providerAccounts", {
                        count: item().accounts,
                      })}
                    </span>
                  </AutocompleteItem>
                )}
              </For>
            </AutocompleteList>
          </AutocompleteContent>
        </Show>
      </Autocomplete>
      <Show
        when={message()}
        fallback={
          <FieldDescription>
            {suggestions.isSuccess && suggestions.data.length === 0
              ? tr("access.group.providerGroupHintNoClaim")
              : tr("access.group.providerGroupHint")}
          </FieldDescription>
        }
      >
        {(text) => <FieldError>{text()}</FieldError>}
      </Show>
    </Field>
  )
}
