import { createFileRoute, redirect } from "@tanstack/react-router"

import { railsOptions } from "@/components/discover/discover-data"
import { RailGridPage } from "@/components/discover/rail-grid"
import { reloadOnEnter } from "@/lib/route-loading"

/**
 * One of Discover's rows in full, opened from its heading. The popular
 * rows' headings open browsing instead, and their old addresses lead
 * there too.
 */
export const Route = createFileRoute("/_authed/_shell/discover/$rail")({
  beforeLoad: ({ params }) => {
    if (params.rail === "popular-movies") {
      throw redirect({ to: "/discover/movies", replace: true })
    }
    if (params.rail === "popular-shows") {
      throw redirect({ to: "/discover/shows", replace: true })
    }
  },
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient } }) =>
    void queryClient.prefetchQuery(railsOptions()),
  component: RailRoute,
})

function RailRoute() {
  const { rail } = Route.useParams()
  return <RailGridPage slug={rail} />
}
