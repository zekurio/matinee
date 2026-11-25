import type {
  DescribedField,
  FulfilmentConnection,
  FulfilmentKeyword,
  FulfilmentRule,
  FulfilmentRuleChoices,
  TitleKind,
} from "@matinee/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import {
  createEffect,
  createSignal,
  createUniqueId,
  For,
  Show,
  untrack,
} from "solid-js"

import { MultiSelect } from "@/components/multi-select"
import { tr } from "@/i18n"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/kit/combobox"
import { Dialog } from "@/kit/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/kit/field"
import { toast } from "@/kit/toast"
import { createForm } from "@/lib/form"
import { SubmitButton } from "@/lib/form-fields"
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
    users: [...(rule?.users ?? [])],
    genres: (rule?.genres ?? []).map(String),
    languages: [...(rule?.languages ?? [])],
    keywords: (rule?.keywords ?? []).map((keyword) => ({ ...keyword })),
    settings: formValues(fields, rule?.settings ?? {}),
    folderLibrary: null,
  }
}

/** Adds an override rule to a connection, or edits one. */
export function RuleDialog(props: {
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
  // A form of its own for each rule, as its values start from the rule.
  const editing = () => ({ rule: props.rule })
  return (
    <Dialog open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <FormDialogContent width="lg">
        <Show when={editing()} keyed>
          {(entry) => (
            <RuleForm
              connection={props.connection}
              kind={props.kind}
              fields={props.fields}
              choices={props.choices}
              rule={entry.rule}
              onDone={() => props.onOpenChange(false)}
            />
          )}
        </Show>
      </FormDialogContent>
    </Dialog>
  )
}

function RuleForm(props: {
  connection: FulfilmentConnection
  kind: TitleKind
  fields: DescribedField[]
  choices: FulfilmentRuleChoices | undefined
  rule?: FulfilmentRule
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const id = createUniqueId()
  const save = useMutation(() => ({
    mutationFn: (value: RuleValues) => {
      const settings = sendValues(props.fields, value.settings)
      const input = {
        connectionId: props.connection.id,
        users: value.users,
        genres: value.genres.map(Number),
        languages: value.languages,
        keywords: value.keywords,
        settings,
        folderLibraryId: value.folderLibrary,
      }
      return props.rule
        ? client.admin.fulfilment.updateRule({ ...input, id: props.rule.id })
        : client.admin.fulfilment.createRule(input)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.admin.fulfilment.key(),
      })
      props.onDone()
    },
    onError: (error: Error) => toast.error(errorMessage(error)),
  }))
  // Seeded once from the rule it opened with; another rule opens another form.
  const form = createForm<RuleValues>({
    defaultValues: untrack(() => valuesOf(props.rule, props.fields)),
    onSubmit: (value) => void save.mutate(value),
  })
  const values = () => form.values()
  const conditions = () =>
    values().users.length +
    values().genres.length +
    values().languages.length +
    values().keywords.length
  const settings = () => sendValues(props.fields, values().settings)
  const folderField = () => props.fields.find((field) => field.folder)
  const folder = () => {
    const field = folderField()
    return textOf(field ? values().settings[field.key] : undefined)
  }
  // A saved value the choices don't hold: still loading, or gone since.
  const unknown = () =>
    props.choices
      ? tr("connections.rules.unknownChoice")
      : tr("connections.rules.loadingChoice")
  const tmdb = () => props.choices?.tmdb !== false

  return (
    <FormDialogForm onSubmit={() => void form.submit()}>
      <FormDialogHeader
        title={
          props.rule
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
                  <FieldLabel for={`${id}-users`}>
                    {tr("connections.rules.users")}
                  </FieldLabel>
                  <MultiSelect
                    id={`${id}-users`}
                    placeholder={tr("connections.rules.users.find")}
                    empty={tr("connections.field.findEmpty")}
                    unknown={unknown}
                    choices={(props.choices?.users ?? []).map((user) => ({
                      value: user.id,
                      label: user.name,
                    }))}
                    value={values().users}
                    onChange={(next) => form.set("users", next)}
                  />
                </Field>
                <Show when={tmdb()}>
                  <Field>
                    <FieldLabel for={`${id}-genres`}>
                      {tr("connections.rules.genres")}
                    </FieldLabel>
                    <MultiSelect
                      id={`${id}-genres`}
                      placeholder={tr("connections.rules.genres.find")}
                      empty={tr("connections.field.findEmpty")}
                      unknown={unknown}
                      choices={(props.choices?.genres ?? []).map((genre) => ({
                        value: String(genre.id),
                        label: genre.name,
                      }))}
                      value={values().genres}
                      onChange={(next) => form.set("genres", next)}
                    />
                  </Field>
                </Show>
                <Field>
                  <FieldLabel for={`${id}-languages`}>
                    {tr("connections.rules.languages")}
                  </FieldLabel>
                  <MultiSelect
                    id={`${id}-languages`}
                    placeholder={tr("connections.rules.languages.find")}
                    empty={tr("connections.field.findEmpty")}
                    unknown={unknown}
                    choices={(props.choices?.languages ?? []).map(
                      (language) => ({
                        value: language.id,
                        label: language.name,
                      }),
                    )}
                    value={values().languages}
                    onChange={(next) => form.set("languages", next)}
                  />
                </Field>
                <Show
                  when={tmdb()}
                  fallback={
                    <FieldDescription>
                      {tr("connections.rules.noTmdb")}
                    </FieldDescription>
                  }
                >
                  <KeywordField
                    value={values().keywords}
                    onChange={(next) => form.set("keywords", next)}
                  />
                </Show>
              </FieldGroup>
            </FormSection>
          </FormColumn>

          <FormColumn>
            <FormSection title={tr("connections.rules.settings")}>
              <FieldGroup>
                <For each={props.fields} keyed={(field) => field.key}>
                  {(field) => (
                    <DescribedInput
                      field={field()}
                      value={values().settings[field().key]}
                      unset={tr("connections.rules.keep")}
                      onChange={(next) =>
                        form.set("settings", {
                          ...values().settings,
                          [field().key]: next,
                        })
                      }
                      footer={
                        <Show when={field() === folderField() && folder()}>
                          {(shown) => (
                            <LandsIn
                              kind={props.kind}
                              folder={shown()}
                              libraries={
                                libraries.isSuccess ? libraries.data : undefined
                              }
                              picked={
                                values().folderLibrary ??
                                props.connection.folderLibraries[shown()]
                              }
                              onPick={(library) =>
                                form.set("folderLibrary", library)
                              }
                            />
                          )}
                        </Show>
                      }
                    />
                  )}
                </For>
              </FieldGroup>
            </FormSection>
          </FormColumn>
        </FormColumns>
      </FormDialogBody>

      <FormDialogFooter>
        <SubmitButton
          form={form}
          disabled={conditions() === 0 || Object.keys(settings()).length === 0}
          pending={save.isPending}
        >
          {props.rule
            ? tr("connections.rules.dialog.save")
            : tr("connections.rules.dialog.create")}
        </SubmitButton>
      </FormDialogFooter>
    </FormDialogForm>
  )
}

/**
 * TMDB's keywords, found by name as it's typed. The server does the
 * finding, so the list shows what it sent as it is.
 */
function KeywordField(props: {
  value: FulfilmentKeyword[]
  onChange: (value: FulfilmentKeyword[]) => void
}) {
  const id = createUniqueId()
  const [query, setQuery] = createSignal("")
  const [search, setSearch] = createSignal("")
  // Asks once typing pauses, not for every letter.
  createEffect(
    () => query().trim(),
    (text) => {
      const timer = setTimeout(() => setSearch(text), 250)
      return () => clearTimeout(timer)
    },
  )
  const found = useQuery(() => ({
    ...orpc.admin.fulfilment.keywords.queryOptions({
      input: { query: search() },
    }),
    enabled: search().length > 1,
    retry: false,
  }))
  const results = () => (found.isSuccess ? found.data : [])
  const asked = () => search().length > 1 && query().trim() === search()
  // The combobox holds ids as text; these give them back their names.
  const known = () =>
    new Map(
      [...props.value, ...results()].map((keyword) => [
        String(keyword.id),
        keyword,
      ]),
    )
  return (
    <Field>
      <FieldLabel for={id}>{tr("connections.rules.keywords")}</FieldLabel>
      <Combobox
        multiple
        filter={false}
        value={props.value.map((keyword) => String(keyword.id))}
        itemToLabel={(value) => known().get(value)?.name ?? value}
        onValueChange={(next) => {
          const byId = known()
          props.onChange(
            next.flatMap((value) => {
              const keyword = byId.get(value)
              return keyword ? [{ ...keyword }] : []
            }),
          )
        }}
        query={query()}
        onQueryChange={setQuery}
      >
        <ComboboxChips>
          <For each={props.value} keyed={(keyword) => keyword.id}>
            {(keyword) => (
              <ComboboxChip
                value={String(keyword().id)}
                label={keyword().name}
              />
            )}
          </For>
          <ComboboxChipsInput
            id={id}
            placeholder={
              props.value.length
                ? undefined
                : tr("connections.rules.keywords.find")
            }
            autocomplete="off"
            spellcheck={false}
            maxlength={100}
          />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxEmpty>
            {!asked()
              ? tr("connections.rules.keywords.type")
              : found.isFetching
                ? tr("connections.rules.keywords.searching")
                : found.isError
                  ? errorMessage(found.error)
                  : tr("connections.field.findEmpty")}
          </ComboboxEmpty>
          <ComboboxList>
            <For each={results()} keyed={(keyword) => keyword.id}>
              {(keyword) => (
                <ComboboxItem
                  value={String(keyword().id)}
                  label={keyword().name}
                >
                  <span class="min-w-0 flex-1 truncate">{keyword().name}</span>
                </ComboboxItem>
              )}
            </For>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  )
}
