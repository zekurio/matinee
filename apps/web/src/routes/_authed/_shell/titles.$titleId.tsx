import { createFileRoute } from "@tanstack/react-router"

import { TitlePage } from "@/components/title/title-page"
import { preloadTitle } from "@/components/title/title-queries"
import { reloadOnEnter } from "@/lib/route-loading"

export const Route = createFileRoute("/_authed/_shell/titles/$titleId")({
  // Starts the page's calls while its code loads, and on hover.
  shouldReload: reloadOnEnter,
  loader: ({ context, params }) => {
    void preloadTitle(context.queryClient, params.titleId)
  },
  component: TitlePage,
})
