import { Button, buttonVariants } from "@matinee/ui/components/button"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"

import { AuthScreen } from "@/components/auth-screen"
import { tr } from "@/i18n"
import { partyPosition, setParty } from "@/lib/party"
import { client, errorMessage, orpc } from "@/lib/rpc"

/**
 * Where a watch party's invite link lands. It asks before joining, so
 * opening a link someone sent doesn't pull the account out of the party
 * it's in.
 */
export const Route = createFileRoute("/_authed/party/$partyId")({
  component: JoinParty,
})

function JoinParty() {
  const { partyId } = Route.useParams()
  const navigate = useNavigate()
  const join = useMutation({
    mutationFn: () => client.party.join({ partyId }),
    onSuccess: (party) => {
      setParty(party)
      // Straight into what the party watches, where it is by now.
      if (party.item && party.playback) {
        return navigate({
          to: "/watch/$itemId",
          params: { itemId: party.item.id },
          search: {
            start: Math.floor(
              partyPosition(party.playback, party.now.getTime() - Date.now()),
            ),
          },
          replace: true,
        })
      }
      return navigate({ to: "/", replace: true })
    },
    onError: (cause) =>
      toast.error(tr("party.join.failed"), {
        description: errorMessage(cause),
      }),
  })
  const invite = useQuery({
    ...orpc.party.invite.queryOptions({ input: { partyId } }),
    // Over, or not for this account: asking again says the same.
    retry: false,
  })
  const home = (
    <Link to="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
      {tr("party.join.home")}
    </Link>
  )
  if (invite.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="size-8" />
      </div>
    )
  }
  if (!invite.data) {
    return (
      <AuthScreen
        title={tr("party.join.over")}
        description={tr("party.join.overDescription")}
      >
        <div className="mt-6 grid">{home}</div>
      </AuthScreen>
    )
  }
  const { name, owner, members } = invite.data
  const ownerName = owner.displayName ?? owner.username
  return (
    <AuthScreen
      title={
        name
          ? tr("party.join.titleNamed", { name })
          : tr("party.join.title", { owner: ownerName })
      }
      description={[
        name ? tr("party.join.namedBy", { owner: ownerName }) : null,
        tr("party.join.people", { count: members }),
        tr("party.join.description"),
      ]
        .filter((part) => part !== null)
        .join(" ")}
    >
      <div className="mt-6 grid gap-2">
        <Button
          size="lg"
          disabled={join.isPending}
          onClick={() => join.mutate()}
        >
          {tr("party.join.button")}
        </Button>
        {home}
      </div>
    </AuthScreen>
  )
}
