import type { AuthConfig, PendingOidcLink } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { KeyRoundIcon, LinkIcon, UserPlusIcon } from "lucide-react"

import { AuthScreen } from "@/components/auth-screen"
import { FormAlert } from "@/components/form-alert"
import { tr } from "@/i18n"
import { signInWithPasskey } from "@/lib/passkey"
import { safeRedirect } from "@/lib/redirect"
import { client, errorMessage, orpc } from "@/lib/rpc"

/** An OIDC sign-in the server holds for this browser until it's linked. */
export type PendingLink = PendingOidcLink & {
  provider: NonNullable<AuthConfig["oidc"]>
  /** Passkeys sign in. Off, signing in to the account can't link it. */
  passkeys: boolean
}

/**
 * Where an OIDC sign-in lands when its username claim names an existing
 * account. The server keeps that sign-in for this browser, so neither
 * linking it nor creating an account from it goes back to the provider.
 * Signed out, the page asks the person to sign in to the account, or with
 * passkeys off, which leaves no way to, offers only a new account. Signed in,
 * it links on a click and names the provider account, so someone else on a
 * shared browser can tell it isn't theirs.
 */
export function OidcLinkPage({
  link,
  redirect,
}: {
  link: PendingLink
  redirect: string
}) {
  const session = useQuery(orpc.auth.session.queryOptions())
  const user = session.data?.user
  if (user) {
    return (
      <LinkConfirm link={link} username={user.username} redirect={redirect} />
    )
  }
  return <LinkSignIn link={link} />
}

function LinkSignIn({ link }: { link: PendingLink }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const router = useRouter()
  const name = link.provider.displayName

  // Signing in stays on this page, which then asks to link.
  const passkey = useMutation({
    mutationFn: signInWithPasskey,
    onSuccess: (user) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
    },
  })

  const createAccount = useMutation({
    mutationFn: () => client.auth.oidc.pending.signUp(),
    onSuccess: async ({ user, redirect }) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
      await navigate({ href: safeRedirect(redirect), replace: true })
    },
    onError: async (error) => {
      toast.error(tr("link.oidc.createFailed"), {
        description: errorMessage(error),
      })
      // The server refuses while signed in, from another tab say, and a
      // failed attempt may have used the pending sign-in up. Look again.
      await queryClient.invalidateQueries({
        queryKey: orpc.auth.session.key(),
      })
      await router.invalidate()
    },
  })

  const busy =
    passkey.isPending || createAccount.isPending || createAccount.isSuccess

  if (!link.passkeys) {
    return (
      <AuthScreen
        title={tr("link.oidc.takenTitle")}
        description={tr("link.oidc.takenDescription", { provider: name })}
      >
        {link.provider.allowSignUp && (
          <Button
            size="lg"
            disabled={busy}
            onClick={() => createAccount.mutate()}
          >
            {createAccount.isPending ? <Spinner /> : <UserPlusIcon />}
            {tr("link.oidc.createAccount")}
          </Button>
        )}
      </AuthScreen>
    )
  }
  return (
    <AuthScreen
      title={tr("link.oidc.signInTitle")}
      description={tr("link.oidc.signInDescription", { provider: name })}
    >
      <div className="flex flex-col gap-3">
        <Button size="lg" disabled={busy} onClick={() => passkey.mutate()}>
          {passkey.isPending ? <Spinner /> : <KeyRoundIcon />}
          {tr("link.oidc.passkey")}
        </Button>
        {passkey.error && <FormAlert message={errorMessage(passkey.error)} />}
        {link.provider.allowSignUp && (
          <p className="text-muted-foreground mt-3 text-center text-sm">
            {tr("link.oidc.notYours")}{" "}
            <Button
              variant="link"
              className="text-foreground h-auto p-0 font-medium"
              disabled={busy}
              onClick={() => createAccount.mutate()}
            >
              {tr("link.oidc.createAccount")}
            </Button>
          </p>
        )}
      </div>
    </AuthScreen>
  )
}

function LinkConfirm({
  link,
  username,
  redirect,
}: {
  link: PendingLink
  username: string
  redirect: string
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const router = useRouter()
  const name = link.provider.displayName

  const confirm = useMutation({
    mutationFn: () => client.auth.oidc.pending.link(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: orpc.account.oidc.key() })
      toast.success(tr("link.oidc.linked", { provider: name }))
      await navigate({ href: safeRedirect(result.redirect), replace: true })
    },
    onError: async (error) => {
      toast.error(tr("link.oidc.linkFailed"), {
        description: errorMessage(error),
      })
      // A failed attempt may have used the pending sign-in up.
      await router.invalidate()
    },
  })

  const skip = useMutation({
    // It expires on its own, so one left behind after a failure is harmless.
    mutationFn: () => client.auth.oidc.pending.discard().catch(() => undefined),
    onSettled: () => navigate({ href: redirect, replace: true }),
  })

  const busy =
    confirm.isPending || confirm.isSuccess || skip.isPending || skip.isSuccess

  return (
    <AuthScreen
      title={tr("link.oidc.link", { provider: name })}
      description={
        link.accountLabel
          ? tr("link.oidc.descriptionNamed", {
              username,
              provider: name,
              account: link.accountLabel,
            })
          : tr("link.oidc.description", { username, provider: name })
      }
    >
      <div className="flex flex-col gap-3">
        <Button size="lg" disabled={busy} onClick={() => confirm.mutate()}>
          {confirm.isPending ? <Spinner /> : <LinkIcon />}
          {tr("link.oidc.link", { provider: name })}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          disabled={busy}
          onClick={() => skip.mutate()}
        >
          {tr("link.oidc.notNow")}
        </Button>
      </div>
    </AuthScreen>
  )
}
