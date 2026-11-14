import { t } from "@matinee/contracts/schema"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { QueuePage } from "@/components/requests/queue-page"
import { QUEUE_LISTS } from "@/components/requests/request-queue"

/** Waiting is where the queue opens, so the URL leaves it out. */
const RequestsSearch = t.object({
  list: t.enum(QUEUE_LISTS).exclude(["waiting"]).optional().catch(undefined),
  /** Searches Done. */
  q: t.string().trim().min(1).max(256).optional().catch(undefined),
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
  const { list = "waiting", q } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <QueuePage
      list={list}
      query={list === "done" ? q : undefined}
      onList={(next) =>
        void navigate({
          search: { list: next === "waiting" ? undefined : next },
          replace: true,
          resetScroll: false,
        })
      }
      onQuery={(query) =>
        void navigate({
          search: (prev) => ({ ...prev, q: query }),
          replace: true,
          resetScroll: false,
        })
      }
    />
  )
}
