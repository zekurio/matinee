import { Username } from "@matinee/contracts"
import { KeyRound } from "lucide"

import { tr } from "@/i18n"
import { Icon } from "@/kit/icon"
import { createForm } from "@/lib/form"
import { SubmitButton, TextField } from "@/lib/form-fields"

/** Pick a username, then create the passkey that signs in to it. */
export function UsernamePasskeyForm(props: {
  submitLabel: string
  onSubmit: (username: string) => void | Promise<void>
}) {
  const form = createForm({
    defaultValues: { username: "" },
    checks: { username: Username },
    onSubmit: ({ username }) => props.onSubmit(Username.parse(username)),
  })

  return (
    <form
      class="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.submit()
      }}
    >
      <TextField
        form={form}
        name="username"
        label={tr("auth.username")}
        description={tr("auth.usernameHint")}
        autocomplete="username webauthn"
        autocapitalize="none"
        spellcheck={false}
        revealEmptyOnBlur={false}
      />
      <SubmitButton form={form} size="lg" icon={<Icon icon={KeyRound} />}>
        {props.submitLabel}
      </SubmitButton>
    </form>
  )
}
