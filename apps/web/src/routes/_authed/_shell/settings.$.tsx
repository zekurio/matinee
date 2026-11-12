import { createFileRoute } from "@tanstack/react-router"

import { Home } from "@/components/home"
import { ensureHome } from "@/lib/home-queries"
import { reloadOnEnter } from "@/lib/route-loading"

// A settings address opened fresh, with no page of its own to sit over:
// the shell opens the dialog on the section the path names, over Home.
// Opened from a page, the same address is a mask over that page instead
// (see `lib/settings.ts`).
export const Route = createFileRoute("/_authed/_shell/settings/$")({
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient } }) => ensureHome(queryClient),
  component: Home,
})
