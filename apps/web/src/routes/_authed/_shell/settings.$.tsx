import { createFileRoute } from "@tanstack/react-router"

import { Home } from "@/components/home"
import { prefetchHome } from "@/lib/home-queries"

// A settings address opened fresh, with no page of its own to sit over:
// the shell opens the dialog on the section the path names, over Home.
// Opened from a page, the same address is a mask over that page instead
// (see `lib/settings.ts`).
export const Route = createFileRoute("/_authed/_shell/settings/$")({
  loader: ({ context: { queryClient } }) => prefetchHome(queryClient),
  component: Home,
})
