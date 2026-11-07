import { Field, FieldLabel } from "@matinee/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { useSelector } from "@tanstack/react-form"
import type { ReactNode } from "react"

import { useFieldContext } from "@/lib/form"

/**
 * A labelled select bound to its form field. Render it inside
 * `form.AppField`; the field's value is one of `items`.
 */
export function SelectField({
  id,
  label,
  items,
  disabled,
}: {
  id: string
  label: ReactNode
  items: ReadonlyArray<{ value: string; label: string }>
  disabled?: boolean
}) {
  const field = useFieldContext<string>()
  const value = useSelector(field.store, (state) => state.value)

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => next && field.handleChange(next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
