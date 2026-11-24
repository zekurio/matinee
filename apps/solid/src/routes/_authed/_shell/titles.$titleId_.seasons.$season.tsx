import { createFileRoute } from "@tanstack/solid-router"

import { NotPorted } from "@/components/not-ported"

export const Route = createFileRoute(
  "/_authed/_shell/titles/$titleId_/seasons/$season",
)({
  component: () => <NotPorted page="Season" />,
})
