import { createFileRoute } from "@tanstack/solid-router"

import { NotPorted } from "@/components/not-ported"

export const Route = createFileRoute("/_authed/watch/$itemId")({
  component: () => <NotPorted page="Player" />,
})
