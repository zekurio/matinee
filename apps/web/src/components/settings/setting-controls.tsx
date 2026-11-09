import { Alert, AlertDescription } from "@matinee/ui/components/alert"
import { Input } from "@matinee/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { Switch } from "@matinee/ui/components/switch"
import { useSelector } from "@tanstack/react-form"
import { TriangleAlertIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { useFieldContext } from "@/lib/form"

import { SettingRow } from "./settings-panel"

/**
 * Stands in for a value `withForm` reads only the type of, for its
 * `defaultValues` and `props`. The panel's form brings the real ones.
 */
export function typeOnly<T>(value?: T): T | undefined {
  return value
}

/*
 * Each row has a `Field` twin that binds to the form field it renders in,
 * inside `form.AppField`. The twins report changes but not blurs: a blur
 * counts as a touch, and a touched form stops following a refetch.
 */

type SwitchRowProps = {
  title: string
  footer?: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export function SwitchRow({
  title,
  footer,
  checked,
  disabled,
  onChange,
}: SwitchRowProps) {
  return (
    <SettingRow title={title} footer={footer}>
      {(ids) => (
        <Switch
          id={ids.controlId}
          aria-labelledby={ids.labelId}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      )}
    </SettingRow>
  )
}

export function SwitchField(row: Omit<SwitchRowProps, "checked" | "onChange">) {
  const field = useFieldContext<boolean>()
  const checked = useSelector(field.store, (state) => state.value)
  return <SwitchRow {...row} checked={checked} onChange={field.handleChange} />
}

type SelectRowProps<T extends string> = {
  title: string
  value: T
  options: readonly T[]
  labelOf: (value: T) => string
  onChange: (value: T) => void
}

export function SelectRow<T extends string>({
  title,
  value,
  options,
  labelOf,
  onChange,
}: SelectRowProps<T>) {
  return (
    <SettingRow title={title} layout="split">
      {(ids) => (
        <Select
          items={options.map((option) => ({
            value: option,
            label: labelOf(option),
          }))}
          value={value}
          onValueChange={(next) => next && onChange(next)}
        >
          <SelectTrigger id={ids.controlId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {labelOf(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </SettingRow>
  )
}

export function SelectField<T extends string>(
  row: Omit<SelectRowProps<T>, "value" | "onChange">,
) {
  const field = useFieldContext<T>()
  const value = useSelector(field.store, (state) => state.value)
  return <SelectRow {...row} value={value} onChange={field.handleChange} />
}

type InputRowProps = Omit<ComponentProps<typeof Input>, "id" | "title"> & {
  title: string
  layout?: "split" | "stack"
  /** Under the row, such as a note on what changing it does. */
  footer?: ReactNode
}

/** A row whose control is an input; the rest of the props go to it. */
function InputRow({
  title,
  layout = "split",
  footer,
  ...input
}: InputRowProps) {
  return (
    <SettingRow title={title} layout={layout} footer={footer}>
      {(ids) => <Input id={ids.controlId} {...input} />}
    </SettingRow>
  )
}

export function InputField(row: Omit<InputRowProps, "value" | "onChange">) {
  const field = useFieldContext<string>()
  const value = useSelector(field.store, (state) => state.value)
  return (
    <InputRow
      {...row}
      value={value}
      onChange={(event) => field.handleChange(event.target.value)}
    />
  )
}

export function SettingWarning({ children }: { children: ReactNode }) {
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertDescription className="text-foreground">
        {children}
      </AlertDescription>
    </Alert>
  )
}
