import { Username } from "@matinee/contracts"
import { KeyRoundIcon } from "lucide-react"

import { useAppForm } from "@/lib/form"
import { errorMessage } from "@/lib/rpc"

import { forgetEmptyBlur } from "./username-field"

/** Pick a username, then create the passkey that signs in to it. */
export function UsernamePasskeyForm({
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  submitLabel: string
  pending: boolean
  error: Error | null
  onSubmit: (username: string) => void
}) {
  const form = useAppForm({
    defaultValues: { username: "" },
    onSubmit: ({ value }) => onSubmit(Username.parse(value.username)),
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="username" validators={{ onChange: Username }}>
        {(field) => (
          <field.TextField
            label="Username"
            description="Your browser or password manager stores the passkey."
            serverError={error ? errorMessage(error) : null}
            autoComplete="username webauthn"
            autoCapitalize="none"
            spellCheck={false}
            onBlur={() => forgetEmptyBlur(field)}
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton size="lg" pending={pending} icon={<KeyRoundIcon />}>
          {submitLabel}
        </form.SubmitButton>
      </form.AppForm>
    </form>
  )
}
