import { createFileRoute } from "@tanstack/solid-router"

import { prefetchHome } from "@/lib/home-queries"
import { reloadOnEnter } from "@/lib/route-loading"

export const Route = createFileRoute("/_authed/_shell/")({
  // On hover over a link home, and on the way there.
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient } }) => prefetchHome(queryClient),
  // The shell draws Home and keeps it between visits.
  component: () => null,
})
