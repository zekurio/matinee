import { createFileRoute, redirect } from "@tanstack/solid-router"

import { QueuePage } from "@/components/requests/queue-page"
import { RequestSearch } from "@/components/requests/request-filter"
import { can } from "@/lib/permissions"

/**
 * Everyone's requests in one list, for whoever may read the queue, kept to
 * the states and kind the URL names.
 */
export const Route = createFileRoute("/_authed/_shell/requests")({
  validateSearch: RequestSearch,
  beforeLoad: ({ context }) => {
    if (!can(context.user, "adminRequest.read")) throw redirect({ to: "/" })
  },
  component: QueuePage,
})
