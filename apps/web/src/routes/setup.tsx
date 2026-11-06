import { AUTH_ERROR_QUERY_KEY, oidcStartPath } from "@matinee/contracts"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import { Separator } from "@matinee/ui/components/separator"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { LogInIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"

import { AuthScreen } from "@/components/auth-screen"
import { FormAlert } from "@/components/form-alert"
import { UsernamePasskeyForm } from "@/components/username-passkey-form"
import { signUpWithPasskey } from "@/lib/passkey"
import { client, errorMessage, orpc } from "@/lib/rpc"

const SetupSearch = z.object({
  [AUTH_ERROR_QUERY_KEY]: z.string().optional().catch(undefined),
})

export const Route = createFileRoute("/setup")({
  validateSearch: SetupSearch,
  beforeLoad: async ({ context }) => {
    // Always ask the server: setup ends the moment the first account exists.
    const config = await context.queryClient.fetchQuery(
      orpc.auth.config.queryOptions({ staleTime: 0 }),
    )
    if (!config.setupRequired) throw redirect({ to: "/login" })
    return { config }
  },
  component: SetupPage,
})

function SetupPage() {
  const { config } = Route.useRouteContext()
  const search = Route.useSearch()
  const [unlocked, setUnlocked] = useState(!config.setupTokenRequired)

  return (
    <AuthScreen
      title="Set up Matinee"
      description={
        unlocked
          ? "Create the admin account. It manages libraries and settings for this server."
          : "Enter the setup token from the server log to claim this server."
      }
    >
      <div className="flex flex-col gap-4">
        {search[AUTH_ERROR_QUERY_KEY] && (
          <FormAlert message={search[AUTH_ERROR_QUERY_KEY]} />
        )}
        {unlocked ? (
          <CreateAdmin oidcName={config.oidc?.displayName ?? null} />
        ) : (
          <SetupToken onUnlocked={() => setUnlocked(true)} />
        )}
      </div>
    </AuthScreen>
  )
}

function SetupToken({ onUnlocked }: { onUnlocked: () => void }) {
  const [token, setToken] = useState("")
  const unlock = useMutation({
    mutationFn: (value: string) => client.auth.unlockSetup({ token: value }),
    onSuccess: onUnlocked,
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (token.trim()) unlock.mutate(token.trim())
      }}
    >
      <Field data-invalid={unlock.error ? true : undefined}>
        <FieldLabel htmlFor="setup-token">Setup token</FieldLabel>
        <Input
          id="setup-token"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        {unlock.error ? (
          <FieldError>{errorMessage(unlock.error)}</FieldError>
        ) : (
          <FieldDescription>
            The server prints it to its log on start. It proves you run this
            server before you claim the admin account.
          </FieldDescription>
        )}
      </Field>
      <Button type="submit" size="lg" disabled={unlock.isPending}>
        {unlock.isPending && <Spinner />}
        Continue
      </Button>
    </form>
  )
}

function CreateAdmin({ oidcName }: { oidcName: string | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const signUp = useMutation({
    mutationFn: signUpWithPasskey,
    onSuccess: async (user) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
      await queryClient.invalidateQueries({ queryKey: orpc.auth.config.key() })
      await navigate({ to: "/", search: { settings: "libraries" } })
    },
  })
  return (
    <>
      <UsernamePasskeyForm
        submitLabel="Create admin with a passkey"
        pending={signUp.isPending}
        error={signUp.error}
        onSubmit={(username) => signUp.mutate(username)}
      />
      {oidcName && (
        <>
          <div className="text-muted-foreground flex items-center gap-3 text-sm">
            <Separator className="flex-1" />
            or
            <Separator className="flex-1" />
          </div>
          <a
            href={oidcStartPath("sign-in", "/?settings=libraries")}
            className={buttonVariants({
              variant: "outline",
              size: "lg",
            })}
          >
            <LogInIcon />
            Create admin with {oidcName}
          </a>
        </>
      )}
    </>
  )
}
