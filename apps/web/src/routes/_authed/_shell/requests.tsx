import { t } from "@matinee/contracts/schema"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { QueuePage } from "@/components/requests/queue-page"
import { QUEUE_LISTS } from "@/components/requests/request-queue"
import { can } from "@/lib/permissions"

/** Waiting is where the queue opens, so the URL leaves it out. */
const RequestsSearch = t.object({
  list: t.enum(QUEUE_LISTS).exclude(["waiting"]).optional().catch(undefined),
})

/** The queue of everyone's requests, for whoever may read it. */
export const Route = createFileRoute("/_authed/_shell/requests")({
  validateSearch: RequestsSearch,
  beforeLoad: ({ context }) => {
    if (!can(context.user, "adminRequest.read")) throw redirect({ to: "/" })
  },
  component: RequestsRoute,
})

function RequestsRoute() {
  const { list = "waiting" } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <QueuePage
      list={list}
      onList={(next) =>
        void navigate({
          search: { list: next === "waiting" ? undefined : next },
          replace: true,
          resetScroll: false,
        })
      }
    />
  )
}
