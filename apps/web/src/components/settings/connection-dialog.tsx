import {
  type DescribedField,
  type FieldSection,
  type FulfilmentConnection,
  FulfilmentConnectionInput,
  type FulfilmentSourceDescription,
  type FulfilmentValues,
  type TitleKind,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { Switch } from "@matinee/ui/components/switch"
import { cn } from "@matinee/ui/lib/utils"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CircleCheckIcon,
  OctagonXIcon,
  PlugZapIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react"
import { Fragment, type ReactNode, useId, useState } from "react"

import { tr, translateKnown } from "@/i18n"
import { trRich } from "@/i18n/react"
import { useAppForm } from "@/lib/form"
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
export function KeyVariable({ slug }: { slug: string }) {
  const parts = keyVariable(slug).split("_")
  return (
    <code className="font-mono text-[0.95em]">
      {parts.map((part, index) => (
        // The parts repeat ("…"), so their place is their key.
        <Fragment key={index}>
          {index > 0 && (
            <>
              _<wbr />
            </>
          )}
          {part}
        </Fragment>
      ))}
    </code>
  )
}

const SLUG = /^[A-Z][A-Z0-9_]{0,63}$/

/** A slug from a name: "Films 4K" becomes FILMS_4K. */
function slugOf(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
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
    defaultFor: connection?.defaultFor ?? freeKinds(source, connections),
    folderLibraries: connection?.folderLibraries ?? {},
    apiKey: "",
    dropKey: false,
  }
}

/** Adds a connection, or edits one. Its fields are the ones its source describes. */
export function ConnectionDialog({
  connection,
  sources,
  connections,
  open,
  onOpenChange,
}: {
  /** Unset for a new one. */
  connection?: FulfilmentConnection
  sources: FulfilmentSourceDescription[]
  /** Every saved connection, for which kinds already have a default. */
  connections: FulfilmentConnection[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-xl">
        {open && (
          <ConnectionForm
            connection={connection}
            sources={sources}
            connections={connections.filter(
              (entry) => entry.id !== connection?.id,
            )}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A titled part of the connection form. */
function FormSection({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      {children}
    </section>
  )
}

const SECTIONS = ["defaults", "anime", "behaviour"] satisfies FieldSection[]

function ConnectionForm({
  connection,
  sources,
  connections,
  onDone,
}: {
  connection?: FulfilmentConnection
  sources: FulfilmentSourceDescription[]
  connections: FulfilmentConnection[]
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const save = useMutation({
    mutationFn: (input: FulfilmentConnectionInput) =>
      connection
        ? client.admin.fulfilment.update({ ...input, id: connection.id })
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
      onDone()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const initial = valuesOf(connection, sources, connections)
  const detailsOf = (value: ConnectionValues): Details => {
    const source = sources.find((entry) => entry.id === value.source)
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
  const sourceOf = (id: string) => sources.find((entry) => entry.id === id)
  // The choices are asked for with the details as they were last tested.
  // A saved connection, or a source with nothing to reach, starts tested.
  const [tested, setTested] = useState<Details | null>(() =>
    connection || sourceOf(initial.source)?.fields.length === 0
      ? detailsOf(initial)
      : null,
  )
  const choices = useQuery({
    ...orpc.admin.fulfilment.options.queryOptions({
      input: { ...(tested ?? detailsOf(initial)), id: connection?.id },
    }),
    enabled: tested !== null,
    retry: false,
  })

  const form = useAppForm({
    defaultValues: initial,
    onSubmit: ({ value }) => {
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
      const optionFields = choices.data?.fields
      const shown = optionFields
        ? { ...formValues(optionFields, base), ...value.options }
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
          : (connection?.options ?? {}),
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
      save.mutate(parsed.data)
    },
  })
  const values = useSelector(form.store, (state) => state.values)
  const source = sourceOf(values.source)
  // What the options start from: the saved ones, for the same source,
  // else what the server offers a new connection.
  const base =
    connection && connection.source === values.source
      ? connection.options
      : (choices.data?.values ?? {})
  const optionFields = choices.data?.fields ?? []
  const options = { ...formValues(optionFields, base), ...values.options }
  const sourceItems = sources.map((entry) => ({
    value: entry.id,
    label: translateKnown(entry.name),
  }))
  const id = useId()
  const slugValid = SLUG.test(values.slug)
  const current = detailsOf(values)
  const untested =
    tested === null || JSON.stringify(current) !== JSON.stringify(tested)
  const connectionFields = (source?.fields ?? []).filter(
    (field) => field.section === "connection",
  )
  const fieldsIn = (section: FieldSection) => [
    ...(source?.fields ?? []).filter((field) => field.section === section),
    ...optionFields.filter((field) => field.section === section),
  ]
  const valueOf = (field: DescribedField) =>
    optionFields.includes(field)
      ? options[field.key]
      : values.settings[field.key]
  const change = (field: DescribedField, next: FormValue) =>
    optionFields.includes(field)
      ? form.setFieldValue("options", (edits) => ({
          ...edits,
          [field.key]: next,
        }))
      : form.setFieldValue("settings", (settings) => ({
          ...settings,
          [field.key]: next,
        }))
  const ready = !source?.fields.length || choices.isSuccess

  const input = (field: DescribedField) => {
    const value = valueOf(field)
    const folder = field.folder ? textOf(value) : ""
    return (
      <DescribedInput
        key={`${values.source}-${field.key}`}
        field={field}
        value={value}
        unset={
          field.section === "anime"
            ? tr("connections.field.sameAsAbove")
            : undefined
        }
        onChange={(next) => change(field, next)}
        footer={
          field.folder && folder ? (
            <LandsIn
              kind={field.folder}
              folder={folder}
              libraries={libraries.data}
              picked={values.folderLibraries[folder]}
              onPick={(libraryId) =>
                form.setFieldValue("folderLibraries", (picks) => ({
                  ...picks,
                  [folder]: libraryId,
                }))
              }
            />
          ) : undefined
        }
      />
    )
  }

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
            {connection
              ? tr("connections.dialog.editTitle", { name: connection.name })
              : tr("connections.dialog.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <FormSection>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-source`}>
                {tr("connections.dialog.source")}
              </FieldLabel>
              <Select
                items={sourceItems}
                value={values.source}
                disabled={connection !== undefined}
                onValueChange={(next) => {
                  if (!next) return
                  const picked = sourceOf(next)
                  form.setFieldValue("source", next)
                  form.setFieldValue(
                    "settings",
                    formValues(picked?.fields ?? [], picked?.values ?? {}),
                  )
                  form.setFieldValue("options", {})
                  form.setFieldValue(
                    "defaultFor",
                    freeKinds(picked, connections),
                  )
                  setTested(
                    picked?.fields.length === 0
                      ? { source: next, slug: values.slug, settings: {} }
                      : null,
                  )
                }}
              >
                <SelectTrigger id={`${id}-source`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sourceItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="name">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={`${id}-name`}>
                      {tr("connections.dialog.name")}
                    </FieldLabel>
                    <Input
                      id={`${id}-name`}
                      value={field.state.value}
                      maxLength={128}
                      autoComplete="off"
                      placeholder={tr("connections.dialog.namePlaceholder")}
                      onChange={(event) => {
                        field.handleChange(event.target.value)
                        if (!form.getFieldValue("slugEdited")) {
                          form.setFieldValue("slug", slugOf(event.target.value))
                        }
                      }}
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field name="slug">
                {(field) => (
                  <Field
                    data-invalid={values.slug && !slugValid ? true : undefined}
                  >
                    <FieldLabel htmlFor={`${id}-slug`}>
                      {tr("connections.dialog.slug")}
                    </FieldLabel>
                    <Input
                      id={`${id}-slug`}
                      value={field.state.value}
                      maxLength={64}
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={
                        values.slug && !slugValid ? true : undefined
                      }
                      aria-describedby={`${id}-slug-hint`}
                      className="font-mono text-[13px] uppercase"
                      onChange={(event) => {
                        field.handleChange(event.target.value.toUpperCase())
                        form.setFieldValue("slugEdited", true)
                      }}
                    />
                  </Field>
                )}
              </form.Field>
              <FieldDescription
                id={`${id}-slug-hint`}
                className={cn(
                  "-mt-2 sm:col-span-2",
                  values.slug && !slugValid && "text-destructive",
                )}
              >
                {values.slug && !slugValid
                  ? tr("connections.dialog.slugInvalid")
                  : source?.apiKey === false
                    ? tr("connections.dialog.slugHintNoKey")
                    : trRich("connections.dialog.slugHint", {
                        variable: <KeyVariable slug={values.slug} />,
                      })}
              </FieldDescription>
            </div>

            {connectionFields.map(input)}

            {source?.apiKey && (
              <KeyField
                connection={connection}
                slug={values.slug}
                typed={values.apiKey}
                dropKey={values.dropKey}
                onType={(next) => {
                  form.setFieldValue("apiKey", next)
                  if (next) form.setFieldValue("dropKey", false)
                }}
                onDropKey={(drop) => form.setFieldValue("dropKey", drop)}
              />
            )}

            {connectionFields.length > 0 && (
              <TestRow
                pending={choices.isFetching}
                error={choices.isError ? errorMessage(choices.error) : null}
                connected={choices.isSuccess && !untested}
                untested={untested}
                disabled={!values.slug}
                onTest={() =>
                  untested ? setTested(current) : void choices.refetch()
                }
              />
            )}

            {(source?.kinds ?? []).map((kind) => (
              <Field
                key={kind}
                orientation="horizontal"
                className="justify-between"
              >
                <FieldLabel htmlFor={`${id}-default-${kind}`}>
                  {tr(`connections.dialog.default.${kind}`)}
                </FieldLabel>
                <Switch
                  id={`${id}-default-${kind}`}
                  checked={values.defaultFor.includes(kind)}
                  onCheckedChange={(checked) =>
                    form.setFieldValue("defaultFor", (kinds) =>
                      checked
                        ? [...kinds.filter((each) => each !== kind), kind]
                        : kinds.filter((each) => each !== kind),
                    )
                  }
                />
              </Field>
            ))}
          </FieldGroup>
        </FormSection>

        {SECTIONS.map((section) => {
          const fields = fieldsIn(section)
          if (!fields.length) return null
          return (
            <FormSection
              key={section}
              title={tr(`connections.section.${section}`)}
            >
              <FieldGroup>{fields.map(input)}</FieldGroup>
            </FormSection>
          )
        })}

        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <form.SubmitButton
            disabled={
              !values.name.trim() || !slugValid || (!ready && !connection)
            }
            pending={save.isPending}
          >
            {connection
              ? tr("connections.dialog.save")
              : tr("connections.dialog.create")}
          </form.SubmitButton>
        </DialogFooter>
      </form>
    </form.AppForm>
  )
}

/**
 * Asks the server behind the connection for its choices, with the
 * details as they stand, and says how that went.
 */
function TestRow({
  pending,
  error,
  connected,
  untested,
  disabled,
  onTest,
}: {
  pending: boolean
  error: string | null
  connected: boolean
  untested: boolean
  disabled: boolean
  onTest: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || pending}
          onClick={onTest}
        >
          {pending ? <Spinner /> : <PlugZapIcon />}
          {tr("connections.dialog.test")}
        </Button>
        {connected && !pending && (
          <span
            role="status"
            className="text-muted-foreground flex items-center gap-1.5 text-[13px]"
          >
            <CircleCheckIcon aria-hidden className="text-success size-3.5" />
            {tr("connections.connected")}
          </span>
        )}
      </div>
      {error && !pending && !untested && (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[13px] leading-5"
        >
          <OctagonXIcon
            aria-hidden
            className="text-danger mt-0.5 size-3.5 shrink-0"
          />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

/**
 * The connection's key, as the single sign-on secret works: the API says
 * only whether one is saved or comes from the environment. Typing saves
 * a new one; the button drops the saved one.
 */
function KeyField({
  connection,
  slug,
  typed,
  dropKey,
  onType,
  onDropKey,
}: {
  connection: FulfilmentConnection | undefined
  slug: string
  typed: string
  dropKey: boolean
  onType: (value: string) => void
  onDropKey: (drop: boolean) => void
}) {
  const id = useId()
  const variable = keyVariable(slug)
  const source = connection?.apiKey.source ?? null
  // A renamed slug reads another variable, which the server checks on save.
  const environment =
    (connection?.apiKey.environment ?? false) && slug === connection?.slug
  const savedHere = source === "saved" && !dropKey
  const fromEnvironment = source === "environment" || (dropKey && environment)
  const placeholder = savedHere
    ? tr("connections.dialog.keySaved")
    : fromEnvironment
      ? tr("connections.dialog.keyFromEnvironment", { variable })
      : tr("connections.dialog.keyNone")
  const removable = source === "saved" && !typed
  const removeLabel = dropKey
    ? tr("connections.dialog.keyKeep")
    : environment
      ? tr("connections.dialog.keyUseEnvironment")
      : tr("connections.dialog.keyRemove")

  return (
    <Field>
      <FieldLabel htmlFor={id}>{tr("connections.dialog.key")}</FieldLabel>
      <div className="relative w-full">
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          value={typed}
          placeholder={placeholder}
          className={cn(removable && "pr-11")}
          onChange={(event) => onType(event.target.value)}
        />
        {removable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={removeLabel}
            title={removeLabel}
            className={cn(
              "absolute top-1/2 right-1 -translate-y-1/2",
              !dropKey && "text-destructive hover:text-destructive",
            )}
            onClick={() => onDropKey(!dropKey)}
          >
            {dropKey ? <Undo2Icon /> : <Trash2Icon />}
          </Button>
        )}
      </div>
      {dropKey && (
        <FieldDescription>
          {environment
            ? trRich("connections.dialog.keyEnvironmentApplies", {
                variable: <KeyVariable slug={slug} />,
              })
            : tr("connections.dialog.keyRemoved")}
        </FieldDescription>
      )}
    </Field>
  )
}
