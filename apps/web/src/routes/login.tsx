import {
  AUTH_ERROR_QUERY_KEY,
  type AuthConfig,
  OIDC_LINK_QUERY_KEY,
  oidcStartPath,
  type PluginAuthProvider,
  pluginAuthStartPath,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import { Separator } from "@matinee/ui/components/separator"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { KeyRoundIcon, LogInIcon } from "lucide-react"
import { useState } from "react"

import { AuthScreen } from "@/components/auth-screen"
import { FormAlert } from "@/components/form-alert"
import { OidcLinkPage, type PendingLink } from "@/components/oidc-link-page"
import { PluginCredentialsForm } from "@/components/plugin-credentials-form"
import { UsernamePasskeyForm } from "@/components/username-passkey-form"
import { tr } from "@/i18n"
import { signInWithPasskey, signUpWithPasskey } from "@/lib/passkey"
import { safeRedirect } from "@/lib/redirect"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { useAuthErrorToast } from "@/lib/use-auth-error-toast"

const LoginSearch = t.object({
  redirect: t.string().optional().catch(undefined),
  [AUTH_ERROR_QUERY_KEY]: t.string().optional().catch(undefined),
  [OIDC_LINK_QUERY_KEY]: t.string().optional().catch(undefined),
})

/**
 * The OIDC sign-in this browser holds for linking, if any. The callback adds
 * the link param when it keeps one, but only the server knows whether it
 * exists, so a crafted link URL shows the normal login page.
 */
async function loadPendingLink(
  config: AuthConfig,
  requested: boolean,
): Promise<PendingLink | null> {
  if (!requested || !config.oidc) return null
  const pending = await client.auth.oidc.pending.get().catch(() => null)
  return pending
    ? { ...pending, provider: config.oidc, passkeys: config.passkeys }
    : null
}

export const Route = createFileRoute("/login")({
  validateSearch: LoginSearch,
  beforeLoad: async ({ context, search }) => {
    const [{ user }, config] = await Promise.all([
      context.queryClient.ensureQueryData(orpc.auth.session.queryOptions()),
      context.queryClient.ensureQueryData(orpc.auth.config.queryOptions()),
    ])
    const pendingLink = await loadPendingLink(
      config,
      search[OIDC_LINK_QUERY_KEY] !== undefined,
    )
    // A signed-in user confirms the pending link on this page.
    if (pendingLink) return { config, pendingLink }
    if (user) throw redirect({ href: safeRedirect(search.redirect) })
    if (config.setup?.accountRequired) throw redirect({ to: "/setup" })
    return { config, pendingLink: null }
  },
  component: LoginPage,
})

function LoginPage() {
  const { config, pendingLink } = Route.useRouteContext()
  const search = Route.useSearch()
  const target = safeRedirect(search.redirect)
  if (pendingLink) return <OidcLinkPage link={pendingLink} redirect={target} />
  return (
    <SignInPage
      config={config}
      target={target}
      authError={search[AUTH_ERROR_QUERY_KEY]}
    />
  )
}

function SignInPage({
  config,
  target,
  authError,
}: {
  config: AuthConfig
  target: string
  authError: string | undefined
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const signedIn = async (
    user: Awaited<ReturnType<typeof signInWithPasskey>>,
  ) => {
    queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
    await navigate({ href: target })
  }

  useAuthErrorToast(
    authError,
    config.passkeys
      ? tr("auth.signIn.errorHint")
      : tr("auth.signIn.errorHintSso"),
  )

  const passkey = useMutation({
    mutationFn: signInWithPasskey,
    onSuccess: signedIn,
    onError: (error) => toast.error(errorMessage(error)),
  })
  const signUp = useMutation({
    mutationFn: (username: string) => signUpWithPasskey(username),
    onSuccess: signedIn,
    onError: (error) => toast.error(errorMessage(error)),
  })

  const redirects = config.providers.filter((p) => p.kind === "redirect")
  const credentials = config.providers.filter((p) => p.kind === "credentials")
  // A plugin's form on its own is the only way in, so it shows at once.
  const onlyForm =
    !config.passkeys &&
    !config.oidc &&
    redirects.length === 0 &&
    credentials.length === 1
      ? (credentials[0] ?? null)
      : null
  const [openForm, setOpenForm] = useState<string | null>(null)
  const formProvider =
    onlyForm ?? credentials.find((p) => p.key === openForm) ?? null
  // Each way in gets the filled style until one before it took it.
  const primary = (index: number) =>
    !config.passkeys && !config.oidc && index === 0 ? "default" : "outline"

  return (
    <AuthScreen
      title={
        onlyForm
          ? tr("auth.signIn.withProvider", { provider: onlyForm.name })
          : tr("auth.signIn.title")
      }
    >
      <div className="flex flex-col gap-3">
        {formProvider ? (
          <CredentialsSignIn
            // A new provider starts with empty fields.
            key={formProvider.key}
            provider={formProvider}
            onSignedIn={signedIn}
            onCancel={onlyForm ? undefined : () => setOpenForm(null)}
          />
        ) : (
          <>
            {config.passkeys && (
              <Button
                size="lg"
                disabled={passkey.isPending}
                onClick={() => passkey.mutate()}
              >
                {passkey.isPending ? <Spinner /> : <KeyRoundIcon />}
                {tr("auth.signIn.passkey")}
              </Button>
            )}
            {config.oidc && (
              <a
                href={oidcStartPath("sign-in", target)}
                className={cn(
                  buttonVariants({
                    variant: config.passkeys ? "outline" : "default",
                    size: "lg",
                  }),
                )}
              >
                <LogInIcon />
                {tr("auth.signIn.oidc", { provider: config.oidc.displayName })}
              </a>
            )}
            {redirects.map((provider, index) => (
              <a
                key={provider.key}
                href={pluginAuthStartPath(provider.key, "sign-in", target)}
                className={cn(
                  buttonVariants({
                    variant: primary(index),
                    size: "lg",
                  }),
                )}
              >
                <LogInIcon />
                <span className="truncate">
                  {tr("auth.signIn.oidc", { provider: provider.name })}
                </span>
              </a>
            ))}
            {credentials.map((provider, index) => (
              <Button
                key={provider.key}
                size="lg"
                variant={primary(redirects.length + index)}
                onClick={() => setOpenForm(provider.key)}
              >
                <LogInIcon />
                <span className="truncate">
                  {tr("auth.signIn.withProvider", { provider: provider.name })}
                </span>
              </Button>
            ))}
            {!config.passkeys &&
              !config.oidc &&
              config.providers.length === 0 && (
                <FormAlert message={tr("auth.signIn.noMethod")} />
              )}
          </>
        )}

        {config.passkeySignUp && !formProvider && (
          <>
            <div className="text-muted-foreground my-4 flex items-center gap-3 text-xs">
              <Separator className="flex-1" />
              {tr("auth.signIn.newHere")}
              <Separator className="flex-1" />
            </div>
            <UsernamePasskeyForm
              submitLabel={tr("auth.signIn.createAccount")}
              pending={signUp.isPending}
              onSubmit={(username) => signUp.mutate(username)}
            />
          </>
        )}
      </div>
    </AuthScreen>
  )
}

/** Sign in with the fields a plugin's provider asks for. */
function CredentialsSignIn({
  provider,
  onSignedIn,
  onCancel,
}: {
  provider: PluginAuthProvider
  onSignedIn: (user: Awaited<ReturnType<typeof signInWithPasskey>>) => void
  onCancel?: () => void
}) {
  const signIn = useMutation({
    mutationFn: (fields: Record<string, string>) =>
      client.auth.plugin.signIn({ key: provider.key, fields }),
    onSuccess: onSignedIn,
  })
  return (
    <PluginCredentialsForm
      provider={provider}
      // The button names the provider, so it's clear whose username and
      // password the fields want.
      submitLabel={tr("auth.signIn.withProvider", { provider: provider.name })}
      pending={signIn.isPending}
      error={signIn.isError ? errorMessage(signIn.error) : null}
      onSubmit={(fields) => signIn.mutate(fields)}
      focusOnMount={onCancel !== undefined}
      onCancel={
        onCancel && { label: tr("auth.signIn.otherWays"), run: onCancel }
      }
    />
  )
}
