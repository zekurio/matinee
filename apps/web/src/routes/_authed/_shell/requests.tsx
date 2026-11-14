import { t } from "@matinee/contracts/schema"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { QueuePage } from "@/components/requests/queue-page"
import { QUEUE_LISTS } from "@/components/requests/request-queue"

/** Waiting is where the queue opens, so the URL leaves it out. */
const RequestsSearch = t.object({
  list: t.enum(QUEUE_LISTS).exclude(["waiting"]).optional().catch(undefined),
})

/** The admin's queue of requests. Nobody else has one. */
export const Route = createFileRoute("/_authed/_shell/requests")({
  validateSearch: RequestsSearch,
  beforeLoad: ({ context }) => {
    if (context.user.role !== "admin") throw redirect({ to: "/" })
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
