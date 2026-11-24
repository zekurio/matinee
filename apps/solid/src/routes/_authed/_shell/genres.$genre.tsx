import { createFileRoute } from "@tanstack/solid-router"

import { NotPorted } from "@/components/not-ported"

export const Route = createFileRoute("/_authed/_shell/genres/$genre")({
  component: () => <NotPorted page="Genre" />,
})
