import { createFileRoute } from "@tanstack/solid-router"
import { Show } from "solid-js"

import { BrowsePage } from "@/components/browse/browse-page"
import { BrowseSearch } from "@/lib/browse-search"

export const Route = createFileRoute("/_authed/_shell/genres/$genre")({
  validateSearch: BrowseSearch,
  component: GenrePage,
})

function GenrePage() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  // Another genre is another page, with its own filters' choices.
  return (
    <Show when={params().genre} keyed>
      {(name) => (
        <BrowsePage
          by="genre"
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
