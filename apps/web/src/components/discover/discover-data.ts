import type { DiscoverRail } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { type QueryClient, useQuery } from "@tanstack/react-query"

import { refKey } from "@/components/catalog/catalog-data"
import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"

/*
 * Discover's rows: which ones this viewer gets, as the server lists them,
 * a page of one, and each row's own address.
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

/** A row's first page, which the row on Discover shows. */
export function railPageOptions(rail: Rail) {
  return orpc.discover.page.queryOptions({ input: { rail, page: 1 } })
}

/**
 * Every page of a row, for its grid. It starts from the page the row on
 * Discover already loaded, so the grid opens with cards in it.
 */
export function railGridOptions(queryClient: QueryClient, rail: Rail) {
  const first = railPageOptions(rail)
  return orpc.discover.page.infiniteOptions({
    input: (page: number) => ({ rail, page }),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    initialData: () => {
      const page = queryClient.getQueryData(first.queryKey)
      return page && { pages: [page], pageParams: [1] }
    },
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(first.queryKey)?.dataUpdatedAt,
  })
}

/** "Popular movies", or "Because you watched Dune". */
export function railName(rail: Rail): string {
  if (rail.id === "becauseWatched") {
    return tr("discover.rail.becauseWatched", { name: rail.seed?.name ?? "" })
  }
  return tr(`discover.rail.${rail.id}`)
}

/** Tells rows apart, as a React key: there can be several "Because you watched". */
export function railKey(rail: Rail): string {
  return rail.seed ? `${rail.id}:${refKey(rail.seed.ref)}` : rail.id
}

/**
 * The address of each row's own grid under /discover. The popular rows
 * have none: their headings open browsing that kind. A "Because you
 * watched" row's names the title it starts from.
 */
const slugs = {
  comingSoon: "coming-soon",
  forYou: "for-you",
} satisfies Partial<Record<RailId, string>>

function railSlug(rail: Rail): string | null {
  switch (rail.id) {
    case "popularFilms":
    case "popularShows":
      return null
    case "becauseWatched":
      return rail.seed
        ? `because-${rail.seed.ref.kind}-${rail.seed.ref.provider}-${rail.seed.ref.providerId}`
        : null
    default:
      return slugs[rail.id]
  }
}

/** Where a row's heading leads. */
export function railLink(
  rail: Rail,
):
  | { to: "/discover/movies" | "/discover/shows" }
  | { to: "/discover/$rail"; params: { rail: string } } {
  if (rail.id === "popularFilms") return { to: "/discover/movies" }
  if (rail.id === "popularShows") return { to: "/discover/shows" }
  return { to: "/discover/$rail", params: { rail: railSlug(rail) ?? "" } }
}

/** The row an address names, among the rows this viewer gets. */
export function railAt(
  rails: Rail[] | undefined,
  slug: string,
): Rail | undefined {
  return rails?.find((rail) => railSlug(rail) === slug)
}
