import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { useMutation, useQuery } from "@tanstack/solid-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router"
import { Show } from "solid-js"

import { AuthScreen } from "@/components/auth-screen"
import { useDocumentTitle } from "@/components/page-header"
import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
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

/** A screen that says how things stand, with what to do next. */
function StatusScreen(props: {
  title: string
  description: JSX.Element
  /** `Button`s, and links styled as one, the main one first. */
  actions?: JSX.Element
}) {
  return (
    <AuthScreen title={props.title} description={props.description}>
      <Show when={props.actions}>
        <div class="grid gap-2">{props.actions}</div>
      </Show>
    </AuthScreen>
  )
}

function JoinParty() {
  const params = Route.useParams()
  const navigate = useNavigate()
  const join = useMutation(() => ({
    mutationFn: () => client.party.join({ partyId: params().partyId }),
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
    onError: (cause: Error) =>
      toast.error(tr("party.join.failed"), {
        description: errorMessage(cause),
      }),
  }))
  const invite = useQuery(() => ({
    ...orpc.party.invite.queryOptions({
      input: { partyId: params().partyId },
    }),
    // Over, or not for this account: asking again says the same.
    retry: false,
  }))
  const data = () => (invite.isSuccess ? invite.data : undefined)
  // The party's name in the tab, or "Watch party" for one without.
  useDocumentTitle(() => {
    const current = data()
    return current && (current.name ?? tr("party.title"))
  })
  return (
    <Show
      when={!invite.isPending}
      fallback={
        <div class="grid min-h-dvh place-items-center">
          <Spinner class="size-8" />
        </div>
      }
    >
      <Show
        when={data()}
        fallback={
          <StatusScreen
            title={tr("party.join.over")}
            description={tr("party.join.overDescription")}
            actions={
              // A link styled as a button, so it stays a link to a screen reader.
              <Link to="/" class={cn(buttonVariants({ size: "lg" }))}>
                {tr("party.join.home")}
              </Link>
            }
          />
        }
      >
        {(current) => {
          const ownerName = () =>
            current().owner.displayName ?? current().owner.username
          const description = () =>
            tr("party.join.description", {
              people: tr("party.join.people", { count: current().members }),
            })
          return (
            <AuthScreen
              title={
                current().name
                  ? tr("party.join.titleNamed", { name: current().name ?? "" })
                  : tr("party.join.title", { owner: ownerName() })
              }
              description={
                current().name
                  ? tr("party.join.namedBy", {
                      owner: ownerName(),
                      description: description(),
                    })
                  : description()
              }
            >
              <div class="mt-6 grid gap-2">
                <Button
                  size="lg"
                  disabled={join.isPending}
                  onClick={() => join.mutate()}
                >
                  {tr("party.join.button")}
                </Button>
                <Link
                  to="/"
                  // Merged as `Button` does, or the base's transparent border
                  // wins over the outline's.
                  class={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  {tr("party.join.home")}
                </Link>
              </div>
            </AuthScreen>
          )
        }}
      </Show>
    </Show>
  )
}
