import { createFileRoute } from "@tanstack/solid-router"
import { Show } from "solid-js"

import { BrowsePage } from "@/components/browse/browse-page"
import { BrowseSearch } from "@/lib/browse-search"

export const Route = createFileRoute("/_authed/_shell/studios/$studio")({
  validateSearch: BrowseSearch,
  component: StudioPage,
})

function StudioPage() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  // Another studio is another page, with its own filters' choices.
  return (
    <Show when={params().studio} keyed>
      {(name) => (
        <BrowsePage
          by="studio"
          name={name}
          search={search()}
          update={(patch) =>
            void navigate({
              search: (prev) => ({ ...prev, ...patch }),
              replace: true,
            })
          }
        />
      )}
    </Show>
  )
}
