import {
  NO_TITLE_FILTERS,
  SortOrder,
  type TitleFilterOptions,
  type TitleFilters,
  type TitleKind,
  type TitleSort,
  WatchFilter,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import { plain, span } from "@/components/filters/ranges"

/*
 * A list of titles' filters and sort as the URL holds them, for a
 * library's page and a genre's or studio's, so a filtered list can be
 * linked, reloaded and gone back to. Genres, studios and languages stay
 * as written, so a link to one the list lacks shows that nothing matches;
 * ranges and age ratings are set right by what the server offers.
 */

/** The router reads `12` as a number, the rest as text. */
const text = t.union([t.string().min(1).max(200), t.number()])
/** One name, or several, which the router keeps as a list. */
const names = t
  .union([text, t.array(text).max(20)])
  .optional()
  .catch(undefined)
const number = t.number().optional().catch(undefined)

/** The orders the URL names; by name, the default, is left out. */
const UrlSort = t.enum(["recent", "year", "score", "runtime"])

/** The search params of a list of titles. Each is optional; a bad one is ignored. */
export const titleListSearch = {
  /** A genre, or a list of them, which titles must all have. */
  genre: names,
  studio: names,
  from: number,
  to: number,
  score: number,
  scoreMax: number,
  movieRating: text.optional().catch(undefined),
  showRating: text.optional().catch(undefined),
  lang: t
    .string()
    .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
    .optional()
    .catch(undefined),
  runtime: number,
  runtimeMax: number,
  watched: WatchFilter.optional().catch(undefined),
  sort: UrlSort.optional().catch(undefined),
  /** Left out for the sort's usual way. */
  order: SortOrder.optional().catch(undefined),
}
const TitleListSearch = t.object(titleListSearch)
export type TitleListSearch = t.infer<typeof TitleListSearch>

/** Every one of a list's filter and sort params, off. */
export const NO_LIST_SEARCH = {
  genre: undefined,
  studio: undefined,
  from: undefined,
  to: undefined,
  score: undefined,
  scoreMax: undefined,
  movieRating: undefined,
  showRating: undefined,
  lang: undefined,
  runtime: undefined,
  runtimeMax: undefined,
  watched: undefined,
} satisfies Partial<TitleListSearch>

/** Whether the URL asks for any filter, which waits for what's offered. */
export function asksFilters(search: TitleListSearch): boolean {
  return FILTER_PARAMS.some((key) => search[key] !== undefined)
}

const FILTER_PARAMS = [
  "genre",
  "studio",
  "from",
  "to",
  "score",
  "scoreMax",
  "movieRating",
  "showRating",
  "lang",
  "runtime",
  "runtimeMax",
  "watched",
] as const satisfies (keyof TitleListSearch)[]

/** A sort and its way, as the API takes them. */
export type TitleOrder = { sort: TitleSort; order: SortOrder }

/** What the sort select offers, in its order, each with its words. */
export const TITLE_ORDERS = [
  { sort: "name", order: "asc", label: "filters.sort.nameAsc" },
  { sort: "name", order: "desc", label: "filters.sort.nameDesc" },
  { sort: "recent", order: "desc", label: "filters.sort.recentNew" },
  { sort: "recent", order: "asc", label: "filters.sort.recentOld" },
  { sort: "year", order: "desc", label: "filters.sort.newest" },
  { sort: "year", order: "asc", label: "filters.sort.oldest" },
  { sort: "score", order: "desc", label: "filters.sort.scoreHigh" },
  { sort: "score", order: "asc", label: "filters.sort.scoreLow" },
  { sort: "runtime", order: "desc", label: "filters.sort.longest" },
  { sort: "runtime", order: "asc", label: "filters.sort.shortest" },
] as const satisfies (TitleOrder & { label: string })[]

/** A sort's usual way, as the server has it: A to Z by name, the most of the rest first. */
function usual(sort: TitleSort): SortOrder {
  return sort === "name" ? "asc" : "desc"
}

/** The order the URL asks for. */
export function orderFrom(search: TitleListSearch): TitleOrder {
  const sort = search.sort ?? "name"
  return { sort, order: search.order ?? usual(sort) }
}

/** The URL's sort params for an order, leaving out the defaults. */
export function orderSearch({ sort, order }: TitleOrder) {
  return {
    sort: sort === "name" ? undefined : sort,
    order: order === usual(sort) ? undefined : order,
  }
}

function list(value: TitleListSearch["genre"]): string[] {
  const all = value === undefined ? [] : Array.isArray(value) ? value : [value]
  return [...new Set(all.map(String))].slice(0, 20)
}

/** An age limit the URL names, if the server offers that rating for `kind`. */
function limit(
  value: string | number | undefined,
  kind: TitleKind,
  options: TitleFilterOptions,
): TitleFilters["movieRating"] {
  if (value === undefined) return null
  const rating = String(value)
  const system = options.ratings.find((entry) => entry.kind === kind)
  return system?.ratings.some((entry) => entry.rating === rating)
    ? { country: system.country, rating }
    : null
}

/** Two bounds on a range the server offers, or none where it offers none. */
function bounds(
  low: number | undefined,
  high: number | undefined,
  range: TitleFilterOptions["years"],
): [number | null, number | null] {
  return range ? span(low, high, range) : [null, null]
}

/** What the URL asks for, set right by what `options` offers. */
export function filtersFrom(
  search: TitleListSearch,
  options: TitleFilterOptions | undefined,
): TitleFilters {
  if (!options) return NO_TITLE_FILTERS
  const [yearFrom, yearTo] = bounds(search.from, search.to, options.years)
  const [scoreMin, scoreMax] = bounds(
    search.score,
    search.scoreMax,
    options.scores,
  )
  const [runtimeMin, runtimeMax] = bounds(
    search.runtime,
    search.runtimeMax,
    options.runtime,
  )
  return {
    genres: list(search.genre),
    studios: list(search.studio),
    yearFrom,
    yearTo,
    scoreMin,
    scoreMax,
    movieRating: limit(search.movieRating, "movie", options),
    showRating: limit(search.showRating, "show", options),
    language: search.lang ?? null,
    runtimeMin,
    runtimeMax,
    watched: search.watched ?? null,
  }
}

/** One name as itself, several as a list, none left out. */
function nameParam(values: string[]) {
  if (values.length === 0) return undefined
  if (values.length === 1 && values[0] !== undefined) return plain(values[0])
  return values.map(plain)
}

/** The URL's filter params for `filters`, leaving out what's off. */
export function filterSearch(filters: TitleFilters) {
  return {
    genre: nameParam(filters.genres),
    studio: nameParam(filters.studios),
    from: filters.yearFrom ?? undefined,
    to: filters.yearTo ?? undefined,
    score: filters.scoreMin ?? undefined,
    scoreMax: filters.scoreMax ?? undefined,
    movieRating: filters.movieRating
      ? plain(filters.movieRating.rating)
      : undefined,
    showRating: filters.showRating
      ? plain(filters.showRating.rating)
      : undefined,
    lang: filters.language ?? undefined,
    runtime: filters.runtimeMin ?? undefined,
    runtimeMax: filters.runtimeMax ?? undefined,
    watched: filters.watched ?? undefined,
  } satisfies Partial<TitleListSearch>
}

/** How many filters are on, counting each range once. */
export function titleFilterCount(filters: TitleFilters): number {
  return (
    filters.genres.length +
    filters.studios.length +
    Number(filters.yearFrom !== null || filters.yearTo !== null) +
    Number(filters.scoreMin !== null || filters.scoreMax !== null) +
    Number(filters.movieRating !== null) +
    Number(filters.showRating !== null) +
    Number(filters.language !== null) +
    Number(filters.runtimeMin !== null || filters.runtimeMax !== null) +
    Number(filters.watched !== null)
  )
}
