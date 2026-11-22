import { createFileRoute, redirect } from "@tanstack/react-router"

import { QueuePage } from "@/components/requests/queue-page"
import { runsQueue } from "@/lib/permissions"

/** Everyone's requests in one list, for whoever runs the queue. */
export const Route = createFileRoute("/_authed/_shell/requests")({
  beforeLoad: ({ context }) => {
    if (!runsQueue(context.user)) throw redirect({ to: "/" })
  },
  component: QueuePage,
})
