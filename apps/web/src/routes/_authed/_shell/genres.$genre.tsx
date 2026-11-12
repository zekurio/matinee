import { createFileRoute } from "@tanstack/react-router"

import { BrowsePage } from "@/components/browse/browse-page"
import { BrowseSearch } from "@/lib/browse-search"

export const Route = createFileRoute("/_authed/_shell/genres/$genre")({
  validateSearch: BrowseSearch,
  component: GenrePage,
})

function GenrePage() {
  const { genre } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <BrowsePage
      by="genre"
      name={genre}
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
