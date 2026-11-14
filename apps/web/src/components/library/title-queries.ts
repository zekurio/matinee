import { NO_TITLE_FILTERS } from "@matinee/contracts"
import { keepPreviousData } from "@tanstack/react-query"

import { orpc } from "@/lib/rpc"

import { type Sort, titleSort } from "./list-params"

/** Shared by the route's intent preload and the grid's subscription. */
export function libraryTitlesOptions(
  libraryId: string,
  search: { q?: string; sort?: Sort; genre?: string; studio?: string },
) {
  return orpc.titles.list.infiniteOptions({
    input: (offset: number) => ({
      libraryId,
      query: search.q?.trim() || undefined,
      filters: {
        ...NO_TITLE_FILTERS,
        genres: search.genre ? [search.genre] : [],
        studios: search.studio ? [search.studio] : [],
      },
      sort: titleSort(search.sort ?? "title"),
      limit: 60,
      offset,
    }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.items.length, 0)
      return loaded < last.total ? loaded : undefined
    },
    placeholderData: keepPreviousData,
  })
}
