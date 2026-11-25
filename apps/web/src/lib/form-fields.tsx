import type { ComponentProps, JSX } from "@solidjs/web"
import { createMemo, createUniqueId, omit, Show } from "solid-js"

import { Button } from "@/kit/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/kit/field"
import { Input } from "@/kit/input"
import { Spinner } from "@/kit/spinner"

import type { Form } from "./form"

type StringFieldName<Values extends object> = {
  [Name in keyof Values]-?: Name extends string
    ? string extends Values[Name]
      ? Values[Name] extends string
        ? Name
        : never
      : never
    : never
}[keyof Values]

type TextFieldProps<Values extends object> = {
  form: Form<Values>
  name: StringFieldName<Values>
  label: JSX.Element
  description?: JSX.Element
  serverError?: string | null
  /** Keep an empty input's description on blur until the first submit. */
  revealEmptyOnBlur?: boolean
} & Omit<
  ComponentProps<typeof Input>,
  "form" | "name" | "value" | "defaultValue" | "onValueChange" | "aria-invalid"
>

/** The validation message takes the description's place while it is shown. */
export function TextField<Values extends object>(
  props: TextFieldProps<Values>,
) {
  const fallbackId = createUniqueId()
  const id = () => props.id ?? fallbackId
  const message = createMemo(
    () => props.form.message(props.name) ?? props.serverError ?? undefined,
  )
  const input = omit(
    props,
    "id",
    "form",
    "name",
    "label",
    "description",
    "serverError",
    "revealEmptyOnBlur",
    "onBlur",
  )

  return (
    <Field
      name={props.name}
      invalid={message() ? true : undefined}
      class="data-invalid:text-destructive"
    >
      <FieldLabel for={id()}>{props.label}</FieldLabel>
      <Input
        {...input}
        id={id()}
        name={props.name}
        value={String(props.form.values()[props.name])}
        aria-invalid={message() ? "true" : undefined}
        onValueChange={(value) => {
          // SAFETY: StringFieldName only selects properties of type string.
          props.form.set(props.name, value as Values[StringFieldName<Values>])
        }}
        onBlur={(event) => {
          props.form.blur(
            props.name,
            props.revealEmptyOnBlur !== false ||
              event.currentTarget.value !== "",
          )
          const onBlur = props.onBlur
          if (onBlur && "0" in onBlur) onBlur[0](onBlur[1], event)
          else onBlur?.(event)
        }}
      />
      <Show
        when={message()}
        fallback={
          <Show when={props.description}>
            <FieldDescription>{props.description}</FieldDescription>
          </Show>
        }
      >
        {(error) => <FieldError>{error()}</FieldError>}
      </Show>
    </Field>
  )
}

type SubmitButtonProps = {
  form: Pick<Form<object>, "submitting">
  pending?: boolean
  icon?: JSX.Element
} & Omit<ComponentProps<typeof Button>, "type" | "form">

/** Spins for an awaited submit or extra work the caller marks as pending. */
export function SubmitButton(props: SubmitButtonProps) {
  const busy = () => props.pending || props.form.submitting()
  return (
    <Button
      {...omit(props, "form", "pending", "icon", "disabled", "children")}
      type="submit"
      disabled={busy() || props.disabled}
    >
      <Show when={busy()} fallback={props.icon}>
        <Spinner />
      </Show>
      {props.children}
    </Button>
  )
}
