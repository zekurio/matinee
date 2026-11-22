import { createFileRoute, redirect } from "@tanstack/react-router"

import { QueuePage } from "@/components/requests/queue-page"
import { RequestSearch } from "@/components/requests/request-filter"
import { runsQueue } from "@/lib/permissions"

/**
 * Everyone's requests in one list, for whoever runs the queue, kept to
 * the states and kind the URL names.
 */
export const Route = createFileRoute("/_authed/_shell/requests")({
  validateSearch: RequestSearch,
  beforeLoad: ({ context }) => {
    if (!runsQueue(context.user)) throw redirect({ to: "/" })
  },
  component: QueuePage,
})
