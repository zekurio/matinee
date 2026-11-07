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
  description?: ReactNode
  footer?: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export function SwitchRow({
  title,
  description,
  footer,
  checked,
  disabled,
  onChange,
}: SwitchRowProps) {
  return (
    <SettingRow title={title} description={description} footer={footer}>
      {(ids) => (
        <Switch
          id={ids.controlId}
          aria-labelledby={ids.labelId}
          aria-describedby={ids.descriptionId}
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
  description?: ReactNode
  value: T
  options: readonly T[]
  labelOf: (value: T) => string
  onChange: (value: T) => void
}

export function SelectRow<T extends string>({
  title,
  description,
  value,
  options,
  labelOf,
  onChange,
}: SelectRowProps<T>) {
  return (
    <SettingRow title={title} description={description} layout="split">
      {(ids) => (
        <Select
          items={options.map((option) => ({
            value: option,
            label: labelOf(option),
          }))}
          value={value}
          onValueChange={(next) => next && onChange(next)}
        >
          <SelectTrigger
            id={ids.controlId}
            aria-describedby={ids.descriptionId}
            className="w-full"
          >
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
  description?: ReactNode
  layout?: "split" | "stack"
}

/** A row whose control is an input; the rest of the props go to it. */
export function InputRow({
  title,
  description,
  layout = "split",
  ...input
}: InputRowProps) {
  return (
    <SettingRow title={title} description={description} layout={layout}>
      {(ids) => (
        <Input
          id={ids.controlId}
          aria-describedby={ids.descriptionId}
          {...input}
        />
      )}
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
