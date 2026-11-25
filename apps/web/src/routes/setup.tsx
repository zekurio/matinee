import { AUTH_ERROR_QUERY_KEY, oidcStartPath } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/solid-router"
import { LogIn } from "lucide"
import { createSignal, Match, Show, Switch } from "solid-js"

import { AuthScreen } from "@/components/auth-screen"
import { FormAlert } from "@/components/form-alert"
import { SetupSteps, type SetupStep } from "@/components/setup-steps"
import { UsernamePasskeyForm } from "@/components/username-passkey-form"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { toast } from "@/kit/toast"
import { createForm } from "@/lib/form"
import { SubmitButton, TextField } from "@/lib/form-fields"
import { signUpWithPasskey } from "@/lib/passkey"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { useAuthErrorToast } from "@/lib/use-auth-error-toast"

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
  const context = Route.useRouteContext()
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const setup = () => context().setup
  const [unlocked, setUnlocked] = createSignal(() => !setup().tokenRequired)
  useAuthErrorToast(() => search()[AUTH_ERROR_QUERY_KEY])

  const provider = () => context().config.oidc?.displayName ?? null

  return (
    <Switch>
      <Match when={!setup().accountRequired}>
        <SetupSteps steps={data().steps} />
      </Match>
      <Match when={setup().mode === null}>
        <AuthScreen title={tr("auth.setup.title")}>
          <FormAlert
            message={tr("auth.setup.noMethod")}
            hint={tr("auth.setup.noMethodHint")}
          />
        </AuthScreen>
      </Match>
      <Match when={setup().mode === "oidc" && provider()}>
        {(name) => (
          <AuthScreen
            title={tr("auth.setup.title")}
            description={tr("auth.setup.oidc", { provider: name() })}
          >
            <a
              href={oidcStartPath("sign-in", "/setup")}
              class={buttonVariants({ size: "lg" })}
            >
              <Icon icon={LogIn} />
              {tr("auth.setup.adminOidc", { provider: name() })}
            </a>
          </AuthScreen>
        )}
      </Match>
      <Match when={true}>
        <AuthScreen
          title={tr("auth.setup.title")}
          description={
            unlocked()
              ? tr("auth.setup.createAdmin")
              : tr("auth.setup.enterToken")
          }
        >
          <Show
            when={unlocked()}
            fallback={<SetupToken onUnlocked={() => setUnlocked(true)} />}
          >
            <CreateAdmin />
          </Show>
        </AuthScreen>
      </Match>
    </Switch>
  )
}

function SetupToken(props: { onUnlocked: () => void }) {
  const unlock = useMutation(() => ({
    mutationFn: (value: string) => client.auth.unlockSetup({ token: value }),
    onSuccess: () => props.onUnlocked(),
    onError: (error) => toast.error(errorMessage(error)),
  }))
  const form = createForm({
    defaultValues: { token: "" },
    // An empty token isn't sent, and isn't flagged either.
    onSubmit: async ({ token }) => {
      const value = token.trim()
      if (value) await unlock.mutate(value).catch(() => undefined)
    },
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
        name="token"
        id="setup-token"
        label={tr("auth.setup.token")}
        description={tr("auth.setup.tokenHint")}
        autocomplete="off"
        spellcheck={false}
        class="font-mono"
      />
      <SubmitButton form={form} size="lg" pending={unlock.isPending}>
        {tr("auth.setup.continue")}
      </SubmitButton>
    </form>
  )
}

function CreateAdmin() {
  const router = useRouter()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const signUp = useMutation(() => ({
    mutationFn: (username: string) => signUpWithPasskey(username),
    onSuccess: async (user) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
      await queryClient.invalidateQueries({ queryKey: orpc.auth.config.key() })
      // The same page goes on with the steps after the account.
      await navigate({ to: "/setup" })
      await router.invalidate()
    },
    onError: (error) => toast.error(errorMessage(error)),
  }))
  return (
    <UsernamePasskeyForm
      submitLabel={tr("auth.setup.adminPasskey")}
      onSubmit={async (username) => {
        // The mutation already displays the error in a toast.
        await signUp.mutate(username).catch(() => undefined)
      }}
    />
  )
}
