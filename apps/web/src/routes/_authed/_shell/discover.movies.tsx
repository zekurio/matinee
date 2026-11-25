import { createFileRoute } from "@tanstack/solid-router"

import { pageGutter } from "@/components/app-shell"
import {
  BrowsePage,
  browseOptionsQuery,
} from "@/components/discover/browse-page"
import { BrowseSearch } from "@/components/discover/browse-params"
import { reloadOnEnter } from "@/lib/route-loading"

/** All of TMDB's movies, with filters and a sort, from Discover. */
export const Route = createFileRoute("/_authed/_shell/discover/movies")({
  validateSearch: BrowseSearch,
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient } }) =>
    void queryClient.prefetchQuery(browseOptionsQuery("movie")),
  component: BrowseMovies,
})

function BrowseMovies() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <div class={[pageGutter, "pb-6 sm:pt-8"]}>
      <BrowsePage
        kind="movie"
        search={search()}
        navigate={(next) => void navigate({ search: next, replace: true })}
      />
    </div>
  )
}
