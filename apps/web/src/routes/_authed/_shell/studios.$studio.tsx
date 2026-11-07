import { createFileRoute } from "@tanstack/react-router"

import { BrowsePage, BrowseSearch } from "@/components/browse/browse-page"

export const Route = createFileRoute("/_authed/_shell/studios/$studio")({
  validateSearch: BrowseSearch,
  component: StudioPage,
})

function StudioPage() {
  const { studio } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <BrowsePage
      by="studio"
      name={studio}
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
