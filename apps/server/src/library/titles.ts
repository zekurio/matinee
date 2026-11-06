import { basename, dirname } from "node:path"

import type { LibraryKind, TitleKind } from "@matinee/contracts"
import { mediaItem, title } from "@matinee/db"
import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "../db"
import { videoContainer } from "../media/mime"
import {
  episodeNumbers,
  type ParsedName,
  parseName,
  sortName,
  stem,
} from "../media/title"

const BATCH_SIZE = 500

const KINDS = {
  movies: "movie",
  shows: "show",
  other: "folder",
} satisfies Record<LibraryKind, TitleKind>

// Folders inside a movie's folder that hold its bonus material.
const EXTRAS = new Set([
  "behind the scenes",
  "deleted scenes",
  "extras",
  "featurettes",
  "interviews",
  "other",
  "sample",
  "samples",
  "scenes",
  "shorts",
  "trailers",
])

/** Name, year, and folder ids of a title, from its path alone. */
export function localName(path: string, kind: TitleKind): ParsedName {
  const last = basename(path)
  if (!videoContainer(last)) return parseName(last)
  // A lone episode file names its show before the episode code.
  const base =
    kind === "show"
      ? stem(last).replace(/[\s._-]*\bS\d{1,3}E\d{1,4}\b.*$/i, "")
      : stem(last)
  return parseName(base || stem(last))
}

/**
 * The title a movie file belongs to: its folder when that folder holds just
 * this one video, else the file itself. Files in an extras folder belong to
 * the movie in the folder above.
 */
function movieKey(relativePath: string, perFolder: Map<string, number>) {
  let folder = dirname(relativePath)
  let inExtras = false
  while (folder !== "." && EXTRAS.has(basename(folder).toLowerCase())) {
    folder = dirname(folder)
    inExtras = true
  }
  if (folder === ".") return relativePath
  if (inExtras) return folder
  return perFolder.get(folder) === 1 ? folder : relativePath
}

/** A show is its top-level folder; a loose file stands alone. */
function topLevelKey(relativePath: string): string {
  const slash = relativePath.indexOf("/")
  return slash > 0 ? relativePath.slice(0, slash) : relativePath
}

type Assignment = {
  id: string
  key: string
  season: number | null
  episode: number | null
}

/**
 * Group a library's files into titles after a scan: create titles for new
 * folders, point every file at its title, and drop titles left empty.
 * Titles that already matched keep their provider's name.
 */
export async function assignTitles(
  libraryId: string,
  libraryKind: LibraryKind,
): Promise<void> {
  const kind = KINDS[libraryKind]
  const items = await db
    .select({
      id: mediaItem.id,
      relativePath: mediaItem.relativePath,
      createdAt: mediaItem.createdAt,
      titleId: mediaItem.titleId,
      seasonNumber: mediaItem.seasonNumber,
      episodeNumber: mediaItem.episodeNumber,
    })
    .from(mediaItem)
    .where(eq(mediaItem.libraryId, libraryId))

  const perFolder = new Map<string, number>()
  if (kind === "movie") {
    for (const item of items) {
      const folder = dirname(item.relativePath)
      perFolder.set(folder, (perFolder.get(folder) ?? 0) + 1)
    }
  }

  const groups = new Map<string, Date>()
  const assignments: Assignment[] = []
  for (const item of items) {
    const key =
      kind === "movie"
        ? movieKey(item.relativePath, perFolder)
        : topLevelKey(item.relativePath)
    const latest = groups.get(key)
    if (!latest || item.createdAt > latest) groups.set(key, item.createdAt)
    const numbers = kind === "show" ? episodeNumbers(item.relativePath) : null
    assignments.push({
      id: item.id,
      key,
      season: numbers?.season ?? null,
      episode: numbers?.episode ?? null,
    })
  }

  const ids = new Map<string, string>()
  const rows = [...groups].map(([path, addedAt]) => {
    const local = localName(path, kind)
    return {
      libraryId,
      kind,
      path,
      name: local.name,
      sortName: sortName(local.name),
      year: local.year,
      externalIds: local.ids,
      addedAt,
    }
  })
  // Matched titles keep their provider's name and ids.
  const unmatched = sql`${title.providerId} is null`
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const saved = await db
      .insert(title)
      .values(rows.slice(i, i + BATCH_SIZE))
      .onConflictDoUpdate({
        target: [title.libraryId, title.path],
        set: {
          kind: sql`excluded.kind`,
          addedAt: sql`excluded.added_at`,
          name: sql`case when ${unmatched} then excluded.name else ${title.name} end`,
          sortName: sql`case when ${unmatched} then excluded.sort_name else ${title.sortName} end`,
          year: sql`case when ${unmatched} then excluded.year else ${title.year} end`,
          externalIds: sql`case when ${unmatched} then excluded.external_ids else ${title.externalIds} end`,
        },
      })
      .returning({ id: title.id, path: title.path })
    for (const row of saved) ids.set(row.path, row.id)
  }

  const current = new Map(items.map((item) => [item.id, item]))
  const changed = assignments.flatMap((assignment) => {
    const titleId = ids.get(assignment.key)
    const item = current.get(assignment.id)
    if (!titleId || !item) return []
    const same =
      item.titleId === titleId &&
      item.seasonNumber === assignment.season &&
      item.episodeNumber === assignment.episode
    return same ? [] : [{ ...assignment, titleId }]
  })
  for (let i = 0; i < changed.length; i += BATCH_SIZE) {
    const values = changed
      .slice(i, i + BATCH_SIZE)
      .map(
        (row) =>
          sql`(${row.id}::uuid, ${row.titleId}::uuid, ${row.season}::int, ${row.episode}::int)`,
      )
    await db.execute(sql`
      update ${mediaItem} set
        title_id = v.title_id,
        season_number = v.season,
        episode_number = v.episode
      from (values ${sql.join(values, sql`, `)}) as v(id, title_id, season, episode)
      where ${mediaItem.id} = v.id
    `)
  }

  const existing = await db
    .select({ id: title.id, path: title.path })
    .from(title)
    .where(eq(title.libraryId, libraryId))
  const stale = existing.filter((row) => !groups.has(row.path))
  for (let i = 0; i < stale.length; i += BATCH_SIZE) {
    await db.delete(title).where(
      and(
        eq(title.libraryId, libraryId),
        inArray(
          title.id,
          stale.slice(i, i + BATCH_SIZE).map((row) => row.id),
        ),
      ),
    )
  }
}
