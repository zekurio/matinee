import { createFileRoute } from "@tanstack/react-router"

import { KindPage, kindPageLoader } from "@/components/browse/kind-page"
import { KindSearch } from "@/lib/browse-search"
import { reloadOnEnter } from "@/lib/route-loading"

export const Route = createFileRoute("/_authed/_shell/movies")({
  validateSearch: KindSearch,
  loaderDeps: ({ search }) => search,
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient }, deps }) =>
    kindPageLoader(queryClient, "movie", deps),
  component: MoviesPage,
})

function MoviesPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <KindPage
      kind="movie"
      search={search}
      update={(patch) =>
        void navigate({
          search: (prev) => ({ ...prev, ...patch }),
          replace: true,
        })
      }
    />
  )
}
