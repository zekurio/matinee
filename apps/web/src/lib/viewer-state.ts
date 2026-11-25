import type { QueryClient } from "@tanstack/solid-query"

import { orpc } from "@/lib/rpc"

/** Titles and files carry the viewer's marks wherever they appear. */
export async function invalidateViewerState(queryClient: QueryClient) {
  const keys = [
    orpc.home.key(),
    orpc.media.list.key(),
    orpc.media.get.key(),
    orpc.media.shelf.key(),
    orpc.titles.key(),
    orpc.people.key(),
    orpc.search.key(),
    orpc.favorites.key(),
    orpc.profiles.key(),
    orpc.stats.key(),
  ]
  await Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}
