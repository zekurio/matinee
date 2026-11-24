import { createFileRoute } from "@tanstack/solid-router"

import { NotPorted } from "@/components/not-ported"

export const Route = createFileRoute("/_authed/_shell/people/$name")({
  component: () => <NotPorted page="Person" />,
})
