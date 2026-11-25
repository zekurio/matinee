import { ORPCError } from "@matinee/client"
import { InviteToken } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import {
  createFileRoute,
  Link,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/solid-router"
import { RefreshCw } from "lucide"
import { Match, Show, Switch } from "solid-js"

import { AuthScreen } from "@/components/auth-screen"
import { FormAlert } from "@/components/form-alert"
import { PublicLoginBackdrop } from "@/components/login-backdrop"
import { UsernamePasskeyForm } from "@/components/username-passkey-form"
import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { formatDateTime } from "@/lib/format"
import { signUpWithPasskey } from "@/lib/passkey"
import { errorMessage, orpc } from "@/lib/rpc"

const WIDE_BUTTON = cn(buttonVariants({ size: "lg" }), "w-full")

/**
 * Where an invite link from Settings → Users opens. The token is the URL's
 * fragment, so it never reaches the server's or a proxy's logs; the page
 * hands it to the server itself.
 */
export const Route = createFileRoute("/invite")({
  beforeLoad: async ({ context }) => {
    const [{ user }, config] = await Promise.all([
      context.queryClient.ensureQueryData(orpc.auth.session.queryOptions()),
      context.queryClient.ensureQueryData(orpc.auth.config.queryOptions()),
    ])
    if (!user && config.setup?.accountRequired) {
      throw redirect({ to: "/setup" })
    }
    // Read once: signing up puts the new user in the session, and the page
    // shouldn't turn into the signed-in one on its way to Home.
    return { config, signedInAs: user }
  },
  component: InvitePage,
})

function InvitePage() {
  const context = Route.useRouteContext()
  const hash = useLocation({ select: (location) => location.hash })
  const token = () => {
    const parsed = InviteToken.safeParse(hash())
    return parsed.success ? parsed.data : null
  }

  return (
    <Switch fallback={<BrokenLink />}>
      {/* Someone with an account leaves the link for whoever it's meant for. */}
      <Match when={context().signedInAs}>
        {(user) => (
          <InviteScreen
            title={tr("auth.invite.signedInTitle")}
            description={tr("auth.invite.signedInDescription", {
              username: user().username,
            })}
          >
            <Link to="/" class={WIDE_BUTTON}>
              {tr("auth.invite.continue")}
            </Link>
          </InviteScreen>
        )}
      </Match>
      <Match when={!context().config.passkeys}>
        <InviteScreen
          title={tr("auth.invite.unusableTitle")}
          description={tr("auth.invite.passkeysOff")}
        >
          <SignInLink />
        </InviteScreen>
      </Match>
      <Match when={token()} keyed>
        {(value) => <InviteSignUp token={value} />}
      </Match>
    </Switch>
  )
}

/** The auth screen over the server's login backdrop, as the login page shows it. */
function InviteScreen(props: {
  title: string
  description?: JSX.Element
  children?: JSX.Element
}) {
  const context = Route.useRouteContext()
  return (
    <AuthScreen
      title={props.title}
      description={props.description}
      backdrop={
        <PublicLoginBackdrop settings={context().config.loginBackdrop} />
      }
    >
      {props.children}
    </AuthScreen>
  )
}

function BrokenLink() {
  return (
    <InviteScreen
      title={tr("auth.invite.brokenTitle")}
      description={tr("auth.invite.brokenDescription")}
    >
      <SignInLink />
    </InviteScreen>
  )
}

function SignInLink() {
  return (
    <Link
      to="/login"
      class={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
    >
      {tr("auth.invite.toSignIn")}
    </Link>
  )
}

/** The server turned the token down: used, revoked, expired, or garbled. */
const rejected = (error: Error | null) =>
  error instanceof ORPCError &&
  (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")

function InviteSignUp(props: { token: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const checkOptions = () =>
    orpc.auth.invite.check.queryOptions({ input: { token: props.token } })
  const check = useQuery(checkOptions)

  const signUp = useMutation(() => ({
    mutationFn: (username: string) => signUpWithPasskey(username, props.token),
    onSuccess: async (user) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
      await navigate({ to: "/", replace: true })
    },
    // A cancelled prompt leaves the invite working, but someone may have
    // used or revoked it meanwhile. Asking again shows which.
    onError: (error) => {
      toast.error(errorMessage(error))
      return queryClient.invalidateQueries({
        queryKey: checkOptions().queryKey,
      })
    },
  }))

  return (
    <Switch>
      <Match when={check.isPending}>
        <InviteScreen title={tr("auth.invite.checking")}>
          <Spinner class="text-muted-foreground mx-auto size-6" />
        </InviteScreen>
      </Match>
      <Match when={check.isError && rejected(check.error)}>
        <BrokenLink />
      </Match>
      <Match when={check.isError}>
        <InviteScreen title={tr("auth.invite.checkFailed")}>
          <div class="flex flex-col gap-3">
            <FormAlert message={errorMessage(check.error)} />
            <Button
              variant="outline"
              size="lg"
              disabled={check.isFetching}
              onClick={() => void check.refetch()}
            >
              <Show
                when={check.isFetching}
                fallback={<Icon icon={RefreshCw} />}
              >
                <Spinner />
              </Show>
              {tr("auth.invite.retry")}
            </Button>
          </div>
        </InviteScreen>
      </Match>
      <Match when={check.data}>
        {(invite) => (
          <InviteScreen
            title={tr("auth.invite.title")}
            description={tr("auth.invite.description", {
              date: formatDateTime(invite().expiresAt),
            })}
          >
            <UsernamePasskeyForm
              submitLabel={tr("auth.signIn.createAccount")}
              onSubmit={async (username) => {
                // The mutation already displays the error in a toast.
                await signUp.mutate(username).catch(() => undefined)
              }}
            />
          </InviteScreen>
        )}
      </Match>
    </Switch>
  )
}
