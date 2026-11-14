import type { PluginAuthProvider } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { LogInIcon } from "lucide-react"
import { useEffect, useRef } from "react"

import { FormAlert } from "@/components/form-alert"
import { useAppForm } from "@/lib/form"

type Fields = PluginAuthProvider["fields"]

/** What a password manager should fill into a field. */
function autoCompleteOf(fields: Fields, index: number): string {
  const field = fields[index]
  if (!field) return "off"
  if (field.type === "password") return "current-password"
  // The first text field is the one a password manager pairs with the
  // password.
  const firstText = fields.findIndex((item) => item.type === "text")
  return firstText === index ? "username" : "off"
}

/**
 * The fields a plugin's sign-in asks for, with labels the plugin wrote.
 * The caller sends them; a failure shows here, in the server's words, and
 * the fields keep what was typed.
 */
export function PluginCredentialsForm({
  provider,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
  focusOnMount = false,
}: {
  provider: Pick<PluginAuthProvider, "key" | "fields">
  submitLabel: string
  pending: boolean
  /** The last attempt's failure, to show above the button. */
  error: string | null
  onSubmit: (fields: Record<string, string>) => void
  /** A way back from the form, with its label. */
  onCancel?: { label: string; run: () => void }
  /**
   * Focus the first field, for a form that replaced the button that
   * opened it.
   */
  focusOnMount?: boolean
}) {
  const { fields } = provider
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (focusOnMount) formRef.current?.querySelector("input")?.focus()
  }, [focusOnMount])
  const form = useAppForm({
    defaultValues: Object.fromEntries(
      fields.map((field) => [field.key, ""]),
    ) satisfies Record<string, string>,
    onSubmit: ({ value }) => onSubmit(value),
  })

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {fields.map((field, index) => (
        <form.AppField key={field.key} name={field.key}>
          {(control) => (
            <control.TextField
              id={`${provider.key}-${field.key}`}
              label={<span className="wrap-anywhere">{field.label}</span>}
              type={field.type === "password" ? "password" : "text"}
              autoComplete={autoCompleteOf(fields, index)}
              autoCapitalize="none"
              spellCheck={false}
              disabled={pending}
            />
          )}
        </form.AppField>
      ))}
      {error && <FormAlert message={error} />}
      <div className="flex flex-col gap-2">
        <form.AppForm>
          <form.SubmitButton size="lg" pending={pending} icon={<LogInIcon />}>
            {submitLabel}
          </form.SubmitButton>
        </form.AppForm>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onCancel.run}
          >
            {onCancel.label}
          </Button>
        )}
      </div>
    </form>
  )
}
