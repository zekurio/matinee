import type { QueryClient } from "@tanstack/react-query"

import { orpc } from "@/lib/rpc"

import { onlySeason } from "./seasons"

/** Shared by the title's pages and the loaders that start their calls. */
export function titleOptions(id: string) {
  return orpc.titles.get.queryOptions({ input: { id } })
}

/** One season's files, `null` for those without a season. */
export function seasonItemsOptions(id: string, season: number | null) {
  return orpc.titles.items.queryOptions({ input: { id, season } })
}

/**
 * Starts the title page's calls: the title, and for a show with one season
 * its episodes as soon as the title says so, rather than after the page
 * has rendered it.
 */
export async function preloadTitle(queryClient: QueryClient, id: string) {
  const options = titleOptions(id)
  await queryClient.prefetchQuery(options)
  const title = queryClient.getQueryData(options.queryKey)
  const only = title && onlySeason(title)
  if (only) {
    await queryClient.prefetchQuery(seasonItemsOptions(id, only.number))
  }
}
