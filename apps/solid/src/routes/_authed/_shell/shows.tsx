import { createFileRoute } from "@tanstack/solid-router"

import { KindPage, kindPageLoader } from "@/components/browse/kind-page"
import { KindSearch } from "@/lib/browse-search"
import { reloadOnEnter } from "@/lib/route-loading"

export const Route = createFileRoute("/_authed/_shell/shows")({
  validateSearch: KindSearch,
  loaderDeps: ({ search }) => search,
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient }, deps }) =>
    kindPageLoader(queryClient, "show", deps),
  component: ShowsPage,
})

function ShowsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <KindPage
      kind="show"
      search={search()}
      update={(patch) =>
        void navigate({
          search: (prev) => ({ ...prev, ...patch }),
          replace: true,
          resetScroll: false,
        })
      }
    />
  )
}
