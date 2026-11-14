import type {
  DescribedField,
  FulfilmentValues,
  Library,
  TitleKind,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  Field,
  FieldDescription,
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
import { Switch } from "@matinee/ui/components/switch"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { TriangleAlertIcon } from "lucide-react"
import { type ReactNode, useId } from "react"

import { ToggleChips } from "@/components/filters/filter-panel"
import { tr, translateKnown } from "@/i18n"
import { orpc } from "@/lib/rpc"

/** A described field's value as its input holds it. */
export type FormValue = string | boolean | string[]
export type FormValues = Partial<Record<string, FormValue>>

const Scalar = t.union([t.string(), t.number(), t.boolean()])
const Scalars = t.array(t.union([t.string(), t.number()]))

/** The text a value holds, or nothing for a switch or a list. */
export function textOf(value: FormValue | undefined): string {
  if (
    value === undefined ||
    value === true ||
    value === false ||
    Array.isArray(value)
  )
    return ""
  return value
}

/** A saved value as the input for `field` holds it. */
function formValue(
  field: DescribedField,
  values: FulfilmentValues | FormValues,
): FormValue {
  const value = values[field.key]
  if (field.kind === "switch") {
    const parsed = t.boolean().safeParse(value)
    return parsed.success && parsed.data
  }
  if (field.kind === "multiselect") {
    const parsed = Scalars.safeParse(value)
    return parsed.success ? parsed.data.map(String) : []
  }
  const parsed = Scalar.safeParse(value)
  return parsed.success ? String(parsed.data) : ""
}

/** Saved values as the inputs for `fields` hold them. */
export function formValues(
  fields: DescribedField[],
  values: FulfilmentValues,
): FormValues {
  return Object.fromEntries(
    fields.map((field) => [field.key, formValue(field, values)]),
  )
}

/** What the inputs hold, to send: empty text and choices left out. */
export function sendValues(
  fields: DescribedField[],
  values: FormValues,
): FulfilmentValues {
  return Object.fromEntries(
    fields.flatMap((field): [string, FormValue][] => {
      const value = formValue(field, values)
      if (field.kind === "switch" || field.kind === "multiselect")
        return [[field.key, value]]
      const text = textOf(value).trim()
      return text ? [[field.key, text]] : []
    }),
  )
}

/**
 * A saved value as words: the labels of the choices it holds, or the
 * value itself where it isn't one of them.
 */
export function shownValue(
  field: DescribedField | undefined,
  values: FulfilmentValues,
  key: string,
): string[] {
  const labelOf = (text: string) => {
    const found = field?.choices.find((choice) => choice.value === text)
    return found ? translateKnown(found.label) : text
  }
  const list = Scalars.safeParse(values[key])
  if (list.success) return list.data.map((entry) => labelOf(String(entry)))
  const one = Scalar.safeParse(values[key])
  return one.success ? [labelOf(String(one.data))] : []
}

/** A required field without a value, if any. */
export function missingField(fields: DescribedField[], values: FormValues) {
  return fields.find((field) => {
    if (!field.required) return false
    const value = values[field.key]
    return (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    )
  })
}

const UNSET = "\u0000unset"

/**
 * A field a source describes: text, a secret, a choice, several choices,
 * or a switch. A choice that isn't required can be left unset, which
 * `unset` names.
 */
export function DescribedInput({
  field,
  value,
  onChange,
  unset,
  footer,
}: {
  field: DescribedField
  value: FormValue | undefined
  onChange: (value: FormValue) => void
  /** What an unset choice means, like "Same as above". */
  unset?: string
  /** Under the field, such as where its folder lands. */
  footer?: ReactNode
}) {
  const id = useId()
  const label = translateKnown(field.label)
  const current = formValue(field, { [field.key]: value })
  if (field.kind === "switch") {
    return (
      <Field orientation="horizontal" className="justify-between">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Switch
          id={id}
          checked={current === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </Field>
    )
  }
  if (field.kind === "multiselect") {
    const chosen = Array.isArray(current) ? current : []
    return (
      <Field>
        <FieldLabel id={id}>{label}</FieldLabel>
        {field.choices.length ? (
          <ToggleChips
            labelId={id}
            limit={24}
            find={{
              placeholder: tr("connections.field.find"),
              empty: tr("connections.field.findEmpty"),
            }}
            choices={field.choices.map((choice) => ({
              value: choice.value,
              label: translateKnown(choice.label),
            }))}
            value={chosen}
            onChange={onChange}
          />
        ) : (
          <FieldDescription>
            {tr("connections.field.noChoices")}
          </FieldDescription>
        )}
        {footer}
      </Field>
    )
  }
  if (field.kind === "select") {
    const text = textOf(current)
    const items = [
      ...(field.required
        ? []
        : [{ value: UNSET, label: unset ?? tr("connections.field.unset") }]),
      ...field.choices.map((choice) => ({
        value: choice.value,
        label: translateKnown(choice.label),
      })),
    ]
    // A saved value the server no longer offers still shows.
    if (text && !items.some((item) => item.value === text))
      items.push({ value: text, label: text })
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Select
          items={items}
          value={text || (field.required ? null : UNSET)}
          onValueChange={(next) =>
            next !== null && onChange(next === UNSET ? "" : next)
          }
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={tr("connections.field.pick")} />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => {
              const description = field.choices.find(
                (choice) => choice.value === item.value,
              )?.description
              return (
                <SelectItem key={item.value} value={item.value}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{item.label}</span>
                    {description && (
                      <span className="text-muted-foreground truncate text-xs">
                        {translateKnown(description)}
                      </span>
                    )}
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        {footer}
      </Field>
    )
  }
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={field.kind === "secret" ? "password" : "text"}
        value={textOf(current)}
        autoComplete={field.kind === "secret" ? "new-password" : "off"}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {footer}
    </Field>
  )
}

/**
 * Where a folder lands: the library whose folder holds it, which the
 * server works out, or, when none does, the library an admin picks.
 */
export function LandsIn({
  kind,
  folder,
  libraries,
  picked,
  onPick,
}: {
  kind: TitleKind
  folder: string
  libraries: Library[] | undefined
  picked: string | undefined
  onPick: (libraryId: string) => void
}) {
  const id = useId()
  const landing = useQuery({
    ...orpc.admin.fulfilment.landing.queryOptions({ input: { kind, folder } }),
    enabled: folder.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
  })
  if (!folder || !landing.isSuccess) return null
  if (landing.data.library)
    return (
      <FieldDescription>
        {tr("connections.landsIn", { library: landing.data.library.name })}
      </FieldDescription>
    )
  const homes = (libraries ?? []).filter(
    (library) =>
      library.kind === (kind === "movie" ? "movies" : "shows") &&
      library.metadataProvider !== null,
  )
  const items = homes.map((library) => ({
    value: library.id,
    label: library.name,
  }))
  return (
    <div className="flex flex-col gap-2 pt-1">
      <p className="flex items-start gap-1.5 text-[13px] leading-5">
        <TriangleAlertIcon
          aria-hidden
          className="text-warning mt-0.5 size-3.5 shrink-0"
        />
        <span>{tr("connections.lost", { folder })}</span>
      </p>
      <Select
        items={items}
        value={homes.some((library) => library.id === picked) ? picked : null}
        onValueChange={(next) => next && onPick(next)}
      >
        <SelectTrigger
          id={id}
          aria-label={tr("connections.landsInPick")}
          className="w-full"
        >
          <SelectValue placeholder={tr("connections.landsInPick")} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
