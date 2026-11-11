import { createFileRoute } from "@tanstack/react-router"

import { Home } from "@/components/home"
import { prefetchHome } from "@/lib/home-queries"

export const Route = createFileRoute("/_authed/_shell/")({
  // On hover over a link home, and on the way there.
  loader: ({ context: { queryClient } }) => prefetchHome(queryClient),
  component: Home,
})
