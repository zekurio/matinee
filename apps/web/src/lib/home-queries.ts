import type { QueryClient } from "@tanstack/react-query"

import { orpc } from "./rpc"

// The contract's cap. Twelve posters fit side by side on a wide monitor,
// which left nothing to scroll.
const SHELF = 24
const HERO_SLIDES = 6

/** Home's queries for what to watch, shared by the page and its prefetch. */
export const homeQueries = {
  resume: () =>
    orpc.home.continueWatching.queryOptions({ input: { limit: 12 } }),
  nextUp: () => orpc.home.nextUp.queryOptions({ input: { limit: 12 } }),
  // New and well-rated titles the user hasn't started, plus shows with a
  // new next episode. What the user is watching has its own rows.
  featured: () =>
    orpc.home.featured.queryOptions({ input: { limit: HERO_SLIDES } }),
  /** A library's latest, for its shelf. */
  shelf: (libraryId: string) =>
    orpc.media.shelf.queryOptions({ input: { libraryId, limit: SHELF } }),
}

/**
 * Starts Home's queries, for the page about to show it: its rows at once,
 * and each library's shelf as soon as the libraries are known, rather
 * than once the page has rendered.
 */
export function prefetchHome(queryClient: QueryClient) {
  void queryClient.prefetchQuery(homeQueries.resume())
  void queryClient.prefetchQuery(homeQueries.nextUp())
  void queryClient.prefetchQuery(homeQueries.featured())
  void prefetchShelves(queryClient)
}

async function prefetchShelves(queryClient: QueryClient) {
  const options = orpc.libraries.list.queryOptions()
  await queryClient.prefetchQuery(options)
  const libraries = queryClient.getQueryData(options.queryKey) ?? []
  await Promise.all(
    libraries.map((library) =>
      queryClient.prefetchQuery(homeQueries.shelf(library.id)),
    ),
  )
}
