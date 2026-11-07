import { AUTH_ERROR_QUERY_KEY, oidcStartPath } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { buttonVariants } from "@matinee/ui/components/button"
import { Separator } from "@matinee/ui/components/separator"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { LogInIcon } from "lucide-react"
import { useState } from "react"

import { AuthScreen } from "@/components/auth-screen"
import { FormAlert } from "@/components/form-alert"
import { UsernamePasskeyForm } from "@/components/username-passkey-form"
import { tr, translateKnown } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { signUpWithPasskey } from "@/lib/passkey"
import { client, errorMessage, orpc } from "@/lib/rpc"

const SetupSearch = t.object({
  [AUTH_ERROR_QUERY_KEY]: t.string().optional().catch(undefined),
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
      title={tr("auth.setup.title")}
      description={
        unlocked ? tr("auth.setup.createAdmin") : tr("auth.setup.enterToken")
      }
    >
      <div className="flex flex-col gap-4">
        {search[AUTH_ERROR_QUERY_KEY] && (
          <FormAlert message={translateKnown(search[AUTH_ERROR_QUERY_KEY])} />
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
  const unlock = useMutation({
    mutationFn: (value: string) => client.auth.unlockSetup({ token: value }),
    onSuccess: onUnlocked,
  })
  const form = useAppForm({
    defaultValues: { token: "" },
    // An empty token isn't sent, and isn't flagged either.
    onSubmit: ({ value }) => {
      const token = value.token.trim()
      if (token) unlock.mutate(token)
    },
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="token">
        {(field) => (
          <field.TextField
            id="setup-token"
            label={tr("auth.setup.token")}
            description={tr("auth.setup.tokenHint")}
            serverError={unlock.error ? errorMessage(unlock.error) : null}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton size="lg" pending={unlock.isPending}>
          {tr("auth.setup.continue")}
        </form.SubmitButton>
      </form.AppForm>
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
        submitLabel={tr("auth.setup.adminPasskey")}
        pending={signUp.isPending}
        error={signUp.error}
        onSubmit={(username) => signUp.mutate(username)}
      />
      {oidcName && (
        <>
          <div className="text-muted-foreground flex items-center gap-3 text-sm">
            <Separator className="flex-1" />
            {tr("auth.setup.or")} <Separator className="flex-1" />
          </div>
          <a
            href={oidcStartPath("sign-in", "/?settings=libraries")}
            className={buttonVariants({
              variant: "outline",
              size: "lg",
            })}
          >
            <LogInIcon />
            {tr("auth.setup.adminOidc", { provider: oidcName })}
          </a>
        </>
      )}
    </>
  )
}
