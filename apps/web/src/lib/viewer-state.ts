import type { WatchedAt } from "@matinee/contracts"
import type { QueryClient } from "@tanstack/react-query"

import { orpc } from "@/lib/rpc"

/** Something the user can turn on and off, as it should look right now. */
export type Toggle = { on: boolean; toggle: () => void }

/**
 * Whether the user watched something, as it should look right now, and a
 * way to mark it. `watchedAt` is as in `playback.setWatched`; unset is now.
 */
export type WatchedState = {
  on: boolean
  mark: (watched: boolean, watchedAt?: WatchedAt) => void
}

/**
 * Refetch everything that shows the signed-in user's own state. Titles and
 * files carry favorites and watch progress wherever they appear, and
 * statistics count the plays that marking a file watched adds.
 */
export function invalidateViewerState(queryClient: QueryClient) {
  const keys = [
    orpc.home.key(),
    orpc.media.key(),
    orpc.titles.key(),
    orpc.people.key(),
    orpc.search.key(),
    orpc.favorites.key(),
    orpc.profiles.key(),
    orpc.stats.key(),
  ]
  return Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}
