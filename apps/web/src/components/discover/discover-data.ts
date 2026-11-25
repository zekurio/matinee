import type { DiscoverRail } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { useQuery } from "@tanstack/solid-query"

import { refKey } from "@/components/catalog/catalog-data"
import {
  type BrowseSearch,
  searchFor,
} from "@/components/discover/browse-params"
import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"

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
 * Whether this viewer gets Discover. False while it's still unknown, so a
 * way in never shows and then vanishes. Reads `isSuccess` first, so it
 * never waits on the query and never holds a boundary.
 */
export function useDiscoverEnabled(): () => boolean {
  const rails = useQuery(() => railsOptions())
  return () => rails.isSuccess && rails.data.enabled
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

/** Tells rows apart: there can be several "Because you watched". */
export function railKey(rail: Pick<Rail, "id" | "seed">): string {
  return rail.seed ? `${rail.id}:${refKey(rail.seed.ref)}` : rail.id
}

/** Where a row's heading leads: its browse, of the first kind it holds. Nowhere without one. */
export function railLink(rail: Pick<Rail, "browse">) {
  const browse = rail.browse
  if (!browse) return null
  return {
    to: browse.kinds[0] === "show" ? "/discover/shows" : "/discover/movies",
    search: searchFor(browse),
  } satisfies {
    to: "/discover/movies" | "/discover/shows"
    search: BrowseSearch
  }
}
