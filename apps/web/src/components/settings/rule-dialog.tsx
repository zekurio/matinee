import type {
  DescribedField,
  FulfilmentConnection,
  FulfilmentKeyword,
  FulfilmentRule,
  FulfilmentRuleChoices,
  TitleKind,
} from "@matinee/contracts"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@matinee/ui/components/autocomplete"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import { toast } from "@matinee/ui/components/sonner"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { XIcon } from "lucide-react"
import { type ReactNode, useEffect, useId, useState } from "react"

import { ToggleChips } from "@/components/filters/filter-panel"
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-xl">
        {open && (
          <RuleForm
            connection={connection}
            kind={kind}
            fields={fields}
            choices={choices}
            rule={rule}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
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

  return (
    <form.AppForm>
      <form
        className="flex flex-col gap-7"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-lg leading-7 font-semibold">
            {rule
              ? tr("connections.rules.dialog.editTitle")
              : tr("connections.rules.dialog.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <Section title={tr("connections.rules.conditions")}>
          <FieldGroup>
            <Field>
              <FieldLabel id={`${id}-users`}>
                {tr("connections.rules.users")}
              </FieldLabel>
              <ToggleChips
                labelId={`${id}-users`}
                limit={12}
                find={{
                  placeholder: tr("connections.rules.users.find"),
                  empty: tr("connections.field.findEmpty"),
                }}
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
                <FieldLabel id={`${id}-genres`}>
                  {tr("connections.rules.genres")}
                </FieldLabel>
                <ToggleChips
                  labelId={`${id}-genres`}
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
              <FieldLabel id={`${id}-languages`}>
                {tr("connections.rules.languages")}
              </FieldLabel>
              <ToggleChips
                labelId={`${id}-languages`}
                limit={12}
                find={{
                  placeholder: tr("connections.rules.languages.find"),
                  empty: tr("connections.field.findEmpty"),
                }}
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
        </Section>

        <Section title={tr("connections.rules.settings")}>
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
        </Section>

        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <form.SubmitButton
            disabled={conditions === 0 || Object.keys(settings).length === 0}
            pending={save.isPending}
          >
            {rule
              ? tr("connections.rules.dialog.save")
              : tr("connections.rules.dialog.create")}
          </form.SubmitButton>
        </DialogFooter>
      </form>
    </form.AppForm>
  )
}

/**
 * TMDB's keywords, found by name as it's typed, each chosen one a chip
 * that takes it off again.
 */
function KeywordField({
  value,
  onChange,
}: {
  value: FulfilmentKeyword[]
  onChange: (value: FulfilmentKeyword[]) => void
}) {
  const id = useId()
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
  const items = (found.data ?? []).filter(
    (keyword) => !value.some((chosen) => chosen.id === keyword.id),
  )
  return (
    <Field>
      <FieldLabel htmlFor={id}>{tr("connections.rules.keywords")}</FieldLabel>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((keyword) => (
            <span
              key={keyword.id}
              className="bg-secondary text-secondary-foreground inline-flex h-7 items-center gap-1 rounded-full pr-1 pl-2.5 text-[13px]"
            >
              {keyword.name}
              <button
                type="button"
                aria-label={tr("connections.rules.keywords.remove", {
                  name: keyword.name,
                })}
                className="hover:bg-foreground/10 grid size-5 place-items-center rounded-full"
                onClick={() =>
                  onChange(value.filter((chosen) => chosen.id !== keyword.id))
                }
              >
                <XIcon aria-hidden className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Autocomplete
        items={items}
        value={query}
        itemToStringValue={(item: FulfilmentKeyword) => item.name}
        onValueChange={(next, details) => {
          // Picking one adds it; the field empties for the next.
          if (details.reason === "item-press") return
          setQuery(next)
        }}
      >
        <AutocompleteInput
          id={id}
          placeholder={tr("connections.rules.keywords.find")}
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          render={<Input />}
        />
        {items.length > 0 && (
          <AutocompleteContent sideOffset={4} className="data-empty:hidden">
            <AutocompleteList>
              {(item: FulfilmentKeyword) => (
                <AutocompleteItem
                  key={item.id}
                  value={item}
                  onClick={() => {
                    onChange([...value, item])
                    setQuery("")
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                </AutocompleteItem>
              )}
            </AutocompleteList>
          </AutocompleteContent>
        )}
      </Autocomplete>
      {found.isError && (
        <FieldDescription>{errorMessage(found.error)}</FieldDescription>
      )}
    </Field>
  )
}
