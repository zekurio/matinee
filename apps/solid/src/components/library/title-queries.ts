import {
  NO_TITLE_FILTERS,
  type TitleFilters,
  type TitleList,
  type TitleScope,
} from "@matinee/contracts"
import { useQuery } from "@tanstack/solid-query"
import { createMemo } from "solid-js"

import {
  asksFilters,
  filtersFrom,
  filterSearch,
  NO_LIST_SEARCH,
  orderFrom,
  orderSearch,
  TITLE_ORDERS,
  type TitleListSearch,
  type TitleOrder,
} from "@/components/library/title-filter-params"
import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"

const PAGE_SIZE = 60

/** What a list's filters offer, for the page and the route's preload. */
export function titleFilterOptionsQuery(scope: TitleScope) {
  return orpc.titles.filterOptions.queryOptions({ input: scope })
}

/** What a list of titles asks the server for. */
export type TitleListInput = {
  filters: TitleFilters
  order: TitleOrder
}

const pages = {
  initialPageParam: 0,
  getNextPageParam: (last: TitleList, all: TitleList[]) => {
    const loaded = all.reduce((n, page) => n + page.items.length, 0)
    return last.items.length > 0 && loaded < last.total ? loaded : undefined
  },
}

/** A library's titles; shared by the route's preload and the grid. */
export function libraryTitlesOptions(libraryId: string, list: TitleListInput) {
  return orpc.titles.list.infiniteOptions({
    input: (offset: number) => ({
      libraryId,
      filters: list.filters,
      sort: list.order.sort,
      order: list.order.order,
      limit: PAGE_SIZE,
      offset,
    }),
    ...pages,
  })
}

/**
 * Titles from every library, for a genre's or a studio's page, or from
 * one library, for the Movies or Shows page with a library picked.
 */
export function browsedTitlesOptions(
  list: TitleListInput & Pick<TitleScope, "kind" | "libraryId">,
) {
  return orpc.titles.browse.infiniteOptions({
    input: (offset: number) => ({
      kind: list.kind,
      libraryId: list.libraryId,
      filters: list.filters,
      sort: list.order.sort,
      order: list.order.order,
      limit: PAGE_SIZE,
      offset,
    }),
    ...pages,
  })
}

/**
 * What a route preloads: the list as the URL asks for it, when it can be
 * asked for before the filters' choices arrive.
 */
export function preloadInput(search: TitleListSearch): TitleListInput | null {
  if (asksFilters(search)) return null
  return {
    filters: NO_TITLE_FILTERS,
    order: orderFrom(search),
  }
}

/**
 * A list of titles' filters and order from the URL, set right by what
 * the server offers for `scope`, and how to change them. `update` writes
 * some of the page's search params. A URL that asks for filters waits
 * for the choices (`ready`), so the list is asked for once.
 */
export function useTitleFilters(
  search: () => TitleListSearch,
  update: (patch: Partial<TitleListSearch>) => void,
  scope: () => TitleScope,
) {
  const query = useQuery(() => titleFilterOptionsQuery(scope()))
  const options = () => (query.isSuccess ? query.data : undefined)
  // If facets fail to load, the list can still show its unfiltered titles.
  const ready = () => query.isSuccess || query.isError || !asksFilters(search())
  // A URL without filters keeps the one shared empty filter, so changing
  // the sort leaves everything that reads the filters alone.
  const filters = createMemo(() =>
    asksFilters(search()) ? filtersFrom(search(), options()) : NO_TITLE_FILTERS,
  )
  const offered = () => options()?.sorts
  const order = createMemo(
    () => {
      const asked = orderFrom(search())
      return offered()?.includes(asked.sort) === false ? orderFrom({}) : asked
    },
    {
      equals: (before, after) =>
        before.sort === after.sort && before.order === after.order,
    },
  )
  const sorts = createMemo(
    () =>
      TITLE_ORDERS.filter(
        (choice) => offered()?.includes(choice.sort) !== false,
      ).map((choice) => ({
        value: `${choice.sort}:${choice.order}`,
        label: tr(choice.label),
      })),
    // When the choices arrive with the same list, the menu keeps its own.
    {
      equals: (before, after) =>
        before.length === after.length &&
        before.every((choice, at) => {
          const other = after[at]
          return (
            other !== undefined &&
            choice.value === other.value &&
            choice.label === other.label
          )
        }),
    },
  )
  return {
    options,
    optionsPending: () => query.isPending,
    ready,
    filters,
    order,
    change: (patch: Partial<TitleFilters>) =>
      update(filterSearch({ ...filters(), ...patch })),
    clear: () => update(NO_LIST_SEARCH),
    sorts,
    sort: () => `${order().sort}:${order().order}`,
    setSort: (value: string) => {
      const choice = TITLE_ORDERS.find(
        (each) => `${each.sort}:${each.order}` === value,
      )
      if (choice) update(orderSearch(choice))
    },
  }
}
