import { ORPCError } from "@matinee/client"
import {
  AUTH_ERROR_QUERY_KEY,
  type Invite,
  type InviteKind,
  InviteToken,
  OIDC_INVITE_PATH,
} from "@matinee/contracts"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import { Separator } from "@matinee/ui/components/separator"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { KeyRoundIcon, LogInIcon, RefreshCwIcon } from "lucide-react"
import { z } from "zod"

import { AuthScreen } from "@/components/auth-screen"
import { FormAlert } from "@/components/form-alert"
import { formatRelative } from "@/lib/format"
import { acceptInviteWithPasskey } from "@/lib/passkey"
import { errorMessage, orpc } from "@/lib/rpc"

const InviteSearch = z.object({
  /** A failed OIDC round trip, sent back here to try again. */
  [AUTH_ERROR_QUERY_KEY]: z.string().optional().catch(undefined),
})

/** An invite or recovery link an admin made. Opening it uses nothing up. */
export const Route = createFileRoute("/invite/$token")({
  validateSearch: InviteSearch,
  beforeLoad: async ({ context }) => {
    const config = await context.queryClient.ensureQueryData(
      orpc.auth.config.queryOptions(),
    )
    return { config }
  },
  component: InvitePage,
})

function InvitePage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const wellFormed = InviteToken.safeParse(token)

  const accept = useMutation({
    mutationFn: async (kind: InviteKind) => ({
      kind,
      user: await acceptInviteWithPasskey(token),
    }),
    onSuccess: async ({ kind, user }) => {
      // The browser may have been signed in as someone else.
      queryClient.clear()
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
      if (kind === "recovery") {
        toast.success(
          "Added a passkey. Remove the one you lost from your account.",
        )
        await navigate({ to: "/", search: { settings: "account" } })
      } else {
        await navigate({ to: "/" })
      }
    },
  })
  const invite = useQuery({
    ...orpc.auth.invite.get.queryOptions({ input: { token } }),
    // Once used, the link is gone; asking again would only say so.
    enabled: wellFormed.success && !accept.isSuccess,
    staleTime: 0,
  })

  if (!wellFormed.success) {
    return (
      <LinkGone
        message={
          wellFormed.error.issues[0]?.message ?? "This link is incomplete."
        }
      />
    )
  }
  if (accept.isSuccess) {
    return (
      <AuthScreen title="Signing you in">
        <Spinner className="size-5" />
      </AuthScreen>
    )
  }
  if (invite.isPending) {
    return (
      <AuthScreen title="Opening your link">
        <Skeleton className="h-10 rounded-lg" />
      </AuthScreen>
    )
  }
  if (invite.isError) {
    if (
      invite.error instanceof ORPCError &&
      invite.error.code === "NOT_FOUND"
    ) {
      return <LinkGone message={errorMessage(invite.error)} />
    }
    return (
      <AuthScreen
        title="Couldn't open this link"
        description={errorMessage(invite.error)}
      >
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => void invite.refetch()}
        >
          <RefreshCwIcon />
          Try again
        </Button>
      </AuthScreen>
    )
  }
  return (
    <AcceptInvite
      token={token}
      invite={invite.data}
      pending={accept.isPending}
      error={accept.error}
      onPasskey={() => accept.mutate(invite.data.kind)}
    />
  )
}

function AcceptInvite({
  token,
  invite,
  pending,
  error,
  onPasskey,
}: {
  token: string
  invite: Invite
  pending: boolean
  error: Error | null
  onPasskey: () => void
}) {
  const { config } = Route.useRouteContext()
  const search = Route.useSearch()
  const session = useQuery(orpc.auth.session.queryOptions())
  const current = session.data?.user
  const otherAccount =
    current && current.username.toLowerCase() !== invite.username.toLowerCase()
  const authError = search[AUTH_ERROR_QUERY_KEY]
  const recovery = invite.kind === "recovery"

  return (
    <AuthScreen
      title={recovery ? "Get back into Matinee" : "Welcome to Matinee"}
      description={
        recovery ? (
          <>
            An admin sent this link so you can add a new passkey to{" "}
            <span className="text-foreground font-medium">
              {invite.username}
            </span>
            .
          </>
        ) : (
          <>
            An admin made the account{" "}
            <span className="text-foreground font-medium">
              {invite.username}
            </span>{" "}
            for you. Create a passkey to sign in to it.
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {authError && <FormAlert message={authError} />}
        {otherAccount && (
          <p className="text-muted-foreground text-[13px] leading-5">
            This browser is signed in as{" "}
            {current.displayName ?? current.username}. Finishing here signs it
            in as {invite.username} instead.
          </p>
        )}
        <Button size="lg" disabled={pending} onClick={onPasskey}>
          {pending ? <Spinner /> : <KeyRoundIcon />}
          {pending ? "Waiting for your device…" : "Create a passkey"}
        </Button>
        {error && <FormAlert message={errorMessage(error)} />}
        {config.oidc && (
          <>
            <div className="text-muted-foreground my-1 flex items-center gap-3 text-sm">
              <Separator className="flex-1" />
              or
              <Separator className="flex-1" />
            </div>
            {/* A form post, so other sites can't start it. The redirect
                answers with no-referrer, so the provider never sees this
                page's URL and its token. */}
            <form method="post" action={OIDC_INVITE_PATH} className="flex">
              <input type="hidden" name="token" value={token} />
              <Button
                type="submit"
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={pending}
              >
                <LogInIcon />
                Continue with {config.oidc.displayName}
              </Button>
            </form>
          </>
        )}
        <p className="text-muted-foreground mt-3 text-[13px] leading-5">
          Your browser or password manager stores the passkey. The link works
          once and expires {formatRelative(invite.expiresAt)}.
        </p>
      </div>
    </AuthScreen>
  )
}

function LinkGone({ message }: { message: string }) {
  return (
    <AuthScreen title="This link no longer works" description={message}>
      <Link
        to="/login"
        className={buttonVariants({
          variant: "outline",
          size: "lg",
          className: "w-full",
        })}
      >
        Go to sign in
      </Link>
    </AuthScreen>
  )
}
