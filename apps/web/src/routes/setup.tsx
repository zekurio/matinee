import { AUTH_ERROR_QUERY_KEY, oidcStartPath } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { buttonVariants } from "@matinee/ui/components/button"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router"
import { LogInIcon } from "lucide-react"
import { useState } from "react"

import { AuthScreen } from "@/components/auth-screen"
import { FormAlert } from "@/components/form-alert"
import { SetupSteps, type SetupStep } from "@/components/setup-steps"
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
    // Always ask the server: setup moves on the moment the first account
    // exists, and ends when the admin finishes it.
    const config = await context.queryClient.fetchQuery(
      orpc.auth.config.queryOptions({ staleTime: 0 }),
    )
    const { setup } = config
    if (!setup) throw redirect({ to: "/" })
    if (setup.accountRequired) return { config, setup }
    // The rest of setup is the admin's.
    const { user } = await context.queryClient.ensureQueryData(
      orpc.auth.session.queryOptions(),
    )
    if (!user) throw redirect({ to: "/login", search: { redirect: "/setup" } })
    if (user.role !== "admin") throw redirect({ to: "/" })
    return { config, setup }
  },
  loader: async ({ context }): Promise<{ steps: SetupStep[] }> => {
    if (context.setup.accountRequired) return { steps: [] }
    const [transcoding, libraries] = await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.admin.transcoding.get.queryOptions(),
      ),
      context.queryClient.ensureQueryData(orpc.libraries.list.queryOptions()),
    ])
    // Skip what the server's configuration or an earlier visit covered.
    const steps: SetupStep[] = []
    if (!transcoding.environment.includes("hardwareAcceleration")) {
      steps.push("transcoding")
    }
    if (libraries.length === 0) steps.push("libraries")
    steps.push("done")
    return { steps }
  },
  component: SetupPage,
})

function SetupPage() {
  const { config, setup } = Route.useRouteContext()
  const { steps } = Route.useLoaderData()
  const search = Route.useSearch()
  const [unlocked, setUnlocked] = useState(!setup.tokenRequired)
  const authError = search[AUTH_ERROR_QUERY_KEY]

  if (!setup.accountRequired) return <SetupSteps steps={steps} />

  const provider = config.oidc?.displayName ?? null
  if (setup.mode === null) {
    return (
      <AuthScreen title={tr("auth.setup.title")}>
        <FormAlert
          message={tr("auth.setup.noMethod")}
          hint={tr("auth.setup.noMethodHint")}
        />
      </AuthScreen>
    )
  }
  if (setup.mode === "oidc" && provider) {
    return (
      <AuthScreen
        title={tr("auth.setup.title")}
        description={tr("auth.setup.oidc", { provider })}
      >
        <div className="flex flex-col gap-4">
          {authError && <FormAlert message={translateKnown(authError)} />}
          <a
            href={oidcStartPath("sign-in", "/setup")}
            className={buttonVariants({ size: "lg" })}
          >
            <LogInIcon />
            {tr("auth.setup.adminOidc", { provider })}
          </a>
        </div>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      title={tr("auth.setup.title")}
      description={
        unlocked ? tr("auth.setup.createAdmin") : tr("auth.setup.enterToken")
      }
    >
      <div className="flex flex-col gap-4">
        {authError && <FormAlert message={translateKnown(authError)} />}
        {unlocked ? (
          <CreateAdmin />
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

function CreateAdmin() {
  const router = useRouter()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const signUp = useMutation({
    mutationFn: signUpWithPasskey,
    onSuccess: async (user) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
      await queryClient.invalidateQueries({ queryKey: orpc.auth.config.key() })
      // The same page goes on with the steps after the account.
      await navigate({ to: "/setup" })
      await router.invalidate()
    },
  })
  return (
    <UsernamePasskeyForm
      submitLabel={tr("auth.setup.adminPasskey")}
      pending={signUp.isPending}
      error={signUp.error}
      onSubmit={(username) => signUp.mutate(username)}
    />
  )
}
