import type { AuthConfig, PendingOidcLink } from "@matinee/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { useNavigate, useRouter } from "@tanstack/solid-router"
import { KeyRound, Link, UserPlus } from "lucide"
import { Show } from "solid-js"

import { AuthScreen } from "@/components/auth-screen"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { signInWithPasskey } from "@/lib/passkey"
import { safeRedirect } from "@/lib/redirect"
import { client, errorMessage, orpc } from "@/lib/rpc"

/** An OIDC sign-in the server holds for this browser until it's linked. */
export type PendingLink = PendingOidcLink & {
  provider: NonNullable<AuthConfig["oidc"]>
  passkeys: boolean
}

/** Offers to sign in or create an account, then asks before linking it. */
export function OidcLinkPage(props: { link: PendingLink; redirect: string }) {
  const session = useQuery(() => orpc.auth.session.queryOptions())
  return (
    <Show
      when={session.isSuccess && session.data?.user}
      fallback={<LinkSignIn link={props.link} />}
    >
      {(user) => (
        <LinkConfirm
          link={props.link}
          username={user().username}
          redirect={props.redirect}
        />
      )}
    </Show>
  )
}

function LinkSignIn(props: { link: PendingLink }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const router = useRouter()
  const name = () => props.link.provider.displayName

  // Signing in stays on this page, which then asks to link.
  const passkey = useMutation(() => ({
    mutationFn: signInWithPasskey,
    onSuccess: (user) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
    },
    onError: (error) => toast.error(errorMessage(error)),
  }))

  const createAccount = useMutation(() => ({
    mutationFn: () => client.auth.oidc.pending.signUp(),
    onSuccess: async ({ user, redirect }) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
      await navigate({ href: safeRedirect(redirect), replace: true })
    },
    onError: async (error) => {
      toast.error(tr("link.oidc.createFailed"), {
        description: errorMessage(error),
      })
      // The pending sign-in may have expired or another tab may have signed in.
      await queryClient.invalidateQueries({
        queryKey: orpc.auth.session.key(),
      })
      await router.invalidate()
    },
  }))

  const busy = () =>
    passkey.isPending || createAccount.isPending || createAccount.isSuccess

  return (
    <Show
      when={props.link.passkeys}
      fallback={
        <AuthScreen
          title={tr("link.oidc.takenTitle")}
          description={tr("link.oidc.takenDescription", { provider: name() })}
        >
          <Show when={props.link.provider.allowSignUp}>
            <Button
              size="lg"
              disabled={busy()}
              onClick={() => {
                void createAccount.mutate()
              }}
            >
              <Show
                when={createAccount.isPending}
                fallback={<Icon icon={UserPlus} />}
              >
                <Spinner />
              </Show>
              {tr("link.oidc.createAccount")}
            </Button>
          </Show>
        </AuthScreen>
      }
    >
      <AuthScreen
        title={tr("link.oidc.signInTitle")}
        description={tr("link.oidc.signInDescription", { provider: name() })}
      >
        <div class="flex flex-col gap-3">
          <Button
            size="lg"
            disabled={busy()}
            onClick={() => {
              void passkey.mutate()
            }}
          >
            <Show when={passkey.isPending} fallback={<Icon icon={KeyRound} />}>
              <Spinner />
            </Show>
            {tr("link.oidc.passkey")}
          </Button>
          <Show when={props.link.provider.allowSignUp}>
            <p class="text-muted-foreground mt-3 text-center text-sm">
              {tr("link.oidc.notYours")}{" "}
              <Button
                variant="link"
                class="text-foreground h-auto p-0 font-medium"
                disabled={busy()}
                onClick={() => {
                  void createAccount.mutate()
                }}
              >
                {tr("link.oidc.createAccount")}
              </Button>
            </p>
          </Show>
        </div>
      </AuthScreen>
    </Show>
  )
}

function LinkConfirm(props: {
  link: PendingLink
  username: string
  redirect: string
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const router = useRouter()
  const name = () => props.link.provider.displayName

  const confirm = useMutation(() => ({
    mutationFn: () => client.auth.oidc.pending.link(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: orpc.account.oidc.key() })
      toast.success(tr("link.oidc.linked", { provider: name() }))
      await navigate({ href: safeRedirect(result.redirect), replace: true })
    },
    onError: async (error) => {
      toast.error(tr("link.oidc.linkFailed"), {
        description: errorMessage(error),
      })
      await router.invalidate()
    },
  }))

  const skip = useMutation(() => ({
    // It expires on its own, so one left behind after a failure is harmless.
    mutationFn: () => client.auth.oidc.pending.discard().catch(() => undefined),
    onSettled: () => navigate({ href: props.redirect, replace: true }),
  }))

  const busy = () =>
    confirm.isPending || confirm.isSuccess || skip.isPending || skip.isSuccess

  return (
    <AuthScreen
      title={tr("link.oidc.link", { provider: name() })}
      description={
        props.link.accountLabel
          ? tr("link.oidc.descriptionNamed", {
              username: props.username,
              provider: name(),
              account: props.link.accountLabel,
            })
          : tr("link.oidc.description", {
              username: props.username,
              provider: name(),
            })
      }
    >
      <div class="flex flex-col gap-3">
        <Button
          size="lg"
          disabled={busy()}
          onClick={() => {
            void confirm.mutate()
          }}
        >
          <Show when={confirm.isPending} fallback={<Icon icon={Link} />}>
            <Spinner />
          </Show>
          {tr("link.oidc.link", { provider: name() })}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          disabled={busy()}
          onClick={() => {
            void skip.mutate()
          }}
        >
          {tr("link.oidc.notNow")}
        </Button>
      </div>
    </AuthScreen>
  )
}
