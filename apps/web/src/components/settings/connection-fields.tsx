import type {
  DescribedField,
  FulfilmentValues,
  Library,
  TitleKind,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import type { JSX } from "@solidjs/web"
import { keepPreviousData, useQuery } from "@tanstack/solid-query"
import { TriangleAlert } from "lucide"
import { createUniqueId, For, Match, Show, Switch } from "solid-js"

import { MultiSelect } from "@/components/multi-select"
import { tr, translateKnown } from "@/i18n"
import { Field, FieldDescription, FieldLabel } from "@/kit/field"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/kit/select"
import { Switch as Toggle } from "@/kit/switch"
import { orpc } from "@/lib/rpc"

import { RichSelectItem } from "./select-item-content"

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
export function DescribedInput(props: {
  field: DescribedField
  value: FormValue | undefined
  onChange: (value: FormValue) => void
  /** What an unset choice means, like "Same as above". */
  unset?: string
  /** Under the field, such as where its folder lands. */
  footer?: JSX.Element
}) {
  const id = createUniqueId()
  const label = () => translateKnown(props.field.label)
  const current = () =>
    formValue(props.field, { [props.field.key]: props.value })
  const chosen = () => {
    const value = current()
    return Array.isArray(value) ? value : []
  }
  return (
    <Switch
      fallback={
        <TextInput
          id={id}
          label={label()}
          field={props.field}
          text={textOf(current())}
          footer={props.footer}
          onChange={(next) => props.onChange(next)}
        />
      }
    >
      <Match when={props.field.kind === "switch"}>
        <Field orientation="horizontal" class="justify-between">
          <FieldLabel for={id}>{label()}</FieldLabel>
          <Toggle
            id={id}
            checked={current() === true}
            onCheckedChange={(checked) => props.onChange(checked)}
          />
        </Field>
      </Match>
      <Match when={props.field.kind === "multiselect"}>
        <Field>
          <FieldLabel for={id}>{label()}</FieldLabel>
          <Show
            when={props.field.choices.length > 0}
            fallback={
              <FieldDescription>
                {tr("connections.field.noChoices")}
              </FieldDescription>
            }
          >
            <MultiSelect
              id={id}
              placeholder={tr("connections.field.find")}
              empty={tr("connections.field.findEmpty")}
              choices={props.field.choices.map((choice) => ({
                value: choice.value,
                label: translateKnown(choice.label),
              }))}
              value={chosen()}
              onChange={(next) => props.onChange(next)}
            />
          </Show>
          {props.footer}
        </Field>
      </Match>
      <Match when={props.field.kind === "select"}>
        <ChoiceInput
          id={id}
          label={label()}
          field={props.field}
          text={textOf(current())}
          unset={props.unset}
          footer={props.footer}
          onChange={(next) => props.onChange(next)}
        />
      </Match>
    </Switch>
  )
}

type InputProps = {
  id: string
  label: string
  field: DescribedField
  text: string
  unset?: string
  footer: JSX.Element | undefined
  onChange: (value: FormValue) => void
}

function ChoiceInput(props: InputProps) {
  const items = () => {
    const list = [
      ...(props.field.required
        ? []
        : [
            {
              value: UNSET,
              label: props.unset ?? tr("connections.field.unset"),
            },
          ]),
      ...props.field.choices.map((choice) => ({
        value: choice.value,
        label: translateKnown(choice.label),
      })),
    ]
    // A saved value the server no longer offers still shows.
    if (props.text && !list.some((item) => item.value === props.text))
      list.push({ value: props.text, label: props.text })
    return list
  }
  const description = (value: string) =>
    props.field.choices.find((choice) => choice.value === value)?.description
  return (
    <Field>
      <FieldLabel for={props.id}>{props.label}</FieldLabel>
      <Select
        items={items()}
        value={props.text || (props.field.required ? null : UNSET)}
        onValueChange={(next) => {
          if (next !== null) props.onChange(next === UNSET ? "" : next)
        }}
      >
        <SelectTrigger id={props.id} class="w-full">
          <SelectValue placeholder={tr("connections.field.pick")} />
        </SelectTrigger>
        <SelectContent>
          <For each={items()}>
            {(item) => (
              <RichSelectItem value={item.value} label={item.label}>
                <span class="flex min-w-0 flex-col">
                  <span class="truncate">{item.label}</span>
                  <Show when={description(item.value)}>
                    {(text) => (
                      <span class="text-muted-foreground truncate text-xs">
                        {translateKnown(text())}
                      </span>
                    )}
                  </Show>
                </span>
              </RichSelectItem>
            )}
          </For>
        </SelectContent>
      </Select>
      {props.footer}
    </Field>
  )
}

function TextInput(props: InputProps) {
  const secret = () => props.field.kind === "secret"
  return (
    <Field>
      <FieldLabel for={props.id}>{props.label}</FieldLabel>
      <Input
        id={props.id}
        type={secret() ? "password" : "text"}
        value={props.text}
        autocomplete={secret() ? "new-password" : "off"}
        spellcheck={false}
        onValueChange={(next) => props.onChange(next)}
      />
      {props.footer}
    </Field>
  )
}

/**
 * Where a folder lands: the library whose folder holds it, which the
 * server works out, or, when none does, the library an admin picks.
 */
export function LandsIn(props: {
  kind: TitleKind
  folder: string
  libraries: Library[] | undefined
  picked: string | undefined
  onPick: (libraryId: string) => void
}) {
  const id = createUniqueId()
  const landing = useQuery(() => ({
    ...orpc.admin.fulfilment.landing.queryOptions({
      input: { kind: props.kind, folder: props.folder },
    }),
    enabled: props.folder.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
  }))
  const found = () =>
    props.folder && landing.isSuccess ? landing.data : undefined
  const homes = () =>
    (props.libraries ?? []).filter(
      (library) =>
        library.kind === (props.kind === "movie" ? "movies" : "shows") &&
        library.metadataProvider !== null,
    )
  const items = () =>
    homes().map((library) => ({ value: library.id, label: library.name }))
  return (
    <Show when={found()}>
      {(data) => (
        <Switch>
          <Match when={data().hidden}>
            <p class="text-13px flex items-start gap-1.5 pt-1 leading-5">
              <Icon
                icon={TriangleAlert}
                class="text-warning mt-0.5 size-3.5 shrink-0"
              />
              <span>
                {tr("connections.landsHidden", { folder: props.folder })}
              </span>
            </p>
          </Match>
          <Match when={data().library}>
            {(library) => (
              <FieldDescription>
                {tr("connections.landsIn", { library: library().name })}
              </FieldDescription>
            )}
          </Match>
          <Match when={true}>
            <div class="flex flex-col gap-2 pt-1">
              <p class="text-13px flex items-start gap-1.5 leading-5">
                <Icon
                  icon={TriangleAlert}
                  class="text-warning mt-0.5 size-3.5 shrink-0"
                />
                <span>{tr("connections.lost", { folder: props.folder })}</span>
              </p>
              <Select
                items={items()}
                value={
                  homes().some((library) => library.id === props.picked)
                    ? (props.picked ?? null)
                    : null
                }
                onValueChange={(next) => {
                  if (next) props.onPick(next)
                }}
              >
                <SelectTrigger
                  id={id}
                  aria-label={tr("connections.landsInPick")}
                  class="w-full"
                >
                  <SelectValue placeholder={tr("connections.landsInPick")} />
                </SelectTrigger>
                <SelectContent>
                  <For each={items()}>
                    {(item) => (
                      <SelectItem value={item.value}>{item.label}</SelectItem>
                    )}
                  </For>
                </SelectContent>
              </Select>
            </div>
          </Match>
        </Switch>
      )}
    </Show>
  )
}
