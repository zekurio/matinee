import type { JSX } from "@solidjs/web"
import { For } from "solid-js"

import { Field, FieldLabel } from "@/kit/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/kit/select"
import type { Form } from "@/lib/form"

/** A labelled select bound to `name` in `form`, whose value is one of `items`. */
export function SelectField<
  Values extends object,
  Name extends keyof Values,
>(props: {
  form: Form<Values>
  name: Name
  id: string
  label: JSX.Element
  items: ReadonlyArray<{ value: Values[Name] & string; label: string }>
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldLabel for={props.id}>{props.label}</FieldLabel>
      <Select<Values[Name] & string>
        items={[...props.items]}
        // SAFETY: the field holds one of the items' values, all strings.
        value={props.form.values()[props.name] as Values[Name] & string}
        disabled={props.disabled}
        onValueChange={(next) => {
          if (next !== null) props.form.set(props.name, next)
        }}
      >
        <SelectTrigger id={props.id} class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <For each={props.items}>
            {(option) => (
              <SelectItem<Values[Name] & string> value={option.value}>
                {option.label}
              </SelectItem>
            )}
          </For>
        </SelectContent>
      </Select>
    </Field>
  )
}
