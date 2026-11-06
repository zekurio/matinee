import { readdir, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

import type { Library, LibraryInput } from "@matinee/contracts"
import {
  library,
  libraryFolder,
  type LibraryRow,
  mediaItem,
  title,
} from "@matinee/db"
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  like,
  or,
  sql,
} from "drizzle-orm"

import { db } from "../db"
import { isScanning, scanLibrary } from "../library/scanner"
import { watchLibraries } from "../library/watcher"
import { episodeOrder, publicItems, toSummary } from "../media/items"
import { isRefreshing, refreshLibrary } from "../metadata/refresh"
import { sources } from "../metadata/sources"
import { admin, authed, badRequest, notFound } from "./base"

async function toLibraries(rows: LibraryRow[]): Promise<Library[]> {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const [folders, items, titles] = await Promise.all([
    db
      .select()
      .from(libraryFolder)
      .where(inArray(libraryFolder.libraryId, ids))
      .orderBy(asc(libraryFolder.position)),
    db
      .select({ libraryId: mediaItem.libraryId, n: count() })
      .from(mediaItem)
      .where(inArray(mediaItem.libraryId, ids))
      .groupBy(mediaItem.libraryId),
    db
      .select({ libraryId: title.libraryId, n: count() })
      .from(title)
      .where(inArray(title.libraryId, ids))
      .groupBy(title.libraryId),
  ])
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    paths: folders.filter((f) => f.libraryId === row.id).map((f) => f.path),
    itemCount: items.find((c) => c.libraryId === row.id)?.n ?? 0,
    titleCount: titles.find((c) => c.libraryId === row.id)?.n ?? 0,
    metadataProvider: row.kind === "other" ? null : row.metadataProvider,
    metadataLanguage: row.metadataLanguage,
    lastScannedAt: row.lastScannedAt,
    scanning: isScanning(row.id),
    refreshing: isRefreshing(row.id),
  }))
}

async function loadLibrary(id: string): Promise<Library> {
  const rows = await db.select().from(library).where(eq(library.id, id))
  const [result] = await toLibraries(rows)
  if (!result) throw notFound("Library not found.")
  return result
}

async function checkFolders(paths: string[]): Promise<string[]> {
  const resolved = paths.map((path) => resolve(path))
  for (const path of resolved) {
    const info = await stat(path).catch(() => null)
    if (!info?.isDirectory()) {
      throw badRequest(`${path} isn't a folder the server can read.`)
    }
  }
  return resolved
}

/** The provider to store: none for `other`, and only ones set up. */
function checkProvider(input: LibraryInput) {
  if (input.kind === "other" || !input.metadataProvider) return null
  const source = sources[input.metadataProvider]
  if (!source.configured()) {
    throw badRequest(`${source.name} isn't set up. ${source.setup ?? ""}`)
  }
  return source.id
}

async function writeFolders(libraryId: string, input: LibraryInput) {
  const paths = await checkFolders(input.paths)
  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(libraryFolder)
      .where(eq(libraryFolder.libraryId, libraryId))
    const removed = existing.filter((f) => !paths.includes(f.path))
    if (removed.length > 0) {
      await tx.delete(libraryFolder).where(
        inArray(
          libraryFolder.id,
          removed.map((f) => f.id),
        ),
      )
    }
    for (const [position, path] of paths.entries()) {
      await tx
        .insert(libraryFolder)
        .values({ libraryId, path, position })
        .onConflictDoUpdate({
          target: [libraryFolder.libraryId, libraryFolder.path],
          set: { position },
        })
    }
  })
}

export const libraries = {
  list: authed.libraries.list.handler(async () =>
    toLibraries(await db.select().from(library).orderBy(asc(library.name))),
  ),

  get: authed.libraries.get.handler(({ input }) => loadLibrary(input.id)),

  create: admin.libraries.create.handler(async ({ input }) => {
    await checkFolders(input.paths)
    const [row] = await db
      .insert(library)
      .values({
        name: input.name,
        kind: input.kind,
        metadataProvider: checkProvider(input),
        metadataLanguage: input.metadataLanguage,
      })
      .returning()
    if (!row) throw new Error("Could not create the library.")
    await writeFolders(row.id, input)
    void scanLibrary(row.id, { regroup: true })
    void watchLibraries()
    return loadLibrary(row.id)
  }),

  update: admin.libraries.update.handler(async ({ input }) => {
    const metadataProvider = checkProvider(input)
    const [before] = await db
      .select()
      .from(library)
      .where(eq(library.id, input.id))
    if (!before) throw notFound("Library not found.")
    await db
      .update(library)
      .set({
        name: input.name,
        kind: input.kind,
        metadataProvider,
        metadataLanguage: input.metadataLanguage,
        updatedAt: new Date(),
      })
      .where(eq(library.id, input.id))
    // A new language needs everything fetched again. A new provider is
    // noticed on its own. A new kind regroups files, so old matches (a
    // show's, for what is now a movie) don't carry over.
    if (before.kind !== input.kind) {
      await db
        .update(title)
        .set({ providerId: null, refreshedAt: null })
        .where(eq(title.libraryId, input.id))
    } else if (before.metadataLanguage !== input.metadataLanguage) {
      await db
        .update(title)
        .set({ refreshedAt: null })
        .where(eq(title.libraryId, input.id))
    }
    await writeFolders(input.id, input)
    // The kind or the folders may have changed, so regroup every title.
    void scanLibrary(input.id, { regroup: true })
    void watchLibraries()
    return loadLibrary(input.id)
  }),

  remove: admin.libraries.remove.handler(async ({ input }) => {
    const deleted = await db
      .delete(library)
      .where(eq(library.id, input.id))
      .returning({ id: library.id })
    if (deleted.length === 0) throw notFound("Library not found.")
    void watchLibraries()
  }),

  scan: admin.libraries.scan.handler(async ({ input }) => {
    await loadLibrary(input.id)
    void scanLibrary(input.id)
  }),

  refreshMetadata: admin.libraries.refreshMetadata.handler(
    async ({ input }) => {
      const lib = await loadLibrary(input.id)
      if (!lib.metadataProvider) {
        throw badRequest("Pick a metadata provider for this library first.")
      }
      void refreshLibrary(input.id, { force: true })
    },
  ),
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

// A file's folder.
const folderOf = sql<string>`regexp_replace(${mediaItem.relativePath}, '/[^/]*$', '')`

export const media = {
  list: authed.media.list.handler(async ({ context, input }) => {
    const where = and(
      eq(mediaItem.libraryId, input.libraryId),
      input.folder
        ? like(mediaItem.relativePath, `${escapeLike(input.folder)}/%`)
        : undefined,
      // Episode names live in the file name, so search the path too.
      input.query
        ? or(
            ilike(mediaItem.title, `%${escapeLike(input.query)}%`),
            ilike(mediaItem.relativePath, `%${escapeLike(input.query)}%`),
          )
        : undefined,
    )
    const [items, [total]] = await Promise.all([
      db
        .select()
        .from(mediaItem)
        .where(where)
        .orderBy(
          ...(input.sort === "recent"
            ? [
                // Folders with the newest files first, episodes in order.
                desc(
                  sql`max(${mediaItem.createdAt}) over (partition by ${folderOf})`,
                ),
                asc(folderOf),
                asc(mediaItem.relativePath),
              ]
            : [asc(mediaItem.title), asc(mediaItem.relativePath)]),
        )
        .limit(input.limit)
        .offset(input.offset),
      db.select({ n: count() }).from(mediaItem).where(where),
    ])
    return {
      items: await publicItems(items, context.user.id),
      total: total?.n ?? 0,
    }
  }),

  shelf: authed.media.shelf.handler(async ({ context, input }) => {
    const titles = await db
      .select({ row: title, n: count(mediaItem.id) })
      .from(title)
      .innerJoin(mediaItem, eq(mediaItem.titleId, title.id))
      .where(eq(title.libraryId, input.libraryId))
      .groupBy(title.id)
      .orderBy(desc(title.addedAt), asc(title.sortName))
      .limit(input.limit)
    if (titles.length === 0) return []
    // Each title's first file, which is what Play starts.
    const firsts = await db
      .selectDistinctOn([mediaItem.titleId])
      .from(mediaItem)
      .where(
        inArray(
          mediaItem.titleId,
          titles.map(({ row }) => row.id),
        ),
      )
      .orderBy(mediaItem.titleId, ...episodeOrder)
    const items = await publicItems(firsts, context.user.id)
    return titles.flatMap(({ row, n }) => {
      const item = items.find((candidate) => candidate.title?.id === row.id)
      return item
        ? [{ title: toSummary(row), item, count: n, addedAt: row.addedAt }]
        : []
    })
  }),

  get: authed.media.get.handler(async ({ context, input }) => {
    const [row] = await db
      .select()
      .from(mediaItem)
      .where(eq(mediaItem.id, input.id))
    if (!row) throw notFound("This title isn't in any library.")
    const [item] = await publicItems([row], context.user.id)
    return item!
  }),
}

export const adminRoutes = {
  browse: admin.admin.browse.handler(async ({ input }) => {
    const path = resolve(input.path || "/")
    const entries = await readdir(path, { withFileTypes: true }).catch(() => {
      throw badRequest(`Can't read ${path}.`)
    })
    const directories = entries
      .filter(
        (e) =>
          !e.name.startsWith(".") && (e.isDirectory() || e.isSymbolicLink()),
      )
      .map((e) => ({ name: e.name, path: join(path, e.name) }))
    const checked = await Promise.all(
      directories.map(async (dir) =>
        (await stat(dir.path).catch(() => null))?.isDirectory() ? dir : null,
      ),
    )
    return {
      path,
      parent: path === "/" ? null : dirname(path),
      directories: checked
        .filter((dir) => dir !== null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  }),
}
