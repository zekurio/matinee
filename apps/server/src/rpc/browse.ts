import type {
  Facet,
  SortOrder,
  TitleFilters,
  TitleKind,
  TitleQuery,
  TitleSort,
  WatchFilter,
} from "@matinee/contracts"
import { mediaItem, title, watchProgress } from "@matinee/db"
import {
  and,
  arrayContains,
  asc,
  between,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm"

import type { Seer } from "../access/visible"
import { visibleTitles } from "../access/visible"
import { anyOf, db } from "../db"
import { escapeLike } from "./like"

/** A viewer whose own watch state a list can filter by. */
export type Watcher = Seer & { id: string }

/** The parts of a `TitleQuery` that pick titles, as opposed to pages. */
export type TitleMatch = Pick<TitleQuery, "query" | "kind"> & {
  filters?: TitleFilters
}

/**
 * The age ratings each kind may have under the filters' limits, from
 * `ratingLimits` in `title-filters.ts`. A kind without an entry has no
 * limit.
 */
export type RatingLimits = ReadonlyMap<TitleKind, readonly string[]>

/**
 * Whether the viewer has started any of the title's files, and whether
 * they finished every one, as `TitleSummary.watched` says. Both run per
 * title row, through the indexes on `media_item.title_id` and on the
 * progress's user and file.
 */
export function watchFlags(userId: string) {
  const started = sql<boolean>`exists (select 1 from ${mediaItem} inner join ${watchProgress} on ${watchProgress.mediaItemId} = ${mediaItem.id} and ${watchProgress.userId} = ${userId} where ${mediaItem.titleId} = ${title.id})`
  const finished = sql<boolean>`(exists (select 1 from ${mediaItem} where ${mediaItem.titleId} = ${title.id}) and not exists (select 1 from ${mediaItem} left join ${watchProgress} on ${watchProgress.mediaItemId} = ${mediaItem.id} and ${watchProgress.userId} = ${userId} where ${mediaItem.titleId} = ${title.id} and ${watchProgress.completed} is not true))`
  return { started, finished }
}

function watchedWhere(state: WatchFilter, userId: string): SQL {
  const { started, finished } = watchFlags(userId)
  switch (state) {
    case "unwatched":
      return not(started)
    case "inProgress":
      return sql`(${started} and not ${finished})`
    case "watched":
      return finished
  }
}

/** Inclusive bounds on a column; a title without the value fails either. */
function bounded(
  column: typeof title.year | typeof title.rating | typeof title.runtimeMinutes,
  low: number | null,
  high: number | null,
): SQL | undefined {
  if (low !== null && high !== null) return between(column, low, high)
  if (low !== null) return gte(column, low)
  if (high !== null) return lte(column, high)
  return undefined
}

/** Titles of `kind` rated one of `allowed`; other kinds pass. */
function ratedWithin(kind: TitleKind, allowed: readonly string[]): SQL {
  const rated =
    allowed.length > 0
      ? anyOf(title.contentRating, allowed, "text")
      : sql`false`
  return sql`(${title.kind} <> ${kind} or ${rated})`
}

/**
 * The titles that pass `match` for `viewer`. In one library the query also
 * looks at the path, which finds what the provider named differently.
 * Across every library that matches too much.
 */
export function titleWhere(
  viewer: Watcher,
  match: TitleMatch,
  limits: RatingLimits,
  libraryId?: string,
): SQL | undefined {
  const pattern = match.query ? `%${escapeLike(match.query)}%` : null
  const filters = match.filters
  return and(
    visibleTitles(viewer),
    libraryId ? eq(title.libraryId, libraryId) : undefined,
    match.kind ? eq(title.kind, match.kind) : undefined,
    filters?.genres.length
      ? arrayContains(title.genres, filters.genres)
      : undefined,
    filters?.studios.length
      ? arrayContains(title.studios, filters.studios)
      : undefined,
    filters ? bounded(title.year, filters.yearFrom, filters.yearTo) : undefined,
    filters
      ? bounded(title.rating, filters.scoreMin, filters.scoreMax)
      : undefined,
    filters
      ? bounded(title.runtimeMinutes, filters.runtimeMin, filters.runtimeMax)
      : undefined,
    filters?.language
      ? eq(title.originalLanguage, filters.language)
      : undefined,
    ...[...limits].map(([kind, allowed]) => ratedWithin(kind, allowed)),
    filters?.watched ? watchedWhere(filters.watched, viewer.id) : undefined,
    pattern
      ? or(
          ilike(title.name, pattern),
          ilike(title.originalName, pattern),
          libraryId ? ilike(title.path, pattern) : undefined,
        )
      : undefined,
  )
}

/** A sort's usual way: A to Z by name, the most of the rest first. */
export function defaultOrder(sort: TitleSort): SortOrder {
  return sort === "name" ? "asc" : "desc"
}

/**
 * The order of a list. Titles without the sort's value come last both
 * ways, and the id settles ties, so pages never repeat or skip a title.
 */
export function titleOrder(sort: TitleSort, order?: SortOrder): SQL[] {
  const way = order ?? defaultOrder(sort)
  const dir = sql.raw(way)
  const byName = [asc(title.sortName), asc(title.id)]
  switch (sort) {
    case "name":
      return way === "asc"
        ? [asc(title.sortName), asc(title.year), asc(title.id)]
        : [desc(title.sortName), desc(title.year), desc(title.id)]
    case "recent":
      return [
        way === "asc" ? asc(title.addedAt) : desc(title.addedAt),
        ...byName,
      ]
    case "year":
      return [
        sql`${title.year} ${dir} nulls last`,
        sql`${title.releaseDate} ${dir} nulls last`,
        ...byName,
      ]
    case "score":
      return [sql`${title.rating} ${dir} nulls last`, ...byName]
    case "runtime":
      return [sql`${title.runtimeMinutes} ${dir} nulls last`, ...byName]
  }
}

/**
 * Each genre or studio in `column`, with how many titles have it, most
 * first. `where` picks the titles. `match` keeps the names that contain
 * it, those that start with it first, as a search does.
 */
export async function tagCounts(
  viewer: Seer,
  column: typeof title.genres | typeof title.studios,
  options: { where?: SQL; match?: string; limit?: number } = {},
): Promise<Facet[]> {
  const tags = db
    .select({ name: sql<string>`unnest(${column})`.as("name") })
    .from(title)
    .where(and(visibleTitles(viewer), options.where))
    .as("tags")
  const escaped = options.match ? escapeLike(options.match) : null
  const titleCount = count()
  const query = db
    .select({ name: tags.name, titleCount })
    .from(tags)
    .where(escaped === null ? undefined : ilike(tags.name, `%${escaped}%`))
    .groupBy(tags.name)
    .orderBy(
      ...(escaped === null
        ? []
        : [sql`${tags.name} ilike ${`${escaped}%`} desc`]),
      desc(titleCount),
      asc(tags.name),
    )
    .$dynamic()
  return options.limit === undefined ? query : query.limit(options.limit)
}
