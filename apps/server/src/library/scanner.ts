import { opendir, realpath, stat } from "node:fs/promises"
import { join, relative } from "node:path"

import {
  library,
  libraryFolder,
  mediaItem,
  type MediaItemRow,
} from "@matinee/db"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { videoContainer } from "../media/mime"
import { titleFromFilename } from "../media/title"
import { refreshLibrary } from "../metadata/refresh"
import { shutdownSignal } from "../shutdown"
import { assignTitles } from "./titles"

const BATCH_SIZE = 500

type FoundFile = {
  path: string
  relativePath: string
  container: string
  sizeBytes: number
  modifiedAt: Date
}

/** Walk a folder for video files. Skips hidden entries and symlink loops. */
async function* walk(
  root: string,
  dir: string,
  visited: Set<string>,
): AsyncGenerator<FoundFile> {
  const real = await realpath(dir)
  if (visited.has(real)) return
  visited.add(real)

  let handle
  try {
    handle = await opendir(dir)
  } catch (cause) {
    log.warn(`Skipping unreadable folder ${dir}`, cause)
    return
  }
  for await (const entry of handle) {
    if (entry.name.startsWith(".")) continue
    const path = join(dir, entry.name)
    let isDir = entry.isDirectory()
    let isFile = entry.isFile()
    if (entry.isSymbolicLink()) {
      const target = await stat(path).catch(() => null)
      if (!target) continue
      isDir = target.isDirectory()
      isFile = target.isFile()
    }
    if (isDir) {
      yield* walk(root, path, visited)
      continue
    }
    if (!isFile) continue
    const container = videoContainer(entry.name)
    if (!container) continue
    const info = await stat(path).catch(() => null)
    if (!info) continue
    yield {
      path,
      relativePath: relative(root, path),
      container,
      sizeBytes: info.size,
      modifiedAt: info.mtime,
    }
  }
}

/** The columns a scan writes, as the last write left them. */
type KnownFile = Pick<
  MediaItemRow,
  | "folderId"
  | "relativePath"
  | "title"
  | "container"
  | "sizeBytes"
  | "modifiedAt"
>

function fileTitle(file: FoundFile): string {
  return titleFromFilename(file.relativePath.split("/").at(-1) ?? "")
}

/** True when writing the file again would only bump `seenAt`. */
function unchanged(known: KnownFile, folderId: string, file: FoundFile) {
  return (
    known.folderId === folderId &&
    known.relativePath === file.relativePath &&
    known.container === file.container &&
    known.sizeBytes === file.sizeBytes &&
    known.modifiedAt.getTime() === file.modifiedAt.getTime() &&
    known.title === fileTitle(file)
  )
}

async function flush(
  libraryId: string,
  folderId: string,
  seenAt: Date,
  batch: FoundFile[],
): Promise<void> {
  if (batch.length === 0) return
  await db
    .insert(mediaItem)
    .values(
      batch.map((file) => ({
        libraryId,
        folderId,
        path: file.path,
        relativePath: file.relativePath,
        title: fileTitle(file),
        container: file.container,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
        seenAt,
      })),
    )
    .onConflictDoUpdate({
      target: [mediaItem.libraryId, mediaItem.path],
      set: {
        folderId: sql`excluded.folder_id`,
        relativePath: sql`excluded.relative_path`,
        title: sql`excluded.title`,
        container: sql`excluded.container`,
        sizeBytes: sql`excluded.size_bytes`,
        modifiedAt: sql`excluded.modified_at`,
        seenAt: sql`excluded.seen_at`,
      },
    })
}

async function runScan(libraryId: string): Promise<void> {
  const startedAt = new Date()
  const [lib] = await db.select().from(library).where(eq(library.id, libraryId))
  if (!lib) return
  const folders = await db
    .select()
    .from(libraryFolder)
    .where(eq(libraryFolder.libraryId, libraryId))
  // Files from earlier scans. Unchanged ones aren't written again, and the
  // ones the walk doesn't find are gone.
  const known = new Map(
    (
      await db
        .select({
          path: mediaItem.path,
          folderId: mediaItem.folderId,
          relativePath: mediaItem.relativePath,
          title: mediaItem.title,
          container: mediaItem.container,
          sizeBytes: mediaItem.sizeBytes,
          modifiedAt: mediaItem.modifiedAt,
        })
        .from(mediaItem)
        .where(eq(mediaItem.libraryId, libraryId))
    ).map(({ path, ...file }) => [path, file]),
  )

  const scannedFolders = new Set<string>()
  let found = 0
  let written = 0
  const visited = new Set<string>()
  for (const folder of folders) {
    const info = await stat(folder.path).catch(() => null)
    if (!info?.isDirectory()) {
      // A missing folder is often an unmounted drive. Keep its items.
      log.warn(`Library folder ${folder.path} is missing, keeping its items`)
      continue
    }
    let batch: FoundFile[] = []
    for await (const file of walk(folder.path, folder.path, visited)) {
      // Stop on shutdown before anything is deleted. The next scan redoes it.
      if (shutdownSignal.aborted) {
        log.info(`Scan of library ${libraryId} stopped for shutdown`)
        return
      }
      found++
      const before = known.get(file.path)
      known.delete(file.path)
      if (before && unchanged(before, folder.id, file)) continue
      batch.push(file)
      if (batch.length >= BATCH_SIZE) {
        await flush(libraryId, folder.id, startedAt, batch)
        written += batch.length
        batch = []
      }
    }
    await flush(libraryId, folder.id, startedAt, batch)
    written += batch.length
    scannedFolders.add(folder.id)
  }

  // Left over: files the walk didn't find again in folders it could read.
  const gone = [...known]
    .filter(([, file]) => scannedFolders.has(file.folderId))
    .map(([path]) => path)
  for (let i = 0; i < gone.length; i += BATCH_SIZE) {
    await db
      .delete(mediaItem)
      .where(
        and(
          eq(mediaItem.libraryId, libraryId),
          inArray(mediaItem.path, gone.slice(i, i + BATCH_SIZE)),
        ),
      )
  }
  await assignTitles(libraryId, lib.kind)
  await db
    .update(library)
    .set({ lastScannedAt: new Date() })
    .where(eq(library.id, libraryId))
  log.info(
    `Scanned library ${libraryId}: ${found} files, ${written} new or changed, ${gone.length} gone, in ${Date.now() - startedAt.getTime()} ms`,
  )
}

const running = new Map<string, Promise<void>>()

export function isScanning(libraryId: string): boolean {
  return running.has(libraryId)
}

/**
 * Start a scan unless one is already running. Resolves when it ends; the
 * metadata refresh it starts afterwards runs on its own.
 */
export function scanLibrary(libraryId: string): Promise<void> {
  const existing = running.get(libraryId)
  if (existing) return existing
  const scan = (async () => {
    try {
      await runScan(libraryId)
      // Metadata runs on its own; the scan is over once the files are in.
      if (!shutdownSignal.aborted) void refreshLibrary(libraryId)
    } catch (cause) {
      log.error(`Scan of library ${libraryId} failed`, cause)
    } finally {
      running.delete(libraryId)
    }
  })()
  running.set(libraryId, scan)
  return scan
}

/**
 * On start: scan libraries with files from before titles existed, and
 * refresh metadata that went stale while the server was down.
 */
export async function catchUpLibraries(): Promise<void> {
  const untitled = await db
    .selectDistinct({ libraryId: mediaItem.libraryId })
    .from(mediaItem)
    .where(isNull(mediaItem.titleId))
  const toScan = new Set(untitled.map((row) => row.libraryId))
  for (const { id } of await db.select({ id: library.id }).from(library)) {
    if (toScan.has(id)) void scanLibrary(id)
    else void refreshLibrary(id)
  }
}
