import { type FSWatcher, watch } from "node:fs"
import { opendir, realpath, stat } from "node:fs/promises"
import { join, sep } from "node:path"

import { library, libraryFolder } from "@matinee/db"
import { sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "../db"
import { log } from "../log"
import { isScanning, scanLibrary } from "./scanner"

// Copying a file sends a burst of events. Scan once the library has been
// quiet this long, or after the longest wait while it stays busy.
const QUIET_MS = 10_000
const MAX_WAIT_MS = 5 * 60_000
// Files may have arrived while the server was down. Scan everything once,
// after dev restarts and a busy startup have passed.
const STARTUP_SCAN_DELAY_MS = 60_000

/** Node's fs errors carry a code such as ENOSPC. */
const SystemError = z.object({ code: z.string().min(1) })

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
/** Libraries that changed, waiting out the quiet time. */
const pending = new Map<string, { since: number; timer: NodeJS.Timeout }>()
/** Libraries to scan, one after another. */
const queue: string[] = []
let draining: Promise<void> | null = null
let syncing: Promise<void> = Promise.resolve()
let startupScan: NodeJS.Timeout | null = null
let started = false
let stopped = false
let outOfWatches = false

async function drain(): Promise<void> {
  while (!stopped) {
    const libraryId = queue.shift()
    if (!libraryId) return
    // A scan that is already running may have walked past the change.
    if (isScanning(libraryId)) await scanLibrary(libraryId)
    if (!stopped) await scanLibrary(libraryId)
  }
}

function enqueue(libraryId: string): void {
  if (stopped) return
  if (!queue.includes(libraryId)) queue.push(libraryId)
  draining ??= drain().finally(() => {
    draining = null
  })
}

function changed(libraryId: string): void {
  if (stopped) return
  const now = Date.now()
  const waiting = pending.get(libraryId)
  if (waiting) clearTimeout(waiting.timer)
  const since = waiting?.since ?? now
  const timer = setTimeout(
    () => {
      pending.delete(libraryId)
      enqueue(libraryId)
    },
    Math.max(0, Math.min(QUIET_MS, since + MAX_WAIT_MS - now)),
  )
  timer.unref()
  pending.set(libraryId, { since, timer })
}

/** Close the watchers on a directory and every directory below it. */
function unwatch(folder: WatchedFolder, dir: string): void {
  const below = dir + sep
  for (const [path, watcher] of folder.dirs) {
    if (path !== dir && !path.startsWith(below)) continue
    watcher.close()
    folder.dirs.delete(path)
  }
}

function onEvent(
  folder: WatchedFolder,
  dir: string,
  event: string,
  name: string | null,
): void {
  if (folder.closed || name?.startsWith(".")) return
  changed(folder.libraryId)
  // A rename is an entry coming or going: watch new folders, drop gone ones.
  if (event !== "rename" || !name) return
  const path = join(dir, name)
  void (async () => {
    const info = await stat(path).catch(() => null)
    if (!info) unwatch(folder, path)
    else if (info.isDirectory()) await watchTree(folder, path, new Set())
  })().catch((cause) => log.warn(`Couldn't watch ${path}`, cause))
}

/** Watch a directory and the ones below it. Skips hidden entries and loops. */
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
    if (SystemError.safeParse(cause).data?.code === "ENOSPC") {
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
    if (entry.name.startsWith(".")) continue
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

async function scanAll(): Promise<void> {
  const rows = await db
    .select({ id: library.id })
    .from(library)
    .orderBy(sql`${library.lastScannedAt} asc nulls first`)
  for (const row of rows) enqueue(row.id)
}

/**
 * Rescan a library when files in its folders change, and every library once
 * shortly after startup.
 */
export function startWatching(): void {
  if (started) return
  started = true
  void watchLibraries()
  startupScan = setTimeout(() => {
    startupScan = null
    void scanAll().catch((cause) =>
      log.warn("Couldn't start the startup scan", cause),
    )
  }, STARTUP_SCAN_DELAY_MS)
  startupScan.unref()
}

/**
 * Close watchers and timers, then wait for the scan in progress. Request
 * shutdown first so that scan stops early.
 */
export async function stopWatching(): Promise<void> {
  stopped = true
  if (startupScan) clearTimeout(startupScan)
  for (const { timer } of pending.values()) clearTimeout(timer)
  pending.clear()
  queue.length = 0
  for (const [id, folder] of folders) closeFolder(id, folder)
  await Promise.all([draining, syncing])
}
