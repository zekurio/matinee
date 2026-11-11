import {
  type AccessGroup,
  AccessGroupInput,
  type AccessPolicy,
  GroupName,
  type ProviderGroup,
  ProviderGroupName,
} from "@matinee/contracts"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@matinee/ui/components/autocomplete"
import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import { toast } from "@matinee/ui/components/sonner"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useId } from "react"

import { tr } from "@/i18n"
import { firstError, useAppForm, useFieldContext } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"

import {
  bitrateLabel,
  bitrateOptions,
  LibraryPicker,
  limitOf,
  limitValue,
  streamLabel,
  streamOptions,
} from "./access-controls"
import { groupName } from "./access-facts"
import { SelectField, SwitchField } from "./setting-controls"
import { SettingNote, SettingRows } from "./settings-panel"

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
  downloads: boolean
  maxStreams: string
}

/** A new group opens every library and limits nothing, as Everyone starts. */
function valuesOf(group: AccessGroup | undefined): GroupValues {
  return {
    name: group?.name ?? "",
    providerGroup: group?.providerGroup ?? "",
    libraries: !group || group.policy.libraries.all ? "all" : "some",
    libraryIds: group?.policy.libraries.ids ?? [],
    maxBitrate: limitValue(group?.policy.maxBitrate ?? null),
    transcode: group?.policy.transcode ?? true,
    downloads: group?.policy.downloads ?? true,
    maxStreams: limitValue(group?.policy.maxStreams ?? null),
  }
}

function policyOf(value: GroupValues): AccessPolicy {
  const all = value.libraries === "all"
  return {
    libraries: { all, ids: all ? [] : value.libraryIds },
    maxBitrate: limitOf(value.maxBitrate),
    transcode: value.transcode,
    downloads: value.downloads,
    maxStreams: limitOf(value.maxStreams),
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-lg">
        {open && <GroupForm group={group} onDone={() => onOpenChange(false)} />}
      </DialogContent>
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
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const everyone = group?.everyone ?? false

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
    defaultValues: valuesOf(group),
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
          <DialogTitle className="text-lg leading-7 font-semibold">
            {group
              ? tr("access.group.editTitle", { name: groupName(group) })
              : tr("access.group.newTitle")}
          </DialogTitle>
          <DialogDescription>
            {everyone
              ? tr("access.group.everyoneDescription")
              : tr("access.group.description")}
          </DialogDescription>
        </DialogHeader>

        {!everyone && (
          <FieldGroup>
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
          </FieldGroup>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{tr("access.group.allows")}</h3>
          <SettingRows>
            <form.AppField name="libraries">
              {() => (
                <SelectField
                  title={tr("access.libraries")}
                  options={LIBRARY_CHOICES}
                  labelOf={(choice) =>
                    choice === "all"
                      ? tr("access.libraries.all")
                      : tr("access.libraries.picked")
                  }
                  footer={
                    libraryChoice === "all" ? (
                      <SettingNote>
                        {tr("access.libraries.allHint")}
                      </SettingNote>
                    ) : (
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
                  options={bitrateOptions(maxBitrate)}
                  labelOf={bitrateLabel}
                  footer={
                    <SettingNote>{tr("access.bitrate.hint")}</SettingNote>
                  }
                />
              )}
            </form.AppField>
            <form.AppField name="transcode">
              {() => (
                <SwitchField
                  title={tr("access.transcode")}
                  footer={
                    <SettingNote>{tr("access.transcode.hint")}</SettingNote>
                  }
                />
              )}
            </form.AppField>
            <form.AppField name="downloads">
              {() => (
                <SwitchField
                  title={tr("access.downloads")}
                  footer={
                    <SettingNote>{tr("access.downloads.hint")}</SettingNote>
                  }
                />
              )}
            </form.AppField>
            <form.AppField name="maxStreams">
              {() => (
                <SelectField
                  title={tr("access.streams")}
                  options={streamOptions(maxStreams)}
                  labelOf={streamLabel}
                  footer={
                    <SettingNote>{tr("access.streams.hint")}</SettingNote>
                  }
                />
              )}
            </form.AppField>
          </SettingRows>
        </div>

        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <Button type="button" variant="ghost" onClick={onDone}>
            {tr("access.cancel")}
          </Button>
          <form.Subscribe
            selector={(state) => !everyone && !state.values.name.trim()}
          >
            {(incomplete) => (
              <form.SubmitButton disabled={incomplete} pending={save.isPending}>
                {group ? tr("access.group.save") : tr("access.group.create")}
              </form.SubmitButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
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
