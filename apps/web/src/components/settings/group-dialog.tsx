import {
  type AccessGroup,
  AccessGroupInput,
  type AccessPolicy,
  areaLevels,
  GroupName,
  MANAGED_AREAS,
  type ManagedAccess,
  MANAGES_NOTHING,
  type ProviderGroup,
  ProviderGroupName,
  REQUEST_MODES,
  type RequestMode,
} from "@matinee/contracts"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@matinee/ui/components/autocomplete"
import { Dialog } from "@matinee/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import { toast } from "@matinee/ui/components/sonner"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouteContext } from "@tanstack/react-router"
import { useId } from "react"

import { tr } from "@/i18n"
import { firstError, useAppForm, useFieldContext } from "@/lib/form"
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

/** Creates a group, or edits one. The built-in group only has its policy. */
export function GroupDialog({
  group,
  open,
  onOpenChange,
}: {
  /** Unset for a new group. */
  group?: AccessGroup
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent width="xl">
        <GroupForm
          key={group?.id ?? "new"}
          group={group}
          onDone={() => onOpenChange(false)}
        />
      </FormDialogContent>
    </Dialog>
  )
}

function GroupForm({
  group,
  onDone,
}: {
  group?: AccessGroup
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const { user } = useRouteContext({ from: "/_authed" })
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const everyone = group?.everyone ?? false
  // The server refuses a change to a permission its maker lacks, so a
  // capability whose permissions they don't all hold stays as it is.
  const mayGrant = (capability: Capability) =>
    canAll(user, capabilityPermissions(capability))
  const grantsAll = MANAGED_AREAS.every(mayGrant)

  const save = useMutation({
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
      onDone()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const toInput = (value: GroupValues) => ({
    // The server keeps the built-in group's name and provider group.
    name: everyone && group ? group.name : value.name,
    providerGroup: everyone ? null : value.providerGroup.trim() || null,
    policy: policyOf(value),
  })

  const form = useAppForm({
    defaultValues: valuesOf(group, mayGrant("downloads")),
    validators: {
      // One message for the whole form, in a toast.
      onSubmit: ({ value }) => {
        const parsed = AccessGroupInput.safeParse(toInput(value))
        if (parsed.success) return undefined
        return {
          message:
            firstError(parsed.error.issues) ?? tr("access.group.checkFields"),
        }
      },
    },
    onSubmit: ({ value }) =>
      save.mutate(AccessGroupInput.parse(toInput(value))),
    onSubmitInvalid: ({ formApi }) => {
      // Field errors show under their fields.
      const message = firstError(formApi.state.errors)
      if (message) toast.error(message)
    },
  })
  const libraryChoice = useSelector(
    form.store,
    (state) => state.values.libraries,
  )
  const maxBitrate = useSelector(form.store, (state) => state.values.maxBitrate)
  const maxStreams = useSelector(form.store, (state) => state.values.maxStreams)
  const requests = useSelector(form.store, (state) => state.values.requests)
  const manages = useSelector(form.store, (state) => state.values.manages)

  return (
    <form.AppForm>
      <FormDialogForm onSubmit={() => void form.handleSubmit()}>
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
          {!everyone && (
            <div className="grid items-start gap-x-8 gap-y-5 md:grid-cols-2">
              <form.AppField name="name" validators={{ onChange: GroupName }}>
                {(field) => (
                  <field.TextField
                    label={tr("access.group.name")}
                    placeholder={tr("access.group.namePlaceholder")}
                    maxLength={64}
                    autoComplete="off"
                  />
                )}
              </form.AppField>
              <form.AppField
                name="providerGroup"
                validators={{ onChange: ProviderGroupName }}
              >
                {() => <ProviderGroupField />}
              </form.AppField>
            </div>
          )}

          <FormColumns>
            <FormColumn>
              <FormSection title={tr("access.section.watching")}>
                <SettingRows>
                  <form.AppField name="libraries">
                    {() => (
                      <SelectField
                        title={tr("access.libraries")}
                        layout="side"
                        options={LIBRARY_CHOICES}
                        labelOf={(choice) =>
                          choice === "all"
                            ? tr("access.libraries.all")
                            : tr("access.libraries.picked")
                        }
                        hint={
                          libraryChoice === "all"
                            ? tr("access.libraries.allHint")
                            : undefined
                        }
                        footer={
                          libraryChoice === "some" && (
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
                        options={bitrateOptions(maxBitrate)}
                        labelOf={bitrateLabel}
                        hint={tr("access.bitrate.hint")}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="transcode">
                    {() => (
                      <SwitchField
                        title={tr("access.transcode")}
                        hint={tr("access.transcode.hint")}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="maxStreams">
                    {() => (
                      <SelectField
                        title={tr("access.streams")}
                        layout="side"
                        options={streamOptions(maxStreams)}
                        labelOf={streamLabel}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="downloads">
                    {() => (
                      <SwitchField
                        title={tr("access.downloads")}
                        disabled={!mayGrant("downloads")}
                        hint={tr("access.downloads.hint")}
                      />
                    )}
                  </form.AppField>
                </SettingRows>
              </FormSection>

              <FormSection title={tr("access.section.requests")}>
                <SettingRows>
                  <form.AppField name="requests">
                    {() => (
                      <SelectField
                        title={tr("access.requests")}
                        layout="side"
                        disabled={!mayGrant("requests")}
                        options={REQUEST_MODES}
                        labelOf={requestsLabel}
                      />
                    )}
                  </form.AppField>
                  {requests !== "off" && (
                    <form.Field name="requestLimit">
                      {(field) => (
                        <SelectRow
                          title={tr("access.requestLimit")}
                          layout="side"
                          options={LIMIT_CHOICES}
                          value={limitChoiceOf(field.state.value)}
                          labelOf={limitChoiceLabel}
                          onChange={(choice) =>
                            field.handleChange(
                              choice === NO_LIMIT ? null : DEFAULT_QUOTA,
                            )
                          }
                          footer={
                            field.state.value === null ? undefined : (
                              <QuotaInputs
                                value={field.state.value}
                                onChange={field.handleChange}
                              />
                            )
                          }
                        />
                      )}
                    </form.Field>
                  )}
                </SettingRows>
              </FormSection>
            </FormColumn>

            <FormColumn>
              <FormSection
                title={tr("access.section.server")}
                description={
                  grantsAll
                    ? tr("access.section.serverHint")
                    : `${tr("access.section.serverHint")} ${tr("access.permissions.ownOnly")}`
                }
              >
                <SettingRows>
                  {MANAGED_AREAS.map((area) => (
                    <SelectRow
                      key={area}
                      title={areaLabel(area)}
                      layout="side"
                      disabled={!mayGrant(area)}
                      options={areaLevels(area)}
                      value={manages[area]}
                      labelOf={(level) => levelLabel(area, level)}
                      onChange={(level) =>
                        form.setFieldValue("manages", (current) => ({
                          ...current,
                          [area]: level,
                        }))
                      }
                      hint={areaHint(area)}
                    />
                  ))}
                </SettingRows>
              </FormSection>

              <FormSection title={tr("access.section.api")}>
                <SettingRows>
                  <form.AppField name="apiTokens">
                    {() => (
                      <SwitchField
                        title={tr("access.apiTokens")}
                        disabled={!mayGrant("apiTokens")}
                        hint={tr("access.apiTokens.hint")}
                      />
                    )}
                  </form.AppField>
                </SettingRows>
              </FormSection>
            </FormColumn>
          </FormColumns>
        </FormDialogBody>

        <FormDialogFooter>
          <form.Subscribe
            selector={(state) => !everyone && !state.values.name.trim()}
          >
            {(incomplete) => (
              <form.SubmitButton disabled={incomplete} pending={save.isPending}>
                {group ? tr("access.group.save") : tr("access.group.create")}
              </form.SubmitButton>
            )}
          </form.Subscribe>
        </FormDialogFooter>
      </FormDialogForm>
    </form.AppForm>
  )
}

/**
 * The provider group a group follows: free text, with the names the
 * provider sent for linked accounts offered as it's typed.
 */
function ProviderGroupField() {
  const field = useFieldContext<string>()
  const value = useSelector(field.store, (state) => state.value)
  const errors = useSelector(field.store, (state) => state.meta.errors)
  const suggestions = useQuery(orpc.admin.groups.providerGroups.queryOptions())
  const id = useId()
  const message = firstError(errors)
  const items = suggestions.data ?? []

  return (
    <Field data-invalid={message ? true : undefined}>
      <FieldLabel htmlFor={id}>{tr("access.group.providerGroup")}</FieldLabel>
      <Autocomplete
        items={items}
        value={value}
        itemToStringValue={(item: ProviderGroup) => item.name}
        openOnInputClick
        onValueChange={(next) => field.handleChange(next)}
      >
        <AutocompleteInput
          id={id}
          name={field.name}
          aria-invalid={message ? true : undefined}
          placeholder={tr("access.group.providerGroupPlaceholder")}
          autoComplete="off"
          spellCheck={false}
          maxLength={256}
          render={<Input />}
        />
        {items.length > 0 && (
          <AutocompleteContent sideOffset={4} className="data-empty:hidden">
            <AutocompleteList>
              {(item: ProviderGroup) => (
                <AutocompleteItem key={item.name} value={item}>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {tr("access.group.providerAccounts", {
                      count: item.accounts,
                    })}
                  </span>
                </AutocompleteItem>
              )}
            </AutocompleteList>
          </AutocompleteContent>
        )}
      </Autocomplete>
      {message ? (
        <FieldError>{message}</FieldError>
      ) : (
        <FieldDescription>
          {suggestions.data?.length === 0
            ? tr("access.group.providerGroupHintNoClaim")
            : tr("access.group.providerGroupHint")}
        </FieldDescription>
      )}
    </Field>
  )
}
