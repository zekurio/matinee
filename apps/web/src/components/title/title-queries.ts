import type { Title } from "@matinee/contracts"
import {
  type QueryClient,
  QueryObserver,
  type QueryObserverResult,
  useQueryClient,
} from "@tanstack/solid-query"
import { createMemo, from } from "solid-js"

import { orpc } from "@/lib/rpc"

/** The current season on first arrival, including specials or ungrouped files. */
export function initialSeason(title: Pick<Title, "seasons" | "next">) {
  return (
    title.seasons.find(
      (season) => season.number === title.next?.seasonNumber,
    ) ?? title.seasons[0]
  )
}

export function titleOptions(id: string) {
  return orpc.titles.get.queryOptions({ input: { id } })
}

/**
 * Keep the last title visible through refetches. The Solid Query RC's
 * async data projection can restart on successive mutation invalidations.
 */
export function useTitle(id: () => string) {
  const queryClient = useQueryClient()
  return createMemo(() => {
    const options = titleOptions(id())
    return from<QueryObserverResult<Title>>((next) => {
      const observer = new QueryObserver(queryClient, options)
      const unsubscribe = observer.subscribe(next)
      next(observer.getCurrentResult())
      return unsubscribe
    })
  })
}

export function seasonItemsOptions(id: string, season: number | null) {
  return orpc.titles.items.queryOptions({ input: { id, season } })
}

export async function preloadTitle(queryClient: QueryClient, id: string) {
  const options = titleOptions(id)
  const title = await queryClient
    .ensureQueryData({
      ...options,
      revalidateIfStale: true,
    })
    .catch(() => undefined)
  const season = title?.kind === "show" ? initialSeason(title) : undefined
  if (season)
    await queryClient.prefetchQuery(seasonItemsOptions(id, season.number))
}
