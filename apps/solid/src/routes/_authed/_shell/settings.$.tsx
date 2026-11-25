import { createFileRoute } from "@tanstack/solid-router"

import { prefetchHome } from "@/lib/home-queries"
import { reloadOnEnter } from "@/lib/route-loading"

// A settings address opened fresh, with no page of its own to sit over:
// the shell opens the dialog on the section the path names, over Home,
// which it draws and keeps as it does for `/`. Opened from a page, the
// same address is a mask over that page instead (see `lib/settings.ts`).
export const Route = createFileRoute("/_authed/_shell/settings/$")({
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient } }) => prefetchHome(queryClient),
  component: () => null,
})
