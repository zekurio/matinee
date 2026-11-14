import {
  type DescribedField,
  type FulfilmentConnection,
  FulfilmentConnectionInput,
  type FulfilmentSourceDescription,
  type FulfilmentValues,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
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
import { cn } from "@matinee/ui/lib/utils"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2Icon, Undo2Icon } from "lucide-react"
import { Fragment, useId } from "react"

import { tr, translateKnown } from "@/i18n"
import { trRich } from "@/i18n/react"
import { useAppForm } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"

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
  /** The source's own fields, as text, by key. */
  settings: Record<string, string>
  /** A new key to save; empty keeps the current one. */
  apiKey: string
  /** Drop the saved key, so the environment's applies again. */
  dropKey: boolean
}

const Scalar = t.union([t.string(), t.number(), t.boolean()])

/**
 * Described values as the inputs hold them, as text. A value that isn't
 * one is left out, so its field starts empty.
 */
export function textValues(values: FulfilmentValues): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, entry]) => {
      const parsed = Scalar.safeParse(entry)
      return parsed.success ? [[key, String(parsed.data)]] : []
    }),
  )
}

function valuesOf(
  connection: FulfilmentConnection | undefined,
  sources: FulfilmentSourceDescription[],
): ConnectionValues {
  const source = connection?.source ?? sources[0]?.id ?? ""
  return {
    source,
    name: connection?.name ?? "",
    slug: connection?.slug ?? "",
    slugEdited: connection !== undefined,
    settings: textValues(connection?.settings ?? {}),
    apiKey: "",
    dropKey: false,
  }
}

/** Adds a connection, or edits one. Its fields are the ones its source describes. */
export function ConnectionDialog({
  connection,
  sources,
  open,
  onOpenChange,
}: {
  /** Unset for a new one. */
  connection?: FulfilmentConnection
  sources: FulfilmentSourceDescription[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-lg">
        {open && (
          <ConnectionForm
            connection={connection}
            sources={sources}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ConnectionForm({
  connection,
  sources,
  onDone,
}: {
  connection?: FulfilmentConnection
  sources: FulfilmentSourceDescription[]
  onDone: () => void
}) {
  const queryClient = useQueryClient()
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

  const form = useAppForm({
    defaultValues: valuesOf(connection, sources),
    onSubmit: ({ value }) => {
      const source = sources.find((entry) => entry.id === value.source)
      if (!source) return
      const missing = source.fields.find(
        (field) => field.required && !value.settings[field.key]?.trim(),
      )
      if (missing) {
        toast.error(
          tr("connections.dialog.required", {
            field: translateKnown(missing.label),
          }),
        )
        return
      }
      const typed = value.apiKey.trim()
      const parsed = FulfilmentConnectionInput.safeParse({
        name: value.name,
        slug: value.slug,
        source: source.id,
        settings: Object.fromEntries(
          source.fields.flatMap((field) => {
            const text = value.settings[field.key]?.trim() ?? ""
            return text ? [[field.key, text]] : []
          }),
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
  const source = sources.find((entry) => entry.id === values.source)
  const sourceItems = sources.map((entry) => ({
    value: entry.id,
    label: translateKnown(entry.name),
  }))
  const id = useId()
  const slugValid = SLUG.test(values.slug)

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
            {connection
              ? tr("connections.dialog.editTitle", { name: connection.name })
              : tr("connections.dialog.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-source`}>
              {tr("connections.dialog.source")}
            </FieldLabel>
            <Select
              items={sourceItems}
              value={values.source}
              disabled={connection !== undefined}
              onValueChange={(next) =>
                next && form.setFieldValue("source", next)
              }
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
                    aria-invalid={values.slug && !slugValid ? true : undefined}
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

          {source?.fields.map((described) => (
            <DescribedInput
              key={`${source.id}-${described.key}`}
              field={described}
              value={values.settings[described.key] ?? ""}
              onChange={(next) =>
                form.setFieldValue("settings", (settings) => ({
                  ...settings,
                  [described.key]: next,
                }))
              }
            />
          ))}

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
        </FieldGroup>

        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <form.SubmitButton
            disabled={!values.name.trim() || !slugValid}
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

/** A field a source describes: text, a secret, or a choice. */
export function DescribedInput({
  field,
  value,
  onChange,
  placeholder,
}: {
  field: DescribedField
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const id = useId()
  const label = translateKnown(field.label)
  if (field.kind === "select") {
    const items = field.choices.map((choice) => ({
      value: choice.value,
      label: translateKnown(choice.label),
    }))
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Select
          items={items}
          value={value || null}
          onValueChange={(next) => next && onChange(next)}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {field.choices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    {translateKnown(choice.label)}
                  </span>
                  {choice.description && (
                    <span className="text-muted-foreground truncate text-xs">
                      {translateKnown(choice.description)}
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    )
  }
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={field.kind === "secret" ? "password" : "text"}
        value={value}
        required={field.required}
        autoComplete={field.kind === "secret" ? "new-password" : "off"}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
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
