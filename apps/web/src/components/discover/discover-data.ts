import type { DiscoverRail } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { useQuery } from "@tanstack/react-query"

import { refKey } from "@/components/catalog/catalog-data"
import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"

import { type BrowseSearch, searchFor } from "./browse-params"

/*
 * Discover's rows: which ones this viewer gets, as the server lists them,
 * the cards of one, and where each row's heading leads: browsing its
 * first kind with the row's filters and sort, where it has one.
 */

export type Rail = t.infer<typeof DiscoverRail>
export type RailId = Rail["id"]

/** How many cards a row shows. Its heading leads to the rest. */
export const RAIL_CARDS = 20

/** Whether Discover is on and its rows, in order. */
export function railsOptions() {
  return orpc.discover.rails.queryOptions()
}

/**
 * Whether this viewer gets Discover. False while it's still unknown, so
 * a way in never shows and then vanishes.
 */
export function useDiscoverEnabled(): boolean {
  return useQuery(railsOptions()).data?.enabled ?? false
}

/** A row's cards, which the row on Discover shows. */
export function railRowOptions(rail: Rail) {
  return orpc.discover.row.queryOptions({
    input: { id: rail.id, seed: rail.seed },
  })
}

/** "Popular movies", or "Because you watched Dune". */
export function railName(rail: Pick<Rail, "id" | "seed">): string {
  if (rail.id === "becauseWatched") {
    return tr("discover.rail.becauseWatched", { name: rail.seed?.name ?? "" })
  }
  return tr(`discover.rail.${rail.id}`)
}

/** Tells rows apart, as a React key: there can be several "Because you watched". */
export function railKey(rail: Rail): string {
  return rail.seed ? `${rail.id}:${refKey(rail.seed.ref)}` : rail.id
}

/** Where a row's heading leads: its browse, of the first kind it holds. Nowhere without one. */
export function railLink({ browse }: Rail) {
  if (!browse) return null
  return {
    to: browse.kinds[0] === "show" ? "/discover/shows" : "/discover/movies",
    search: searchFor(browse),
  } satisfies {
    to: "/discover/movies" | "/discover/shows"
    search: BrowseSearch
  }
}
