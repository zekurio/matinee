import {
  NO_TITLE_FILTERS,
  type TitleFilters,
  type TitleScope,
} from "@matinee/contracts"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"

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
} from "./title-filter-params"

const PAGE_SIZE = 60

/** What a list's filters offer, for the page and the route's preload. */
export function titleFilterOptionsQuery(scope: TitleScope) {
  return orpc.titles.filterOptions.queryOptions({ input: scope })
}

/** What a list of titles asks the server for. */
export type TitleListInput = {
  query?: string
  filters: TitleFilters
  order: TitleOrder
}

function pages<T extends { items: unknown[]; total: number }>() {
  return {
    initialPageParam: 0,
    getNextPageParam: (last: T, all: T[]) => {
      const loaded = all.reduce((n, page) => n + page.items.length, 0)
      return loaded < last.total ? loaded : undefined
    },
    placeholderData: keepPreviousData,
  }
}

/** A library's titles; shared by the route's preload and the grid. */
export function libraryTitlesOptions(libraryId: string, list: TitleListInput) {
  return orpc.titles.list.infiniteOptions({
    input: (offset: number) => ({
      libraryId,
      query: list.query?.trim() || undefined,
      filters: list.filters,
      sort: list.order.sort,
      order: list.order.order,
      limit: PAGE_SIZE,
      offset,
    }),
    ...pages(),
  })
}

/** Titles from every library, for a genre's or a studio's page. */
export function browsedTitlesOptions(
  list: TitleListInput & Pick<TitleScope, "kind">,
) {
  return orpc.titles.browse.infiniteOptions({
    input: (offset: number) => ({
      query: list.query?.trim() || undefined,
      kind: list.kind,
      filters: list.filters,
      sort: list.order.sort,
      order: list.order.order,
      limit: PAGE_SIZE,
      offset,
    }),
    ...pages(),
  })
}

/**
 * What a route preloads: the list as the URL asks for it, when it can be
 * asked for before the filters' choices arrive.
 */
export function preloadInput(
  search: TitleListSearch & { q?: string },
): TitleListInput | null {
  if (asksFilters(search)) return null
  return {
    query: search.q,
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
  search: TitleListSearch,
  update: (patch: Partial<TitleListSearch>) => void,
  scope: TitleScope,
) {
  const options = useQuery(titleFilterOptionsQuery(scope))
  const ready = options.data !== undefined || !asksFilters(search)
  const filters = filtersFrom(search, options.data)
  const asked = orderFrom(search)
  // A sort with nothing to order by, like score where no title has one.
  const order =
    options.data && !options.data.sorts.includes(asked.sort)
      ? orderFrom({})
      : asked
  const offered = options.data?.sorts
  const sorts = TITLE_ORDERS.filter(
    (choice) => !offered || offered.includes(choice.sort),
  ).map((choice) => ({
    value: `${choice.sort}:${choice.order}`,
    label: tr(choice.label),
  }))
  return {
    options: options.data,
    ready,
    filters,
    order,
    change: (patch: Partial<TitleFilters>) =>
      update(filterSearch({ ...filters, ...patch })),
    clear: () => update(NO_LIST_SEARCH),
    /** The sort select's choices and value, as `sort:order` text. */
    sorts,
    sort: `${order.sort}:${order.order}`,
    setSort: (value: string) => {
      const choice = TITLE_ORDERS.find(
        (each) => `${each.sort}:${each.order}` === value,
      )
      if (choice) update(orderSearch(choice))
    },
  }
}
