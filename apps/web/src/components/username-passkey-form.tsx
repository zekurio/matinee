import { Username } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import { Spinner } from "@matinee/ui/components/spinner"
import { KeyRoundIcon } from "lucide-react"
import { useId, useState } from "react"

import { errorMessage } from "@/lib/rpc"

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
  const id = useId()
  const [username, setUsername] = useState("")
  const [touched, setTouched] = useState(false)
  const parsed = Username.safeParse(username)
  const invalid = touched && !parsed.success
  const message = invalid
    ? parsed.error?.issues[0]?.message
    : error
      ? errorMessage(error)
      : undefined

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setTouched(true)
        if (parsed.success) onSubmit(parsed.data)
      }}
    >
      <Field data-invalid={message ? true : undefined}>
        <FieldLabel htmlFor={id}>Username</FieldLabel>
        <Input
          id={id}
          autoComplete="username webauthn"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          aria-invalid={message ? true : undefined}
          onChange={(event) => setUsername(event.target.value)}
          onBlur={() => setTouched(username.length > 0)}
        />
        {message ? (
          <FieldError>{message}</FieldError>
        ) : (
          <FieldDescription>
            Your browser or password manager stores the passkey. No password to
            remember.
          </FieldDescription>
        )}
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner /> : <KeyRoundIcon />}
        {submitLabel}
      </Button>
    </form>
  )
}
