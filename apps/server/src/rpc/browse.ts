import type { Facet, TitleFilter, TitleSort } from "@matinee/contracts"
import { title } from "@matinee/db"
import {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  type SQL,
  sql,
} from "drizzle-orm"

import { db } from "../db"
import { escapeLike } from "./like"

/** The parts of a `TitleFilter` that pick titles, as opposed to pages. */
export type TitleMatch = Pick<
  TitleFilter,
  "query" | "kind" | "genre" | "studio"
>

/**
 * The titles that pass `filter`. In one library the query also looks at
 * the path, which finds what the provider named differently. Across every
 * library that matches too much.
 */
export function titleWhere(
  filter: TitleMatch,
  libraryId?: string,
): SQL | undefined {
  const pattern = filter.query ? `%${escapeLike(filter.query)}%` : null
  return and(
    libraryId ? eq(title.libraryId, libraryId) : undefined,
    filter.kind ? eq(title.kind, filter.kind) : undefined,
    filter.genre ? arrayContains(title.genres, [filter.genre]) : undefined,
    filter.studio ? arrayContains(title.studios, [filter.studio]) : undefined,
    pattern
      ? or(
          ilike(title.name, pattern),
          ilike(title.originalName, pattern),
          libraryId ? ilike(title.path, pattern) : undefined,
        )
      : undefined,
  )
}

export function titleOrder(sort: TitleSort): SQL[] {
  switch (sort) {
    case "recent":
      return [desc(title.addedAt), asc(title.sortName)]
    case "year":
      return [sql`${title.year} desc nulls last`, asc(title.sortName)]
    case "name":
      return [asc(title.sortName), asc(title.year)]
  }
}

/**
 * Each genre or studio in `column`, with how many titles have it, most
 * first. `where` picks the titles. `match` keeps the names that contain
 * it, those that start with it first, as a search does.
 */
export async function tagCounts(
  column: typeof title.genres | typeof title.studios,
  options: { where?: SQL; match?: string; limit?: number } = {},
): Promise<Facet[]> {
  const tags = db
    .select({ name: sql<string>`unnest(${column})`.as("name") })
    .from(title)
    .where(options.where)
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
