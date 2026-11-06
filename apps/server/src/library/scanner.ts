import { opendir, realpath, stat } from "node:fs/promises"
import { join, relative } from "node:path"

import { library, libraryFolder, mediaItem } from "@matinee/db"
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { videoContainer } from "../media/mime"
import { titleFromFilename } from "../media/title"
import { refreshLibrary } from "../metadata/refresh"
import { syncSubtitles } from "./subtitles"
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
        title: titleFromFilename(file.relativePath.split("/").at(-1) ?? ""),
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

  const scannedFolders: string[] = []
  let found = 0
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
      batch.push(file)
      found++
      if (batch.length >= BATCH_SIZE) {
        await flush(libraryId, folder.id, startedAt, batch)
        batch = []
      }
    }
    await flush(libraryId, folder.id, startedAt, batch)
    scannedFolders.push(folder.id)
  }

  if (scannedFolders.length > 0) {
    await db
      .delete(mediaItem)
      .where(
        and(
          eq(mediaItem.libraryId, libraryId),
          inArray(mediaItem.folderId, scannedFolders),
          lt(mediaItem.seenAt, startedAt),
        ),
      )
  }
  await syncSubtitles(libraryId)
  await assignTitles(libraryId, lib.kind)
  await db
    .update(library)
    .set({ lastScannedAt: new Date() })
    .where(eq(library.id, libraryId))
  log.info(
    `Scanned library ${libraryId}: ${found} files in ${Date.now() - startedAt.getTime()} ms`,
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
      void refreshLibrary(libraryId)
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
