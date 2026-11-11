import { ORPCError } from "@matinee/client"
import { InviteToken } from "@matinee/contracts"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createFileRoute,
  Link,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router"
import { RefreshCwIcon } from "lucide-react"

import { AuthScreen } from "@/components/auth-screen"
import { FormAlert } from "@/components/form-alert"
import { UsernamePasskeyForm } from "@/components/username-passkey-form"
import { tr } from "@/i18n"
import { formatDateTime } from "@/lib/format"
import { signUpWithPasskey } from "@/lib/passkey"
import { errorMessage, orpc } from "@/lib/rpc"

const WIDE_BUTTON = buttonVariants({ size: "lg", className: "w-full" })

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
  const { config, signedInAs } = Route.useRouteContext()
  const hash = useLocation({ select: (location) => location.hash })

  // Someone with an account leaves the link for whoever it's meant for.
  if (signedInAs) {
    return (
      <AuthScreen
        title={tr("auth.invite.signedInTitle")}
        description={tr("auth.invite.signedInDescription", {
          username: signedInAs.username,
        })}
      >
        <Link to="/" className={WIDE_BUTTON}>
          {tr("auth.invite.continue")}
        </Link>
      </AuthScreen>
    )
  }
  if (!config.passkeys) {
    return (
      <AuthScreen
        title={tr("auth.invite.unusableTitle")}
        description={tr("auth.invite.passkeysOff")}
      >
        <SignInLink />
      </AuthScreen>
    )
  }
  const token = InviteToken.safeParse(hash)
  if (!token.success) return <BrokenLink />
  return <InviteSignUp key={token.data} token={token.data} />
}

function BrokenLink() {
  return (
    <AuthScreen
      title={tr("auth.invite.brokenTitle")}
      description={tr("auth.invite.brokenDescription")}
    >
      <SignInLink />
    </AuthScreen>
  )
}

function SignInLink() {
  return (
    <Link
      to="/login"
      // Merged as `Button` does, or the base's transparent border wins over
      // the outline's.
      className={cn(
        buttonVariants({
          variant: "outline",
          size: "lg",
          className: "w-full",
        }),
      )}
    >
      {tr("auth.invite.toSignIn")}
    </Link>
  )
}

/** The server turned the token down: used, revoked, expired, or garbled. */
const rejected = (error: Error) =>
  error instanceof ORPCError &&
  (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")

function InviteSignUp({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const checkOptions = orpc.auth.invite.check.queryOptions({
    input: { token },
  })
  const check = useQuery(checkOptions)

  const signUp = useMutation({
    mutationFn: (username: string) => signUpWithPasskey(username, token),
    onSuccess: async (user) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
      await navigate({ to: "/", replace: true })
    },
    // A cancelled prompt leaves the invite working, but someone may have
    // used or revoked it meanwhile. Asking again shows which.
    onError: (error) => {
      toast.error(errorMessage(error))
      return queryClient.invalidateQueries({ queryKey: checkOptions.queryKey })
    },
  })

  if (check.isPending) {
    return (
      <AuthScreen title={tr("auth.invite.checking")}>
        <Spinner className="text-muted-foreground mx-auto size-6" />
      </AuthScreen>
    )
  }
  if (check.isError) {
    if (rejected(check.error)) return <BrokenLink />
    return (
      <AuthScreen title={tr("auth.invite.checkFailed")}>
        <div className="flex flex-col gap-3">
          <FormAlert message={errorMessage(check.error)} />
          <Button
            variant="outline"
            size="lg"
            disabled={check.isFetching}
            onClick={() => void check.refetch()}
          >
            {check.isFetching ? <Spinner /> : <RefreshCwIcon />}
            {tr("auth.invite.retry")}
          </Button>
        </div>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      title={tr("auth.invite.title")}
      description={tr("auth.invite.description", {
        date: formatDateTime(check.data.expiresAt),
      })}
    >
      <UsernamePasskeyForm
        submitLabel={tr("auth.signIn.createAccount")}
        pending={signUp.isPending || signUp.isSuccess}
        onSubmit={(username) => signUp.mutate(username)}
      />
    </AuthScreen>
  )
}
