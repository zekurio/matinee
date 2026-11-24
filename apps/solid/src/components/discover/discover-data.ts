import type { CatalogRef, DiscoverRail } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { useQuery } from "@tanstack/solid-query"

import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"

/*
 * What the shell and Home need of Discover's rows, ported from the React
 * app's file of the same name. The rest of it (each row's cards, where a
 * heading leads) comes with the Discover page.
 */

export type Rail = t.infer<typeof DiscoverRail>

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

/** "Popular movies", or "Because you watched Dune". */
export function railName(rail: Pick<Rail, "id" | "seed">): string {
  if (rail.id === "becauseWatched") {
    return tr("discover.rail.becauseWatched", { name: rail.seed?.name ?? "" })
  }
  return tr(`discover.rail.${rail.id}`)
}

/**
 * A catalog title as one string. The React app keeps it in
 * `catalog/catalog-data.ts`, which reaches for React Query, so it waits
 * here until that file is ported.
 */
export function refKey(ref: CatalogRef): string {
  return `${ref.kind}:${ref.provider}:${ref.providerId}`
}

/** Tells rows apart: there can be several "Because you watched". */
export function railKey(rail: Pick<Rail, "id" | "seed">): string {
  return rail.seed ? `${rail.id}:${refKey(rail.seed.ref)}` : rail.id
}
