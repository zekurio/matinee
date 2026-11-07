import type { TitleSort } from "@matinee/contracts"
import { getRouteApi } from "@tanstack/react-router"
import { useDeferredValue } from "react"

import { useUrlText } from "@/lib/use-url-text"

export type Sort = "title" | "recent" | "year"
export type SortOption = { value: Sort; label: string }
export const fileSorts: SortOption[] = [
  { value: "title", label: "File name" },
  { value: "recent", label: "Recently added" },
]
export const titleSorts: SortOption[] = [
  { value: "title", label: "Name" },
  { value: "recent", label: "Recently added" },
  { value: "year", label: "Year" },
]

/** The sort as the API names it. */
export function titleSort(sort: Sort): TitleSort {
  return sort === "title" ? "name" : sort
}

/** A list's search params. Title is the default sort, so the URL leaves it out. */
export type ListSearch = { q?: string; sort?: Exclude<Sort, "title"> }

export const libraryRoute = getRouteApi("/_authed/_shell/libraries/$libraryId")

/**
 * The search box's text, mirrored into the URL after a pause so Back from
 * the player restores it, and the sort, which goes there straight away.
 * `current` is the page's search params; `update` writes some of them.
 */
export function useListSearch(
  current: ListSearch,
  update: (patch: ListSearch) => void,
) {
  const sort: Sort = current.sort ?? "title"
  const [search, setSearch] = useUrlText(current.q, (next) =>
    update({ q: next }),
  )
  const query = useDeferredValue(search.trim())
  const setSort = (next: Sort) =>
    update({ sort: next === "title" ? undefined : next })
  return { search, setSearch, query, sort, setSort }
}

/** {@link useListSearch} on a library's page. */
export function useListParams() {
  const current = libraryRoute.useSearch()
  const navigate = libraryRoute.useNavigate()
  return useListSearch(
    current,
    (patch) =>
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
      }),
  )
}

/** A library's genre and studio filters, kept in the URL like the sort. */
export function useLibraryFilters() {
  const { genre, studio } = libraryRoute.useSearch()
  const navigate = libraryRoute.useNavigate()
  const update = (patch: { genre?: string; studio?: string }) =>
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      replace: true,
    })
  return {
    genre,
    studio,
    setGenre: (next: string | undefined) => update({ genre: next }),
    setStudio: (next: string | undefined) => update({ studio: next }),
    clear: () => update({ genre: undefined, studio: undefined }),
  }
}
