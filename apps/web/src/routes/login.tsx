import {
  AUTH_ERROR_QUERY_KEY,
  type AuthConfig,
  OIDC_LINK_QUERY_KEY,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { AuthScreen } from "@/components/auth-screen"
import { PublicLoginBackdrop } from "@/components/login-backdrop"
import { OidcLinkPage, type PendingLink } from "@/components/oidc-link-page"
import { SignInForm } from "@/components/sign-in-form"
import { tr } from "@/i18n"
import { safeRedirect } from "@/lib/redirect"
import { client, orpc } from "@/lib/rpc"
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
  useAuthErrorToast(
    authError,
    config.passkeys
      ? tr("auth.signIn.errorHint")
      : tr("auth.signIn.errorHintSso"),
  )

  return (
    <AuthScreen
      title={tr("auth.signIn.title")}
      backdrop={<PublicLoginBackdrop settings={config.loginBackdrop} />}
    >
      <SignInForm config={config} target={target} />
    </AuthScreen>
  )
}
