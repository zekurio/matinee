import { readdir, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

import type { Library, LibraryInput, TrickplayStatus } from "@matinee/contracts"
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
  isNotNull,
  like,
  or,
  sql,
} from "drizzle-orm"

import { forgetGroups } from "../access/groups"
import type { Viewer } from "../access/viewer"
import {
  itemFor,
  libraryFor,
  visibleItems,
  visibleLibraries,
} from "../access/visible"
import { db } from "../db"
import { isScanning, scanLibrary } from "../library/scanner"
import { watchLibraries } from "../library/watcher"
import { placeholders, toArtwork } from "../media/artwork"
import { publicItems } from "../media/items"
import { keyframesNear, listAudio } from "../media/playback"
import { shelf } from "../media/shelf"
import { listSubtitles } from "../media/subtitles"
import { trickplayStatus } from "../media/trickplay"
import { isRefreshing, queueRefresh, sourceProblem } from "../metadata/refresh"
import {
  providerKindUnsupported,
  providerUnavailable,
  sourceById,
} from "../metadata/sources"
import { declaredMetadata } from "../plugins"
import { follow } from "../realtime/follow"
import { admin, authed, badRequest, notFound } from "./base"

/**
 * A backdrop for each of the libraries, from one of their titles. Ordering
 * by a hash of the title and the UTC date picks the same title all day,
 * for everyone, and a different one the next, without storing anything.
 */
async function libraryBackdrops(ids: string[]): Promise<Map<string, string>> {
  const day = new Date().toISOString().slice(0, 10)
  // ACCESS: Backdrops are keyed by the visible library ids passed by toLibraries.
  const rows = await db
    .selectDistinctOn([title.libraryId], {
      libraryId: title.libraryId,
      backdropId: title.backdropId,
    })
    .from(title)
    .where(and(inArray(title.libraryId, ids), isNotNull(title.backdropId)))
    .orderBy(title.libraryId, sql`md5(${title.id}::text || ${day})`)
  const found = new Map<string, string>()
  for (const row of rows) {
    if (row.backdropId) found.set(row.libraryId, row.backdropId)
  }
  return found
}

async function toLibraries(
  rows: LibraryRow[],
  isAdmin: boolean,
): Promise<Library[]> {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  // ACCESS: Counts and folders are keyed by the visible libraries passed in rows.
  const [folders, items, titles, backdrops] = await Promise.all([
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
    libraryBackdrops(ids),
  ])
  const art = await placeholders(backdrops.values())
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    paths: isAdmin
      ? folders.filter((f) => f.libraryId === row.id).map((f) => f.path)
      : [],
    itemCount: items.find((c) => c.libraryId === row.id)?.n ?? 0,
    titleCount: titles.find((c) => c.libraryId === row.id)?.n ?? 0,
    metadataProvider: row.metadataProvider,
    metadataLanguage: row.metadataLanguage,
    lastScannedAt: row.lastScannedAt,
    scanning: isScanning(row.id),
    refreshing: isRefreshing(row.id),
    backdrop: toArtwork(backdrops.get(row.id) ?? null, art),
  }))
}

async function loadLibrary(viewer: Viewer, id: string): Promise<Library> {
  const row = await libraryFor(viewer, id)
  const [result] = await toLibraries(row ? [row] : [], viewer.role === "admin")
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

/** The provider to store, if set up. */
function checkProvider(input: LibraryInput, before?: LibraryRow) {
  if (!input.metadataProvider) return null
  const source = sourceById(input.metadataProvider)
  const kind = input.kind === "movies" ? "movie" : "show"
  const kinds =
    source?.kinds ??
    declaredMetadata().find(
      (entry) => entry.contribution.id === input.metadataProvider,
    )?.contribution.kinds
  if (kinds && !kinds.includes(kind))
    throw badRequest(
      providerKindUnsupported(source?.name ?? input.metadataProvider),
    )
  // An existing library can keep an offline provider while being edited.
  if (
    before?.metadataProvider === input.metadataProvider &&
    before.kind === input.kind
  )
    return input.metadataProvider
  if (!source) throw badRequest(providerUnavailable(input.metadataProvider))
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
  list: authed.libraries.list.handler(async ({ context }) =>
    toLibraries(
      await db
        .select()
        .from(library)
        .where(visibleLibraries(context.user))
        .orderBy(asc(library.name)),
      context.user.role === "admin",
    ),
  ),

  get: authed.libraries.get.handler(({ context, input }) =>
    loadLibrary(context.user, input.id),
  ),

  create: admin.libraries.create.handler(async ({ context, input }) => {
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
    scanLibrary(row.id, { regroup: true })
    void watchLibraries()
    return loadLibrary(context.user, row.id)
  }),

  update: admin.libraries.update.handler(async ({ context, input }) => {
    const before = await libraryFor(context.user, input.id)
    if (!before) throw notFound("Library not found.")
    const metadataProvider = checkProvider(input, before)
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
    scanLibrary(input.id, { regroup: true })
    void watchLibraries()
    return loadLibrary(context.user, input.id)
  }),

  remove: admin.libraries.remove.handler(async ({ input }) => {
    const deleted = await db
      .delete(library)
      .where(eq(library.id, input.id))
      .returning({ id: library.id })
    if (deleted.length === 0) throw notFound("Library not found.")
    // Groups that listed it don't anymore.
    forgetGroups()
    void watchLibraries()
  }),

  scan: admin.libraries.scan.handler(async ({ context, input }) => {
    await loadLibrary(context.user, input.id)
    scanLibrary(input.id)
  }),

  refreshMetadata: admin.libraries.refreshMetadata.handler(
    async ({ context, input }) => {
      const lib = await loadLibrary(context.user, input.id)
      const problem = sourceProblem(lib)
      if (problem) throw badRequest(problem)
      queueRefresh(input.id, true)
    },
  ),
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

// A file's folder.
const folderOf = sql<string>`regexp_replace(${mediaItem.relativePath}, '/[^/]*$', '')`

/**
 * The file's trickplay status, again whenever a set of images is done,
 * until it's no longer pending.
 */
async function* trickplayUpdates(
  viewer: Viewer,
  id: string,
  signal: AbortSignal | undefined,
): AsyncGenerator<TrickplayStatus, void, void> {
  const load = async (): Promise<TrickplayStatus> => {
    const row = await itemFor(viewer, id)
    return row ? trickplayStatus(row) : { status: "unavailable" }
  }
  for await (const status of follow({ topics: ["trickplay"], load, signal })) {
    yield status
    if (status.status !== "pending") return
  }
}

export const media = {
  list: authed.media.list.handler(async ({ context, input }) => {
    const where = and(
      visibleItems(context.user),
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
    // ACCESS: Both queries use where, which includes visibleItems for the viewer.
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

  shelf: authed.media.shelf.handler(({ context, input }) =>
    shelf(input.libraryId, input.limit, context.user),
  ),

  get: authed.media.get.handler(async ({ context, input }) => {
    const row = await itemFor(context.user, input.id)
    if (!row) throw notFound("This title isn't in any library.")
    const [item] = await publicItems([row], context.user.id)
    return item!
  }),

  subtitles: authed.media.subtitles.handler(async ({ context, input }) => {
    const row = await itemFor(context.user, input.id)
    if (!row) throw notFound("This title isn't in any library.")
    return listSubtitles(row)
  }),

  audio: authed.media.audio.handler(async ({ context, input }) => {
    const row = await itemFor(context.user, input.id)
    if (!row) throw notFound("This title isn't in any library.")
    return listAudio(row)
  }),

  keyframes: authed.media.keyframes.handler(async ({ context, input }) => {
    const row = await itemFor(context.user, input.id)
    if (!row) throw notFound("This title isn't in any library.")
    const keyframes = await keyframesNear(row, input.seconds)
    if (!keyframes) {
      throw badRequest("Can't find a point to start this file from.")
    }
    return keyframes
  }),

  trickplay: authed.media.trickplay.handler(
    async ({ context, input, signal }) => {
      const row = await itemFor(context.user, input.id)
      if (!row) throw notFound("This title isn't in any library.")
      return trickplayUpdates(context.user, row.id, signal)
    },
  ),
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
