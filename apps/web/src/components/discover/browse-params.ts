import type {
  CatalogBrowseOptions,
  CatalogFilters,
  CatalogSort,
} from "@matinee/contracts"
import { CatalogSort as SortSchema } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import { plain, span } from "@/components/filters/ranges"

/*
 * A browse's filters and sort as the URL holds them, so a filtered view
 * can be linked, reloaded and gone back to. Anything the URL says that
 * the server doesn't offer is dropped or set right here, before it's
 * asked for, so a link typed by hand never breaks the page.
 */

export type BrowseOptions = t.infer<typeof CatalogBrowseOptions>

/** The router reads `878` and `12` as numbers, the rest as text. */
const text = t.union([t.string().min(1).max(64), t.number()])
const number = t.number().optional().catch(undefined)

/** A browse's search params. Every one is optional; a bad one is ignored. */
export const BrowseSearch = t.object({
  /** Genre ids, comma separated. */
  genre: text.optional().catch(undefined),
  from: number,
  to: number,
  score: number,
  scoreMax: number,
  votes: number,
  rating: text.optional().catch(undefined),
  lang: t
    .string()
    .regex(/^[a-z]{2}$/)
    .optional()
    .catch(undefined),
  runtime: number,
  runtimeMax: number,
  /** Popular, the default, is left out. */
  sort: SortSchema.optional().catch(undefined),
})
export type BrowseSearch = t.infer<typeof BrowseSearch>

/** A browse the server can answer: filters and a sort from what it offers. */
export type Browse = { filters: CatalogFilters; sort: CatalogSort }

export const NO_FILTERS: CatalogFilters = {
  genres: [],
  yearFrom: null,
  yearTo: null,
  scoreMin: null,
  scoreMax: null,
  votesMin: null,
  rating: null,
  language: null,
  runtimeMin: null,
  runtimeMax: null,
}

/** What the URL asks for, as far as `options` offers it. */
export function browseFrom(
  search: BrowseSearch,
  options: BrowseOptions,
): Browse {
  const genres = String(search.genre ?? "")
    .split(",")
    .map(Number)
    .filter((id) => options.genres.some((genre) => genre.id === id))
  const [yearFrom, yearTo] = span(search.from, search.to, options.years)
  const [scoreMin, scoreMax] = span(
    search.score,
    search.scoreMax,
    options.scores,
  )
  const [runtimeMin, runtimeMax] = span(
    search.runtime,
    search.runtimeMax,
    options.runtime,
  )
  const rating = search.rating === undefined ? null : String(search.rating)
  return {
    filters: {
      genres: [...new Set(genres)].slice(0, 10),
      yearFrom,
      yearTo,
      scoreMin,
      scoreMax,
      votesMin:
        search.votes !== undefined && options.votes.includes(search.votes)
          ? search.votes
          : null,
      rating:
        rating !== null && options.ratings?.ratings.includes(rating)
          ? rating
          : null,
      language: options.languages.some((entry) => entry.id === search.lang)
        ? (search.lang ?? null)
        : null,
      runtimeMin,
      runtimeMax,
    },
    sort:
      search.sort && options.sorts.includes(search.sort)
        ? search.sort
        : "popular",
  }
}

/** The search params for a browse, leaving out what's off. */
export function searchFor(browse: Browse): BrowseSearch {
  const { filters } = browse
  const genre = filters.genres.join(",")
  return {
    genre: genre ? plain(genre) : undefined,
    from: filters.yearFrom ?? undefined,
    to: filters.yearTo ?? undefined,
    score: filters.scoreMin ?? undefined,
    scoreMax: filters.scoreMax ?? undefined,
    votes: filters.votesMin ?? undefined,
    rating: filters.rating === null ? undefined : plain(filters.rating),
    lang: filters.language ?? undefined,
    runtime: filters.runtimeMin ?? undefined,
    runtimeMax: filters.runtimeMax ?? undefined,
    sort: browse.sort === "popular" ? undefined : browse.sort,
  }
}

/** How many filters are on, counting each range once. */
export function filterCount(filters: CatalogFilters): number {
  return (
    filters.genres.length +
    Number(filters.yearFrom !== null || filters.yearTo !== null) +
    Number(filters.scoreMin !== null || filters.scoreMax !== null) +
    Number(filters.votesMin !== null) +
    Number(filters.rating !== null) +
    Number(filters.language !== null) +
    Number(filters.runtimeMin !== null || filters.runtimeMax !== null)
  )
}
