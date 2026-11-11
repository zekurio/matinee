import {
  library,
  type LibraryRow,
  mediaItem,
  type MediaItemRow,
  title,
  type TitleRow,
} from "@matinee/db"
import { eq, type SQL, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

import { anyOf, arg, db } from "../db"
import type { Access } from "./policy"

/*
 * The one place that says which libraries, titles, and files a viewer may
 * open. Everything is decided by library, and titles and files carry
 * their library's id, so a check never needs a join.
 *
 * A query in request code takes one of the `visible*` filters in its
 * `where`. A lookup by id goes through `itemFor`, `titleFor`, or
 * `libraryFor`, which answer null for a row the viewer may not open, the
 * same as for one that doesn't exist, so a guessed id says nothing.
 */

/** Anyone with access: a `Viewer`, or just the access of one. */
export type Seer = { access: Pick<Access, "libraries"> }

/**
 * Rows whose library `column` names are among the viewer's. Undefined for
 * a viewer who opens every library, which `and()` and `where()` skip.
 */
export function inLibraries(viewer: Seer, column: PgColumn): SQL | undefined {
  const { libraries } = viewer.access
  if (libraries === null) return undefined
  if (libraries.size === 0) return sql`false`
  return anyOf(column, [...libraries], "uuid")
}

export const visibleLibraries = (viewer: Seer) =>
  inLibraries(viewer, library.id)
export const visibleTitles = (viewer: Seer) =>
  inLibraries(viewer, title.libraryId)
export const visibleItems = (viewer: Seer) =>
  inLibraries(viewer, mediaItem.libraryId)

/**
 * `inLibraries` for a prepared query, which can't change shape between
 * viewers. Execute it with `libraryArgs(viewer)` among its arguments.
 */
export function inLibrariesArg(column: PgColumn): SQL {
  return sql`(${arg("everyLibrary")}::boolean or ${column} = any(${arg("libraries")}::uuid[]))`
}

export function libraryArgs(viewer: Seer) {
  const { libraries } = viewer.access
  return { everyLibrary: libraries === null, libraries: [...(libraries ?? [])] }
}

export function seesLibrary(viewer: Seer, libraryId: string): boolean {
  return viewer.access.libraries?.has(libraryId) ?? true
}

/** The file, or null when there is none the viewer may open. */
export async function itemFor(
  viewer: Seer,
  id: string,
): Promise<MediaItemRow | null> {
  const [row] = await db
    .select()
    .from(mediaItem)
    .where(eq(mediaItem.id, id))
    .limit(1)
  return row && seesLibrary(viewer, row.libraryId) ? row : null
}

/** The title, or null when there is none the viewer may open. */
export async function titleFor(
  viewer: Seer,
  id: string,
): Promise<TitleRow | null> {
  const [row] = await db.select().from(title).where(eq(title.id, id)).limit(1)
  return row && seesLibrary(viewer, row.libraryId) ? row : null
}

/** The library, or null when there is none the viewer may open. */
export async function libraryFor(
  viewer: Seer,
  id: string,
): Promise<LibraryRow | null> {
  if (!seesLibrary(viewer, id)) return null
  const [row] = await db
    .select()
    .from(library)
    .where(eq(library.id, id))
    .limit(1)
  return row ?? null
}
