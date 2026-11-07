import { Button } from "@matinee/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import { Spinner } from "@matinee/ui/components/spinner"
import {
  createFormHook,
  createFormHookContexts,
  useSelector,
} from "@tanstack/react-form"
import { type ComponentProps, type ReactNode, useId } from "react"

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

/**
 * The first message among a field's errors. Schema validators give Standard
 * Schema issues; a function validator returns `{ message }` the same way.
 */
export function firstError(
  errors: ReadonlyArray<{ message?: string } | null | undefined>,
): string | undefined {
  return errors.find((error) => error?.message)?.message
}

/**
 * The message a field shows: its own validation once someone has left the
 * field or tried to submit, else a server error passed in.
 */
export function useFieldMessage(serverError?: string | null) {
  const field = useFieldContext<unknown>()
  const errors = useSelector(field.store, (state) => state.meta.errors)
  const blurred = useSelector(field.store, (state) => state.meta.isBlurred)
  const submitted = useSelector(
    field.form.store,
    (state) => state.submissionAttempts > 0,
  )
  const own = blurred || submitted ? firstError(errors) : undefined
  return own ?? serverError ?? undefined
}

/**
 * A labelled text input bound to its form field. The error replaces the
 * description while there is one.
 */
function TextField({
  label,
  description,
  serverError,
  ...input
}: {
  label: ReactNode
  description?: ReactNode
  /** A failure from the server for this field, such as a taken name. */
  serverError?: string | null
} & Omit<ComponentProps<typeof Input>, "value" | "onChange" | "name">) {
  const field = useFieldContext<string>()
  const value = useSelector(field.store, (state) => state.value)
  const message = useFieldMessage(serverError)
  const fallbackId = useId()
  const id = input.id ?? fallbackId

  return (
    <Field data-invalid={message ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...input}
        id={id}
        name={field.name}
        value={value}
        aria-invalid={message ? true : undefined}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={(event) => {
          field.handleBlur()
          input.onBlur?.(event)
        }}
      />
      {message ? (
        <FieldError>{message}</FieldError>
      ) : description ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
    </Field>
  )
}

/** The form's submit button. It spins while the submit handler runs. */
function SubmitButton({
  children,
  pending = false,
  icon,
  ...button
}: {
  children: ReactNode
  /** Also spin for work the submit handler started but doesn't await. */
  pending?: boolean
  /** Shown when not spinning. */
  icon?: ReactNode
} & Omit<ComponentProps<typeof Button>, "type" | "children">) {
  const form = useFormContext()
  const submitting = useSelector(form.store, (state) => state.isSubmitting)
  const busy = pending || submitting
  return (
    <Button {...button} type="submit" disabled={busy || button.disabled}>
      {busy ? <Spinner /> : icon}
      {children}
    </Button>
  )
}

/**
 * The app's form hook. Text inputs go through `form.AppField` with
 * `field.TextField`; any other control can read the field with
 * `useFieldContext` inside `form.AppField`, or use `form.Field` directly.
 */
export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField },
  formComponents: { SubmitButton },
})
