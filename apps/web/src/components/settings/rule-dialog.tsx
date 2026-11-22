import type {
  DescribedField,
  FulfilmentConnection,
  FulfilmentKeyword,
  FulfilmentRule,
  FulfilmentRuleChoices,
  TitleKind,
} from "@matinee/contracts"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@matinee/ui/components/combobox"
import { Dialog } from "@matinee/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@matinee/ui/components/field"
import { toast } from "@matinee/ui/components/sonner"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useId, useState } from "react"

import { MultiSelect } from "@/components/multi-select"
import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"

import {
  DescribedInput,
  type FormValues,
  formValues,
  LandsIn,
  sendValues,
  textOf,
} from "./connection-fields"
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

type RuleValues = {
  users: string[]
  genres: string[]
  languages: string[]
  keywords: FulfilmentKeyword[]
  settings: FormValues
  /** The library the rule's folder lands in, when no library holds it. */
  folderLibrary: string | null
}

function valuesOf(
  rule: FulfilmentRule | undefined,
  fields: DescribedField[],
): RuleValues {
  return {
    users: rule?.users ?? [],
    genres: (rule?.genres ?? []).map(String),
    languages: rule?.languages ?? [],
    keywords: rule?.keywords ?? [],
    settings: formValues(fields, rule?.settings ?? {}),
    folderLibrary: null,
  }
}

/** Adds an override rule to a connection, or edits one. */
export function RuleDialog({
  connection,
  kind,
  fields,
  choices,
  rule,
  open,
  onOpenChange,
}: {
  connection: FulfilmentConnection
  /** The kind of title the connection takes. */
  kind: TitleKind
  /** The settings a rule can change, with the server's choices. */
  fields: DescribedField[]
  choices: FulfilmentRuleChoices | undefined
  /** Unset for a new one. */
  rule?: FulfilmentRule
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent width="lg">
        <RuleForm
          connection={connection}
          kind={kind}
          fields={fields}
          choices={choices}
          rule={rule}
          onDone={() => onOpenChange(false)}
        />
      </FormDialogContent>
    </Dialog>
  )
}

function RuleForm({
  connection,
  kind,
  fields,
  choices,
  rule,
  onDone,
}: {
  connection: FulfilmentConnection
  kind: TitleKind
  fields: DescribedField[]
  choices: FulfilmentRuleChoices | undefined
  rule?: FulfilmentRule
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const id = useId()
  const save = useMutation({
    mutationFn: (value: RuleValues) => {
      const settings = sendValues(fields, value.settings)
      const input = {
        connectionId: connection.id,
        users: value.users,
        genres: value.genres.map(Number),
        languages: value.languages,
        keywords: value.keywords,
        settings,
        folderLibraryId: value.folderLibrary,
      }
      return rule
        ? client.admin.fulfilment.updateRule({ ...input, id: rule.id })
        : client.admin.fulfilment.createRule(input)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.admin.fulfilment.key(),
      })
      onDone()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const form = useAppForm({
    defaultValues: valuesOf(rule, fields),
    onSubmit: ({ value }) => save.mutate(value),
  })
  const values = useSelector(form.store, (state) => state.values)
  const conditions =
    values.users.length +
    values.genres.length +
    values.languages.length +
    values.keywords.length
  const settings = sendValues(fields, values.settings)
  const folderField = fields.find((field) => field.folder)
  const folderValue = folderField ? values.settings[folderField.key] : undefined
  const folder = textOf(folderValue)
  // A saved value the choices don't hold: still loading, or gone since.
  const unknown = () =>
    choices
      ? tr("connections.rules.unknownChoice")
      : tr("connections.rules.loadingChoice")

  return (
    <form.AppForm>
      <FormDialogForm onSubmit={() => void form.handleSubmit()}>
        <FormDialogHeader
          title={
            rule
              ? tr("connections.rules.dialog.editTitle")
              : tr("connections.rules.dialog.addTitle")
          }
        />

        <FormDialogBody>
          <FormColumns>
            <FormColumn>
              <FormSection
                title={tr("connections.rules.conditions")}
                description={tr("connections.rules.conditions.description")}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor={`${id}-users`}>
                      {tr("connections.rules.users")}
                    </FieldLabel>
                    <MultiSelect
                      id={`${id}-users`}
                      placeholder={tr("connections.rules.users.find")}
                      empty={tr("connections.field.findEmpty")}
                      unknown={unknown}
                      choices={(choices?.users ?? []).map((user) => ({
                        value: user.id,
                        label: user.name,
                      }))}
                      value={values.users}
                      onChange={(next) => form.setFieldValue("users", next)}
                    />
                  </Field>
                  {choices?.tmdb !== false && (
                    <Field>
                      <FieldLabel htmlFor={`${id}-genres`}>
                        {tr("connections.rules.genres")}
                      </FieldLabel>
                      <MultiSelect
                        id={`${id}-genres`}
                        placeholder={tr("connections.rules.genres.find")}
                        empty={tr("connections.field.findEmpty")}
                        unknown={unknown}
                        choices={(choices?.genres ?? []).map((genre) => ({
                          value: String(genre.id),
                          label: genre.name,
                        }))}
                        value={values.genres}
                        onChange={(next) => form.setFieldValue("genres", next)}
                      />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor={`${id}-languages`}>
                      {tr("connections.rules.languages")}
                    </FieldLabel>
                    <MultiSelect
                      id={`${id}-languages`}
                      placeholder={tr("connections.rules.languages.find")}
                      empty={tr("connections.field.findEmpty")}
                      unknown={unknown}
                      choices={(choices?.languages ?? []).map((language) => ({
                        value: language.id,
                        label: language.name,
                      }))}
                      value={values.languages}
                      onChange={(next) => form.setFieldValue("languages", next)}
                    />
                  </Field>
                  {choices?.tmdb !== false ? (
                    <KeywordField
                      value={values.keywords}
                      onChange={(next) => form.setFieldValue("keywords", next)}
                    />
                  ) : (
                    <FieldDescription>
                      {tr("connections.rules.noTmdb")}
                    </FieldDescription>
                  )}
                </FieldGroup>
              </FormSection>
            </FormColumn>

            <FormColumn>
              <FormSection title={tr("connections.rules.settings")}>
                <FieldGroup>
                  {fields.map((field) => (
                    <DescribedInput
                      key={field.key}
                      field={field}
                      value={values.settings[field.key]}
                      unset={tr("connections.rules.keep")}
                      onChange={(next) =>
                        form.setFieldValue("settings", (current) => ({
                          ...current,
                          [field.key]: next,
                        }))
                      }
                      footer={
                        field === folderField && folder ? (
                          <LandsIn
                            kind={kind}
                            folder={folder}
                            libraries={libraries.data}
                            picked={
                              values.folderLibrary ??
                              connection.folderLibraries[folder]
                            }
                            onPick={(library) =>
                              form.setFieldValue("folderLibrary", library)
                            }
                          />
                        ) : undefined
                      }
                    />
                  ))}
                </FieldGroup>
              </FormSection>
            </FormColumn>
          </FormColumns>
        </FormDialogBody>

        <FormDialogFooter>
          <form.SubmitButton
            disabled={conditions === 0 || Object.keys(settings).length === 0}
            pending={save.isPending}
          >
            {rule
              ? tr("connections.rules.dialog.save")
              : tr("connections.rules.dialog.create")}
          </form.SubmitButton>
        </FormDialogFooter>
      </FormDialogForm>
    </form.AppForm>
  )
}

/**
 * TMDB's keywords, found by name as it's typed. The server does the
 * finding, so the list shows what it sent as it is.
 */
function KeywordField({
  value,
  onChange,
}: {
  value: FulfilmentKeyword[]
  onChange: (value: FulfilmentKeyword[]) => void
}) {
  const id = useId()
  const anchor = useComboboxAnchor()
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  // Asks once typing pauses, not for every letter.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])
  const found = useQuery({
    ...orpc.admin.fulfilment.keywords.queryOptions({
      input: { query: search },
    }),
    enabled: search.length > 1,
    retry: false,
  })
  const asked = search.length > 1 && query.trim() === search
  return (
    <Field>
      <FieldLabel htmlFor={id}>{tr("connections.rules.keywords")}</FieldLabel>
      <Combobox
        multiple
        items={found.data ?? []}
        filter={null}
        value={value}
        itemToStringLabel={(keyword: FulfilmentKeyword) => keyword.name}
        isItemEqualToValue={(item, other) => item.id === other.id}
        onValueChange={onChange}
        inputValue={query}
        onInputValueChange={setQuery}
      >
        <ComboboxChips ref={anchor}>
          {value.map((keyword) => (
            <ComboboxChip key={keyword.id} label={keyword.name} />
          ))}
          <ComboboxChipsInput
            id={id}
            placeholder={
              value.length ? undefined : tr("connections.rules.keywords.find")
            }
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>
            {!asked
              ? tr("connections.rules.keywords.type")
              : found.isFetching
                ? tr("connections.rules.keywords.searching")
                : found.isError
                  ? errorMessage(found.error)
                  : tr("connections.field.findEmpty")}
          </ComboboxEmpty>
          <ComboboxList>
            {(keyword: FulfilmentKeyword) => (
              <ComboboxItem key={keyword.id} value={keyword}>
                <span className="min-w-0 flex-1 truncate">{keyword.name}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  )
}
