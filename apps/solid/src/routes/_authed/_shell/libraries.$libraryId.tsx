import { t } from "@matinee/contracts/schema"
import { createFileRoute } from "@tanstack/solid-router"

import { LibraryPage } from "@/components/library/library-page"
import { titleListSearch } from "@/components/library/title-filter-params"
import {
  libraryTitlesOptions,
  preloadInput,
  titleFilterOptionsQuery,
} from "@/components/library/title-queries"
import { reloadOnEnter } from "@/lib/route-loading"
import { orpc } from "@/lib/rpc"

/** A library's titles' filters and order. */
const LibrarySearch = t.object(titleListSearch)

export const Route = createFileRoute("/_authed/_shell/libraries/$libraryId")({
  validateSearch: LibrarySearch,
  loaderDeps: ({ search }) => search,
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient }, params: { libraryId }, deps }) => {
    void queryClient.prefetchQuery(
      orpc.libraries.get.queryOptions({ input: { id: libraryId } }),
    )
    void queryClient.prefetchQuery(titleFilterOptionsQuery({ libraryId }))
    const input = preloadInput(deps)
    if (input)
      void queryClient.prefetchInfiniteQuery(
        libraryTitlesOptions(libraryId, input),
      )
  },
  component: LibraryPage,
})
