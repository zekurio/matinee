import { type FSWatcher, watch } from "node:fs"
import { opendir, realpath, stat } from "node:fs/promises"
import { join } from "node:path"

import { libraryFolder } from "@matinee/db"

import { db } from "../db"
import { log } from "../log"
import { isIgnored, isScannedFile } from "./entries"
import { scanLibrary } from "./scanner"
import { addTarget, errorCode, isInside, type Targets } from "./targets"

// Copying a file sends a burst of events. Scan once the library has been
// quiet this long, or after the longest wait while it stays busy.
const QUIET_MS = 10_000
const MAX_WAIT_MS = 5 * 60_000

/**
 * A library folder and a watcher on each directory below it. A directory
 * watch (inotify on Linux) sees changes to its own entries, so it takes one
 * per directory, not one per file.
 */
type WatchedFolder = {
  libraryId: string
  dirs: Map<string, FSWatcher>
  closed: boolean
}

/** By library folder id. */
const folders = new Map<string, WatchedFolder>()
/** Libraries that changed, waiting out the quiet time, and what to scan. */
const pending = new Map<
  string,
  { since: number; timer: NodeJS.Timeout; targets: Targets }
>()
let syncing: Promise<void> = Promise.resolve()
let started = false
let stopped = false
let outOfWatches = false

/**
 * Queue a folder for the library's next scan. `deep` scans everything
 * below it, for a folder that appeared; otherwise the scan lists only the
 * folder's own entries.
 */
function changed(libraryId: string, path: string, deep: boolean): void {
  if (stopped) return
  const now = Date.now()
  const waiting = pending.get(libraryId)
  if (waiting) clearTimeout(waiting.timer)
  const since = waiting?.since ?? now
  const targets: Targets = waiting?.targets ?? new Map()
  addTarget(targets, path, deep)
  const timer = setTimeout(
    () => {
      pending.delete(libraryId)
      scanLibrary(libraryId, { targets })
    },
    Math.max(0, Math.min(QUIET_MS, since + MAX_WAIT_MS - now)),
  )
  timer.unref()
  pending.set(libraryId, { since, timer, targets })
}

/** Close the watchers on a directory and every directory below it. */
function unwatch(folder: WatchedFolder, dir: string): void {
  for (const [path, watcher] of folder.dirs) {
    if (!isInside(path, dir)) continue
    watcher.close()
    folder.dirs.delete(path)
  }
}

/**
 * Map an event to what the scan needs to look at: a folder that appeared,
 * or the folder whose entries changed. Skips entries the scan skips.
 */
function onEvent(
  folder: WatchedFolder,
  dir: string,
  event: string,
  name: string | null,
): void {
  if (folder.closed || !name || isIgnored(name)) return
  if (event === "change") {
    // Written to or touched. Only files the scan reads matter.
    if (isScannedFile(name)) changed(folder.libraryId, dir, false)
    return
  }
  // A rename is an entry coming or going: watch new folders, drop gone ones.
  const path = join(dir, name)
  void (async () => {
    const info = await stat(path).catch(() => null)
    if (folder.closed) return
    if (info?.isDirectory()) {
      changed(folder.libraryId, path, true)
      await watchTree(folder, path, new Set())
    } else if (!info) {
      // A file or folder went away. Listing the folder it was in drops it.
      unwatch(folder, path)
      changed(folder.libraryId, dir, false)
    } else if (isScannedFile(name)) {
      changed(folder.libraryId, dir, false)
    }
  })().catch((cause) => log.warn(`Couldn't watch ${path}`, cause))
}

/** Watch a directory and the ones below it. Skips ignored entries and loops. */
async function watchTree(
  folder: WatchedFolder,
  dir: string,
  visited: Set<string>,
): Promise<void> {
  if (folder.closed || outOfWatches || folder.dirs.has(dir)) return
  const real = await realpath(dir).catch(() => null)
  if (!real || visited.has(real)) return
  visited.add(real)
  if (folder.closed || folder.dirs.has(dir)) return

  try {
    const watcher = watch(dir, { persistent: false }, (event, name) =>
      onEvent(folder, dir, event, name),
    )
    watcher.on("error", (cause) => {
      log.warn(`Stopped watching ${dir}`, cause)
      unwatch(folder, dir)
    })
    folder.dirs.set(dir, watcher)
  } catch (cause) {
    if (errorCode(cause) === "ENOSPC") {
      outOfWatches = true
      log.warn(
        `Ran out of inotify watches at ${dir}, so changes in some folders go unnoticed. Raise fs.inotify.max_user_watches and restart.`,
      )
    } else {
      log.warn(`Couldn't watch ${dir}`, cause)
    }
    return
  }

  let handle
  try {
    handle = await opendir(dir)
  } catch (cause) {
    log.warn(`Couldn't read ${dir} to watch it`, cause)
    return
  }
  for await (const entry of handle) {
    if (isIgnored(entry.name)) continue
    const path = join(dir, entry.name)
    const isDir = entry.isSymbolicLink()
      ? (await stat(path).catch(() => null))?.isDirectory()
      : entry.isDirectory()
    if (isDir) await watchTree(folder, path, visited)
  }
}

function closeFolder(id: string, folder: WatchedFolder): void {
  folder.closed = true
  for (const watcher of folder.dirs.values()) watcher.close()
  folder.dirs.clear()
  folders.delete(id)
}

async function sync(): Promise<void> {
  if (stopped) return
  const rows = await db
    .select({
      id: libraryFolder.id,
      libraryId: libraryFolder.libraryId,
      path: libraryFolder.path,
    })
    .from(libraryFolder)
  const ids = new Set(rows.map((row) => row.id))
  for (const [id, folder] of folders) {
    if (!ids.has(id)) closeFolder(id, folder)
  }
  outOfWatches = false
  for (const row of rows) {
    const existing = folders.get(row.id)
    // One that couldn't be watched, like an unmounted drive, gets a retry.
    if (existing && existing.dirs.size > 0) continue
    const folder = existing ?? {
      libraryId: row.libraryId,
      dirs: new Map(),
      closed: false,
    }
    folders.set(row.id, folder)
    await watchTree(folder, row.path, new Set())
  }
  let watched = 0
  for (const folder of folders.values()) watched += folder.dirs.size
  log.info(`Watching ${watched} folders for changes`)
}

/** Match the watchers to the library folders. Call after editing them. */
export function watchLibraries(): Promise<void> {
  if (!started || stopped) return syncing
  syncing = syncing
    .then(sync)
    .catch((cause) => log.warn("Couldn't update library watchers", cause))
  return syncing
}

/** Scan the folders that change, once they have been quiet for a while. */
export function startWatching(): void {
  if (started) return
  started = true
  void watchLibraries()
}

/** Close watchers and drop changes still waiting out the quiet time. */
export async function stopWatching(): Promise<void> {
  stopped = true
  for (const { timer } of pending.values()) clearTimeout(timer)
  pending.clear()
  for (const [id, folder] of folders) closeFolder(id, folder)
  await syncing
}
