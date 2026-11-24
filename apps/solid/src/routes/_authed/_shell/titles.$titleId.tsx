import { createFileRoute } from "@tanstack/solid-router"

import { TitlePage } from "@/components/title/title-page"
import { preloadTitle } from "@/components/title/title-queries"
import { reloadOnEnter } from "@/lib/route-loading"

export const Route = createFileRoute("/_authed/_shell/titles/$titleId")({
  shouldReload: reloadOnEnter,
  loader: ({ context, params }) => {
    void preloadTitle(context.queryClient, params.titleId)
  },
  component: TitleRoute,
})

function TitleRoute() {
  const params = Route.useParams()
  return <TitlePage titleId={params().titleId} />
}
