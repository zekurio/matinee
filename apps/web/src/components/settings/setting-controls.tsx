import type { JSX } from "@solidjs/web"
import { TriangleAlert } from "lucide"
import { type ComponentProps, For, omit } from "solid-js"

import { Alert, AlertDescription } from "@/kit/alert"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/kit/select"
import { Switch } from "@/kit/switch"
import type { Form } from "@/lib/form"

import { SettingRow } from "./settings-panel"

/** The names of a form's fields that hold a `Value`. */
export type FieldName<Values extends object, Value> = {
  [Name in keyof Values]-?: Values[Name] extends Value ? Name : never
}[keyof Values]

/** A form and one of its top-level fields, for a row's `Field` twin. */
type Bound<Values extends object, Value> = {
  form: Form<Values>
  name: FieldName<Values, Value>
}

/*
 * Each row has a `Field` twin that binds to a field of a `createForm`
 * form. The twins report changes but not blurs, as a settings form shows
 * no message until it's saved. A field nested deeper than the form's top
 * level takes the row itself, with its value and change handler.
 */

type SwitchRowProps = {
  title: string
  /** Under the name, beside the switch. */
  hint?: JSX.Element
  footer?: JSX.Element
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export function SwitchRow(props: SwitchRowProps) {
  return (
    <SettingRow title={props.title} hint={props.hint} footer={props.footer}>
      {(ids) => (
        <Switch
          id={ids.controlId}
          aria-labelledby={ids.labelId}
          aria-describedby={ids.hintId}
          checked={props.checked}
          disabled={props.disabled}
          onCheckedChange={(checked) => props.onChange(checked)}
        />
      )}
    </SettingRow>
  )
}

export function SwitchField<Values extends object>(
  props: Bound<Values, boolean> & Omit<SwitchRowProps, "checked" | "onChange">,
) {
  return (
    <SwitchRow
      title={props.title}
      hint={props.hint}
      footer={props.footer}
      disabled={props.disabled}
      checked={props.form.values()[props.name] === true}
      onChange={(checked) =>
        // SAFETY: FieldName only names fields that hold a boolean.
        props.form.set(
          props.name,
          checked as Values[FieldName<Values, boolean>],
        )
      }
    />
  )
}

type SelectRowProps<T extends string> = {
  title: string
  /** `side` in a form dialog's columns. */
  layout?: "split" | "side"
  /** Under the name, beside the select. */
  hint?: JSX.Element
  footer?: JSX.Element
  value: T
  options: readonly T[]
  labelOf: (value: T) => string
  disabled?: boolean
  onChange: (value: T) => void
}

export function SelectRow<T extends string>(props: SelectRowProps<T>) {
  const items = () =>
    props.options.map((option) => ({
      value: option,
      label: props.labelOf(option),
    }))
  return (
    <SettingRow
      title={props.title}
      layout={props.layout ?? "split"}
      hint={props.hint}
      footer={props.footer}
    >
      {(ids) => (
        <Select<T>
          items={items()}
          value={props.value}
          disabled={props.disabled}
          onValueChange={(next) => {
            if (next !== null) props.onChange(next)
          }}
        >
          <SelectTrigger
            id={ids.controlId}
            aria-describedby={ids.hintId}
            class="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <For each={props.options}>
              {(option) => (
                <SelectItem<T> value={option}>
                  {props.labelOf(option)}
                </SelectItem>
              )}
            </For>
          </SelectContent>
        </Select>
      )}
    </SettingRow>
  )
}

export function SelectField<Values extends object, T extends string>(
  props: Bound<Values, T> & Omit<SelectRowProps<T>, "value" | "onChange">,
) {
  return (
    <SelectRow<T>
      title={props.title}
      layout={props.layout}
      hint={props.hint}
      footer={props.footer}
      options={props.options}
      labelOf={props.labelOf}
      disabled={props.disabled}
      // SAFETY: FieldName only names fields that hold a T.
      value={props.form.values()[props.name] as T}
      onChange={(value) =>
        // SAFETY: as above, the field holds a T.
        props.form.set(props.name, value as Values[FieldName<Values, T>])
      }
    />
  )
}

type InputRowProps = Omit<ComponentProps<typeof Input>, "id" | "title"> & {
  title: string
  layout?: "split" | "stack"
  /** Under the row, such as a note on what changing it does. */
  footer?: JSX.Element
}

/** A row whose control is an input; the rest of the props go to it. */
export function InputRow(props: InputRowProps) {
  const input = omit(props, "title", "layout", "footer")
  return (
    <SettingRow
      title={props.title}
      layout={props.layout ?? "split"}
      footer={props.footer}
    >
      {(ids) => <Input id={ids.controlId} {...input} />}
    </SettingRow>
  )
}

export function InputField<Values extends object>(
  props: Bound<Values, string> &
    Omit<InputRowProps, "value" | "onValueChange" | "form" | "name">,
) {
  const input = omit(props, "form", "name")
  return (
    <InputRow
      {...input}
      value={String(props.form.values()[props.name])}
      onValueChange={(value) =>
        // SAFETY: FieldName only names fields that hold a string.
        props.form.set(props.name, value as Values[FieldName<Values, string>])
      }
    />
  )
}

export function SettingWarning(props: { children: JSX.Element }) {
  return (
    <Alert>
      <Icon icon={TriangleAlert} />
      <AlertDescription class="text-foreground">
        {props.children}
      </AlertDescription>
    </Alert>
  )
}
