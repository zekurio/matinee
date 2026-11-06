import { AUTH_ERROR_QUERY_KEY, oidcStartPath } from "@matinee/contracts"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import { Separator } from "@matinee/ui/components/separator"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { KeyRoundIcon, LogInIcon } from "lucide-react"
import { z } from "zod"

import { AuthScreen } from "@/components/auth-screen"
import { FormAlert } from "@/components/form-alert"
import { UsernamePasskeyForm } from "@/components/username-passkey-form"
import { signInWithPasskey, signUpWithPasskey } from "@/lib/passkey"
import { safeRedirect } from "@/lib/redirect"
import { errorMessage, orpc } from "@/lib/rpc"

const LoginSearch = z.object({
  redirect: z.string().optional().catch(undefined),
  [AUTH_ERROR_QUERY_KEY]: z.string().optional().catch(undefined),
})

export const Route = createFileRoute("/login")({
  validateSearch: LoginSearch,
  beforeLoad: async ({ context, search }) => {
    const [{ user }, config] = await Promise.all([
      context.queryClient.ensureQueryData(orpc.auth.session.queryOptions()),
      context.queryClient.ensureQueryData(orpc.auth.config.queryOptions()),
    ])
    if (user) throw redirect({ href: safeRedirect(search.redirect) })
    if (config.setupRequired) throw redirect({ to: "/setup" })
    return { config }
  },
  component: LoginPage,
})

function LoginPage() {
  const { config } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const target = safeRedirect(search.redirect)

  const signedIn = async (
    user: Awaited<ReturnType<typeof signInWithPasskey>>,
  ) => {
    queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
    await navigate({ href: target })
  }

  const passkey = useMutation({
    mutationFn: signInWithPasskey,
    onSuccess: signedIn,
  })
  const signUp = useMutation({
    mutationFn: signUpWithPasskey,
    onSuccess: signedIn,
  })

  const error = passkey.error ?? null
  const authError = search[AUTH_ERROR_QUERY_KEY]

  return (
    <AuthScreen
      title="Sign in to Matinee"
      description="Use the passkey saved on this device or in your password manager."
    >
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          disabled={passkey.isPending}
          onClick={() => passkey.mutate()}
        >
          {passkey.isPending ? <Spinner /> : <KeyRoundIcon />}
          Sign in with a passkey
        </Button>
        {config.oidc && (
          <a
            href={oidcStartPath("sign-in", target)}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <LogInIcon />
            Continue with {config.oidc.displayName}
          </a>
        )}

        {authError && (
          <FormAlert
            message={authError}
            hint="Sign in with a passkey you registered on this server, or ask the server admin for access."
          />
        )}
        {error && <FormAlert message={errorMessage(error)} />}
        {config.passkeySignUp && (
          <>
            <div className="text-muted-foreground my-4 flex items-center gap-3 text-xs">
              <Separator className="flex-1" />
              New to this server?
              <Separator className="flex-1" />
            </div>
            <UsernamePasskeyForm
              submitLabel="Create account with a passkey"
              pending={signUp.isPending}
              error={signUp.error}
              onSubmit={(username) => signUp.mutate(username)}
            />
          </>
        )}
      </div>
    </AuthScreen>
  )
}
