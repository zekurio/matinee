import {
  type DescribedField,
  type FieldSection,
  type FulfilmentConnection,
  FulfilmentConnectionInput,
  type FulfilmentSourceDescription,
  type FulfilmentValues,
  type TitleKind,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { CircleCheck, OctagonX, PlugZap, Trash2, Undo2 } from "lucide"
import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js"

import { tr, translateKnown } from "@/i18n"
import { trRich } from "@/i18n/solid"
import { Button } from "@/kit/button"
import { Dialog } from "@/kit/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/kit/field"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/kit/select"
import { Spinner } from "@/kit/spinner"
import { Switch } from "@/kit/switch"
import { toast } from "@/kit/toast"
import { SubmitButton } from "@/lib/form-fields"
import { client, errorMessage, orpc } from "@/lib/rpc"

import {
  DescribedInput,
  type FormValue,
  type FormValues,
  formValues,
  LandsIn,
  missingField,
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
import { fetching } from "./query-state"
import { createDraftForm } from "./settings-draft"
import { SettingNote } from "./settings-panel"

/** The query key of a connection's test, under which each connection has its own. */
export const CONNECTION_TEST = "fulfilment-test"

/** The environment variable a connection's key can come from. */
export function keyVariable(slug: string): string {
  return `MATINEE_CONNECTION_${slug || "…"}_API_KEY`
}

/**
 * The variable's name, set in mono, which wraps after its underscores
 * on a narrow screen rather than mid-word, and still copies whole.
 */
export function KeyVariable(props: { slug: string }) {
  const parts = () => keyVariable(props.slug).split("_")
  return (
    <code class="font-mono text-[0.95em]">
      <For each={parts()} keyed={false}>
        {(part, index) => (
          <>
            <Show when={index > 0}>
              _<wbr />
            </Show>
            {part()}
          </>
        )}
      </For>
    </code>
  )
}

const SLUG = /^[A-Z][A-Z0-9_]{0,63}$/

/** A slug from a name: "Films 4K" becomes FILMS_4K. */
function slugOf(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^[^A-Z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 64)
}

type ConnectionValues = {
  source: string
  name: string
  slug: string
  /** Until the slug is typed into, it follows the name. */
  slugEdited: boolean
  /** The source's own settings, as their inputs hold them. */
  settings: FormValues
  /** Options changed here, over the saved ones or the server's defaults. */
  options: FormValues
  defaultFor: TitleKind[]
  /** The library each folder no library holds lands in. */
  folderLibraries: Partial<Record<string, string>>
  /** A new key to save; empty keeps the current one. */
  apiKey: string
  /** Drop the saved key, so the environment's applies again. */
  dropKey: boolean
}

/** What a connection's options are asked for with: how to reach it. */
type Details = {
  source: string
  slug: string
  settings: FulfilmentValues
  apiKey?: string
}

/** The kinds a source takes that no other connection is the default for. */
function freeKinds(
  source: FulfilmentSourceDescription | undefined,
  connections: FulfilmentConnection[],
): TitleKind[] {
  return (source?.kinds ?? []).filter(
    (kind) =>
      !connections.some((connection) => connection.defaultFor.includes(kind)),
  )
}

function valuesOf(
  connection: FulfilmentConnection | undefined,
  sources: FulfilmentSourceDescription[],
  connections: FulfilmentConnection[],
): ConnectionValues {
  const sourceId = connection?.source ?? sources[0]?.id ?? ""
  const source = sources.find((entry) => entry.id === sourceId)
  return {
    source: sourceId,
    name: connection?.name ?? "",
    slug: connection?.slug ?? "",
    slugEdited: connection !== undefined,
    settings: formValues(
      source?.fields ?? [],
      connection?.settings ?? source?.values ?? {},
    ),
    options: {},
    defaultFor: connection
      ? [...connection.defaultFor]
      : freeKinds(source, connections),
    folderLibraries: { ...connection?.folderLibraries },
    apiKey: "",
    dropKey: false,
  }
}

/** Adds a connection, or edits one. Its fields are the ones its source describes. */
export function ConnectionDialog(props: {
  /** Unset for a new one. */
  connection?: FulfilmentConnection
  sources: FulfilmentSourceDescription[]
  /** Every saved connection, for which kinds already have a default. */
  connections: FulfilmentConnection[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // The form starts from the connection once, so another builds another.
  const editing = createMemo(() => ({ connection: props.connection }))
  return (
    <Dialog open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <FormDialogContent width="2xl">
        <Show when={editing()} keyed>
          {(entry) => (
            <ConnectionForm
              connection={entry.connection}
              sources={props.sources}
              connections={props.connections.filter(
                (other) => other.id !== entry.connection?.id,
              )}
              onDone={() => props.onOpenChange(false)}
            />
          )}
        </Show>
      </FormDialogContent>
    </Dialog>
  )
}

const SECTIONS = ["defaults", "anime", "behaviour"] satisfies FieldSection[]
type Section = (typeof SECTIONS)[number]

function ConnectionForm(props: {
  connection?: FulfilmentConnection
  sources: FulfilmentSourceDescription[]
  connections: FulfilmentConnection[]
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  // The callbacks run outside tracking, so the options read the connection.
  const save = useMutation(() => {
    const id = props.connection?.id
    const done = props.onDone
    return {
      mutationFn: (input: FulfilmentConnectionInput) =>
        id
          ? client.admin.fulfilment.update({ ...input, id })
          : client.admin.fulfilment.create(input),
      onSuccess: async () => {
        // A new key changes nothing the connection reads back, so its test
        // runs again by hand here.
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.admin.fulfilment.key(),
          }),
          queryClient.invalidateQueries({ queryKey: [CONNECTION_TEST] }),
        ])
        done()
      },
      onError: (error: Error) => toast.error(errorMessage(error)),
    }
  })

  const sourceOf = (id: string) =>
    props.sources.find((entry) => entry.id === id)
  const detailsOf = (value: ConnectionValues): Details => {
    const source = sourceOf(value.source)
    const typed = value.apiKey.trim()
    return {
      source: value.source,
      slug: value.slug,
      settings: sendValues(
        (source?.fields ?? []).filter(
          (field) => field.section === "connection",
        ),
        value.settings,
      ),
      ...(typed && { apiKey: typed }),
    }
  }
  const initial = createMemo(() =>
    valuesOf(props.connection, props.sources, props.connections),
  )
  // The choices are asked for with the details as they were last tested.
  // A saved connection, or a source with nothing to reach, starts tested.
  const [tested, setTested] = createSignal<Details | null>(() =>
    props.connection || sourceOf(initial().source)?.fields.length === 0
      ? detailsOf(initial())
      : null,
  )
  const choices = useQuery(() => ({
    ...orpc.admin.fulfilment.options.queryOptions({
      input: {
        ...(tested() ?? detailsOf(initial())),
        id: props.connection?.id,
      },
    }),
    enabled: tested() !== null,
    retry: false,
  }))
  const choiceData = () => (choices.isSuccess ? choices.data : undefined)

  const form = createDraftForm<ConnectionValues>({
    initial,
    onSubmit: (value) => {
      const source = sourceOf(value.source)
      if (!source) return
      const missing = missingField(source.fields, value.settings)
      if (missing) {
        toast.error(
          tr("connections.dialog.required", {
            field: translateKnown(missing.label),
          }),
        )
        return
      }
      const optionFields = choiceData()?.fields
      const shown = optionFields
        ? { ...formValues(optionFields, base()), ...value.options }
        : {}
      const missingOption = optionFields && missingField(optionFields, shown)
      if (missingOption) {
        toast.error(
          tr("connections.dialog.required", {
            field: translateKnown(missingOption.label),
          }),
        )
        return
      }
      const typed = value.apiKey.trim()
      const parsed = FulfilmentConnectionInput.safeParse({
        name: value.name,
        slug: value.slug,
        source: source.id,
        settings: sendValues(source.fields, value.settings),
        // Without the server's choices, the saved options stand.
        options: optionFields
          ? sendValues(optionFields, shown)
          : (props.connection?.options ?? {}),
        defaultFor: value.defaultFor.filter((kind) =>
          source.kinds.includes(kind),
        ),
        folderLibraries: Object.fromEntries(
          Object.entries(value.folderLibraries).flatMap(([folder, library]) =>
            library ? [[folder, library]] : [],
          ),
        ),
        ...(source.apiKey && {
          apiKey: typed ? typed : value.dropKey ? null : undefined,
        }),
      })
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        toast.error(
          issue?.path[0] === "slug"
            ? tr("connections.dialog.slugInvalid")
            : issue
              ? translateKnown(issue.message)
              : tr("connections.dialog.checkFields"),
        )
        return
      }
      void save.mutate(parsed.data)
    },
  })
  const values = () => form.values()
  const source = () => sourceOf(values().source)
  // What the options start from: the saved ones, for the same source,
  // else what the server offers a new connection.
  const base = () =>
    props.connection && props.connection.source === values().source
      ? props.connection.options
      : (choiceData()?.values ?? {})
  const optionFields = () => choiceData()?.fields ?? []
  const options = () => ({
    ...formValues(optionFields(), base()),
    ...values().options,
  })
  const sourceItems = () =>
    props.sources.map((entry) => ({
      value: entry.id,
      label: translateKnown(entry.name),
    }))
  const id = createUniqueId()
  const slugValid = () => SLUG.test(values().slug)
  const slugWrong = () => values().slug !== "" && !slugValid()
  const untested = () => {
    const was = tested()
    return (
      was === null ||
      JSON.stringify(detailsOf(values())) !== JSON.stringify(was)
    )
  }
  const connectionFields = () =>
    (source()?.fields ?? []).filter((field) => field.section === "connection")
  const fieldsIn = (section: FieldSection) => [
    ...(source()?.fields ?? []).filter((field) => field.section === section),
    ...optionFields().filter((field) => field.section === section),
  ]
  const isOption = (field: DescribedField) => optionFields().includes(field)
  const valueOf = (field: DescribedField) =>
    isOption(field) ? options()[field.key] : values().settings[field.key]
  const change = (field: DescribedField, next: FormValue) =>
    isOption(field)
      ? form.set("options", { ...values().options, [field.key]: next })
      : form.set("settings", { ...values().settings, [field.key]: next })
  const ready = () => !source()?.fields.length || choices.isSuccess
  // The defaults, and anime's beside them, are the columns after the
  // connection's. How a title is added goes under the defaults then, or
  // has the last column to itself.
  const sections = () =>
    SECTIONS.map((section) => ({ section, fields: fieldsIn(section) })).filter(
      (entry) => entry.fields.length > 0,
    )
  const withAnime = () => sections().some((entry) => entry.section === "anime")
  const inSecond = (section: Section) =>
    section === "defaults" || (withAnime() && section === "behaviour")
  const second = () => sections().filter((entry) => inSecond(entry.section))
  const third = () => sections().filter((entry) => !inSecond(entry.section))

  const input = (field: DescribedField) => {
    const folder = () => (field.folder ? textOf(valueOf(field)) : "")
    return (
      <DescribedInput
        field={field}
        value={valueOf(field)}
        unset={
          field.section === "anime"
            ? tr("connections.field.sameAsAbove")
            : undefined
        }
        onChange={(next) => change(field, next)}
        footer={
          <Show when={field.folder && folder() ? field.folder : undefined}>
            {(kind) => (
              <LandsIn
                kind={kind()}
                folder={folder()}
                libraries={libraries.isSuccess ? libraries.data : undefined}
                picked={values().folderLibraries[folder()]}
                onPick={(libraryId) =>
                  form.set("folderLibraries", {
                    ...values().folderLibraries,
                    [folder()]: libraryId,
                  })
                }
              />
            )}
          </Show>
        }
      />
    )
  }
  // Keyed by source and key, as a field of another source is another input.
  const inputs = (fields: DescribedField[]) => (
    <For each={fields} keyed={(field) => `${values().source}-${field.key}`}>
      {(field) => <>{input(field())}</>}
    </For>
  )
  const sectionOf = (entry: { section: Section; fields: DescribedField[] }) => (
    <FormSection title={tr(`connections.section.${entry.section}`)}>
      <FieldGroup>{inputs(entry.fields)}</FieldGroup>
    </FormSection>
  )

  return (
    <FormDialogForm onSubmit={() => void form.submit()}>
      <FormDialogHeader
        title={
          props.connection
            ? tr("connections.dialog.editTitle", {
                name: props.connection.name,
              })
            : tr("connections.dialog.addTitle")
        }
      />

      <FormDialogBody>
        <FormColumns count={3}>
          <FormColumn tall>
            <FormSection>
              <FieldGroup>
                <Field>
                  <FieldLabel for={`${id}-source`}>
                    {tr("connections.dialog.source")}
                  </FieldLabel>
                  <Select
                    items={sourceItems()}
                    value={values().source}
                    disabled={props.connection !== undefined}
                    onValueChange={(next) => {
                      if (!next) return
                      const picked = sourceOf(next)
                      form.set("source", next)
                      form.set(
                        "settings",
                        formValues(picked?.fields ?? [], picked?.values ?? {}),
                      )
                      form.set("options", {})
                      form.set(
                        "defaultFor",
                        freeKinds(picked, props.connections),
                      )
                      setTested(
                        picked?.fields.length === 0
                          ? { source: next, slug: values().slug, settings: {} }
                          : null,
                      )
                    }}
                  >
                    <SelectTrigger id={`${id}-source`} class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <For each={sourceItems()}>
                        {(item) => (
                          <SelectItem value={item.value}>
                            {item.label}
                          </SelectItem>
                        )}
                      </For>
                    </SelectContent>
                  </Select>
                </Field>

                <div class="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel for={`${id}-name`}>
                      {tr("connections.dialog.name")}
                    </FieldLabel>
                    <Input
                      id={`${id}-name`}
                      value={values().name}
                      maxlength={128}
                      autocomplete="off"
                      placeholder={tr("connections.dialog.namePlaceholder")}
                      onValueChange={(next) => {
                        form.set("name", next)
                        if (!values().slugEdited) form.set("slug", slugOf(next))
                      }}
                    />
                  </Field>
                  <Field invalid={slugWrong() ? true : undefined}>
                    <FieldLabel for={`${id}-slug`}>
                      {tr("connections.dialog.slug")}
                    </FieldLabel>
                    <Input
                      id={`${id}-slug`}
                      value={values().slug}
                      maxlength={64}
                      autocomplete="off"
                      spellcheck={false}
                      aria-invalid={slugWrong() ? "true" : undefined}
                      aria-describedby={`${id}-slug-hint`}
                      class="text-13px font-mono uppercase"
                      onValueChange={(next) => {
                        form.set("slug", next.toUpperCase())
                        form.set("slugEdited", true)
                      }}
                    />
                  </Field>
                  <FieldDescription
                    id={`${id}-slug-hint`}
                    class={cn(
                      "-mt-2 sm:col-span-2",
                      slugWrong() && "text-destructive",
                    )}
                  >
                    {slugWrong()
                      ? tr("connections.dialog.slugInvalid")
                      : source()?.apiKey === false
                        ? tr("connections.dialog.slugHintNoKey")
                        : trRich("connections.dialog.slugHint", {
                            variable: <KeyVariable slug={values().slug} />,
                          })}
                  </FieldDescription>
                </div>

                {inputs(connectionFields())}

                <Show when={source()?.apiKey}>
                  <KeyField
                    connection={props.connection}
                    slug={values().slug}
                    typed={values().apiKey}
                    dropKey={values().dropKey}
                    onType={(next) => {
                      form.set("apiKey", next)
                      if (next) form.set("dropKey", false)
                    }}
                    onDropKey={(drop) => form.set("dropKey", drop)}
                  />
                </Show>

                <Show when={connectionFields().length > 0}>
                  <TestRow
                    pending={fetching(choices)}
                    error={choices.isError ? errorMessage(choices.error) : null}
                    connected={choices.isSuccess && !untested()}
                    untested={untested()}
                    disabled={!values().slug}
                    onTest={() => {
                      if (untested()) setTested(detailsOf(values()))
                      else void choices.refetch()
                    }}
                  />
                </Show>

                <For each={source()?.kinds ?? []}>
                  {(kind) => (
                    <Field orientation="horizontal" class="justify-between">
                      <FieldLabel for={`${id}-default-${kind}`}>
                        {tr(`connections.dialog.default.${kind}`)}
                      </FieldLabel>
                      <Switch
                        id={`${id}-default-${kind}`}
                        checked={values().defaultFor.includes(kind)}
                        onCheckedChange={(checked) => {
                          const others = values().defaultFor.filter(
                            (each) => each !== kind,
                          )
                          form.set(
                            "defaultFor",
                            checked ? [...others, kind] : others,
                          )
                        }}
                      />
                    </Field>
                  )}
                </For>
              </FieldGroup>
            </FormSection>
          </FormColumn>

          <FormColumn>
            <For each={second()} keyed={(entry) => entry.section}>
              {(entry) => <>{sectionOf(entry())}</>}
            </For>
            <Show when={!ready()}>
              <SettingNote>{tr("connections.dialog.testFirst")}</SettingNote>
            </Show>
          </FormColumn>
          <Show when={third().length > 0}>
            <FormColumn>
              <For each={third()} keyed={(entry) => entry.section}>
                {(entry) => <>{sectionOf(entry())}</>}
              </For>
            </FormColumn>
          </Show>
        </FormColumns>
      </FormDialogBody>

      <FormDialogFooter>
        <SubmitButton
          form={form}
          disabled={
            !values().name.trim() ||
            !slugValid() ||
            (!ready() && !props.connection)
          }
          pending={save.isPending}
        >
          {props.connection
            ? tr("connections.dialog.save")
            : tr("connections.dialog.create")}
        </SubmitButton>
      </FormDialogFooter>
    </FormDialogForm>
  )
}

/**
 * Asks the server behind the connection for its choices, with the
 * details as they stand, and says how that went.
 */
function TestRow(props: {
  pending: boolean
  error: string | null
  connected: boolean
  untested: boolean
  disabled: boolean
  onTest: () => void
}) {
  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={props.disabled || props.pending}
          onClick={() => props.onTest()}
        >
          <Show when={props.pending} fallback={<Icon icon={PlugZap} />}>
            <Spinner />
          </Show>
          {tr("connections.dialog.test")}
        </Button>
        <Show when={props.connected && !props.pending}>
          <span
            role="status"
            class="text-muted-foreground text-13px flex items-center gap-1.5"
          >
            <Icon icon={CircleCheck} class="text-success size-3.5" />
            {tr("connections.connected")}
          </span>
        </Show>
      </div>
      <Show when={!props.pending && !props.untested && props.error}>
        {(error) => (
          <p role="alert" class="text-13px flex items-start gap-1.5 leading-5">
            <Icon
              icon={OctagonX}
              class="text-danger mt-0.5 size-3.5 shrink-0"
            />
            <span>{error()}</span>
          </p>
        )}
      </Show>
    </div>
  )
}

/**
 * The connection's key, as the single sign-on secret works: the API says
 * only whether one is saved or comes from the environment. Typing saves
 * a new one; the button drops the saved one.
 */
function KeyField(props: {
  connection: FulfilmentConnection | undefined
  slug: string
  typed: string
  dropKey: boolean
  onType: (value: string) => void
  onDropKey: (drop: boolean) => void
}) {
  const id = createUniqueId()
  const variable = () => keyVariable(props.slug)
  const source = () => props.connection?.apiKey.source ?? null
  // A renamed slug reads another variable, which the server checks on save.
  const environment = () =>
    (props.connection?.apiKey.environment ?? false) &&
    props.slug === props.connection?.slug
  const savedHere = () => source() === "saved" && !props.dropKey
  const fromEnvironment = () =>
    source() === "environment" || (props.dropKey && environment())
  const placeholder = () =>
    savedHere()
      ? tr("connections.dialog.keySaved")
      : fromEnvironment()
        ? tr("connections.dialog.keyFromEnvironment", { variable: variable() })
        : tr("connections.dialog.keyNone")
  const removable = () => source() === "saved" && !props.typed
  const removeLabel = () =>
    props.dropKey
      ? tr("connections.dialog.keyKeep")
      : environment()
        ? tr("connections.dialog.keyUseEnvironment")
        : tr("connections.dialog.keyRemove")

  return (
    <Field>
      <FieldLabel for={id}>{tr("connections.dialog.key")}</FieldLabel>
      <div class="relative w-full">
        <Input
          id={id}
          type="password"
          autocomplete="new-password"
          spellcheck={false}
          value={props.typed}
          placeholder={placeholder()}
          class={cn(removable() && "pr-11")}
          onValueChange={(next) => props.onType(next)}
        />
        <Show when={removable()}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={removeLabel()}
            title={removeLabel()}
            class={cn(
              "absolute top-1/2 right-1 -translate-y-1/2",
              !props.dropKey && "text-destructive hover:text-destructive",
            )}
            onClick={() => props.onDropKey(!props.dropKey)}
          >
            <Icon icon={props.dropKey ? Undo2 : Trash2} />
          </Button>
        </Show>
      </div>
      <Show when={props.dropKey}>
        <FieldDescription>
          {environment()
            ? trRich("connections.dialog.keyEnvironmentApplies", {
                variable: <KeyVariable slug={props.slug} />,
              })
            : tr("connections.dialog.keyRemoved")}
        </FieldDescription>
      </Show>
    </Field>
  )
}
