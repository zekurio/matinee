import { readdir, realpath, stat } from "node:fs/promises"
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
import { probeLibrary } from "../media/probe"
import { titleFromFilename } from "../media/title"
import { refreshLibrary } from "../metadata/refresh"
import { shutdownSignal } from "../shutdown"
import { isIgnored, subtitleFormat } from "./entries"
import { indexMoves, matchMoves, mayBeMoved } from "./moves"
import {
  below,
  describeTargets,
  fate,
  type Folder,
  folderOf,
  type Listing,
  newWalkState,
  planScan,
  type WalkState,
} from "./plan"
import { syncSidecars } from "./subtitles"
import { addTarget, errorCode, isInside, type Targets } from "./targets"
import { assignTitles, topLevelKey } from "./titles"

const BATCH_SIZE = 500

type FoundFile = {
  path: string
  relativePath: string
  container: string
  sizeBytes: number
  modifiedAt: Date
}

/**
 * Walk a folder for video files, or with `deep` false look only at its own
 * entries. Skips hidden entries and symlink loops, notes what it couldn't
 * read so the scan keeps the files there, and keeps each listing's
 * subtitle files and folders for finding sidecars after.
 */
async function* walk(
  root: string,
  dir: string,
  deep: boolean,
  state: WalkState,
): AsyncGenerator<FoundFile> {
  // Read the whole listing first. One that fails, even partway, must not
  // look like removed files.
  let entries
  try {
    const real = await realpath(dir)
    if (state.visited.has(real)) return
    state.visited.add(real)
    entries = await readdir(dir, { withFileTypes: true })
  } catch (cause) {
    log.warn(
      `Couldn't read ${dir} (${errorCode(cause) ?? "unknown error"}), keeping its files`,
    )
    state.unreadable.add(dir)
    return
  }
  // A library folder that lists empty now, after the scan checked it, is
  // likely a share that just went away.
  if (dir === root && entries.every((entry) => isIgnored(entry.name))) {
    state.unreadable.add(dir)
    return
  }
  const listing: Listing = { subtitles: [], folders: [] }
  state.listed.set(dir, listing)
  for (const entry of entries) {
    if (shutdownSignal.aborted) return
    if (isIgnored(entry.name)) continue
    const path = join(dir, entry.name)
    let isDir = entry.isDirectory()
    let isFile = entry.isFile()
    if (entry.isSymbolicLink()) {
      const target = await stat(path).catch(() => null)
      // A broken link may point at a drive that isn't mounted.
      if (!target) {
        state.unreadable.add(path)
        continue
      }
      isDir = target.isDirectory()
      isFile = target.isFile()
    }
    if (isDir) {
      listing.folders.push(entry.name)
      if (deep) yield* walk(root, path, true, state)
      else state.notEntered.add(path)
      continue
    }
    if (!isFile) continue
    const container = videoContainer(entry.name)
    if (!container) {
      if (subtitleFormat(entry.name)) listing.subtitles.push(entry.name)
      continue
    }
    const info = await stat(path).catch(() => null)
    if (!info) {
      state.unreadable.add(path)
      continue
    }
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
  | "id"
  | "path"
  | "folderId"
  | "relativePath"
  | "title"
  | "container"
  | "sizeBytes"
  | "modifiedAt"
>

/** A new file held back until the scan knows whether it was moved. */
type HeldFile = FoundFile & { folderId: string }

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
        // A file that changed gets probed again.
        probedAt: sql`case when ${mediaItem.sizeBytes} = excluded.size_bytes and ${mediaItem.modifiedAt} = excluded.modified_at then ${mediaItem.probedAt} else null end`,
      },
    })
}

/** Point the rows of moved files at their new paths. Ids stay. */
async function moveFiles(
  moves: [KnownFile, HeldFile][],
  seenAt: Date,
): Promise<void> {
  for (const [row, file] of moves) {
    const changed =
      row.sizeBytes !== file.sizeBytes ||
      row.modifiedAt.getTime() !== file.modifiedAt.getTime()
    await db
      .update(mediaItem)
      .set({
        folderId: file.folderId,
        path: file.path,
        relativePath: file.relativePath,
        title: fileTitle(file),
        container: file.container,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
        seenAt,
        // A move matched on name can bring a new mtime, and a failed probe
        // may have tried the old path, so probe either again.
        probedAt: changed
          ? null
          : sql`case when ${mediaItem.probeError} is null then ${mediaItem.probedAt} end`,
        // The regroup after the scan sets it. If the scan stops first, a
        // file without a title makes the next one regroup everything.
        titleId: null,
      })
      .where(eq(mediaItem.id, row.id))
  }
}

/** What a scan covers. Null targets scan every library folder. */
type ScanRequest = { targets: Targets | null; regroup: boolean }

/** What a scan did, for its log line. */
type ScanCounts = {
  found: number
  written: number
  moved: number
  gone: number
  kept: number
}

async function hasUntitledFiles(libraryId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: mediaItem.id })
    .from(mediaItem)
    .where(and(eq(mediaItem.libraryId, libraryId), isNull(mediaItem.titleId)))
    .limit(1)
  return row !== undefined
}

/** The targets that no other target contains. */
function outermost(targets: Targets): string[] {
  const roots: string[] = []
  for (const dir of [...targets.keys()].sort((a, b) => a.length - b.length)) {
    if (!roots.some((root) => isInside(dir, root))) roots.push(dir)
  }
  return roots
}

/**
 * Files from earlier scans below the targets, by path. A listing-only
 * target needs the ones in its subfolders too: a subfolder that went away
 * takes its files with it, and one renamed beside it moves them.
 */
async function loadKnown(
  libraryId: string,
  targets: Targets,
): Promise<Map<string, KnownFile>> {
  const known = new Map<string, KnownFile>()
  for (const dir of outermost(targets)) {
    const rows = await db
      .select({
        id: mediaItem.id,
        path: mediaItem.path,
        folderId: mediaItem.folderId,
        relativePath: mediaItem.relativePath,
        title: mediaItem.title,
        container: mediaItem.container,
        sizeBytes: mediaItem.sizeBytes,
        modifiedAt: mediaItem.modifiedAt,
      })
      .from(mediaItem)
      .where(
        and(eq(mediaItem.libraryId, libraryId), below(mediaItem.path, dir)),
      )
    for (const row of rows) known.set(row.path, row)
  }
  return known
}

/**
 * After the walk: match the files it didn't find against the new ones it
 * held back, move the matches, add the rest of the new ones, and delete
 * the files that are gone. Notes the top-level entries it touched. False
 * when it stopped for shutdown before deleting.
 */
async function settle(
  libraryId: string,
  folders: Folder[],
  leftover: KnownFile[],
  held: HeldFile[],
  seenAt: Date,
  counts: ScanCounts,
  touched: Set<string>,
): Promise<boolean> {
  // A moved or renamed file keeps its row, and with it its watch progress.
  const moves = matchMoves(leftover, held)
  await moveFiles(moves, seenAt)
  counts.moved = moves.length
  const movedRows = new Set<KnownFile>()
  const movedFiles = new Set<HeldFile>()
  for (const [row, file] of moves) {
    movedRows.add(row)
    movedFiles.add(file)
    touched.add(topLevelKey(row.relativePath))
    touched.add(topLevelKey(file.relativePath))
  }

  const added = held.filter((file) => !movedFiles.has(file))
  for (const folder of folders) {
    const files = added.filter((file) => file.folderId === folder.id)
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      await flush(libraryId, folder.id, seenAt, files.slice(i, i + BATCH_SIZE))
    }
  }
  counts.written += added.length
  for (const file of added) touched.add(topLevelKey(file.relativePath))

  const gone = leftover.filter((row) => !movedRows.has(row))
  // Stop on shutdown before deleting. Moved and new files have no title
  // yet, so the next scan regroups everything.
  if (gone.length > 0 && shutdownSignal.aborted) return false
  for (let i = 0; i < gone.length; i += BATCH_SIZE) {
    await db.delete(mediaItem).where(
      and(
        eq(mediaItem.libraryId, libraryId),
        inArray(
          mediaItem.id,
          gone.slice(i, i + BATCH_SIZE).map((row) => row.id),
        ),
      ),
    )
  }
  counts.gone = gone.length
  for (const row of gone) touched.add(topLevelKey(row.relativePath))
  return true
}

/**
 * Find the subtitle files of the videos in the folders the walk listed. A
 * failure is logged and doesn't fail the scan.
 */
async function updateSidecars(
  name: string,
  libraryId: string,
  targets: Targets,
  state: WalkState,
): Promise<void> {
  try {
    const counts = await syncSidecars(libraryId, targets, state)
    if (counts.written + counts.moved + counts.gone > 0) {
      log.info(
        `Subtitle files in library ${name}: ${counts.written} new or changed, ${counts.moved} moved, ${counts.gone} gone`,
      )
    }
  } catch (cause) {
    log.warn(`Couldn't update subtitles of library ${name}`, cause)
  }
}

async function runScan(libraryId: string, request: ScanRequest): Promise<void> {
  const startedAt = new Date()
  const [lib] = await db.select().from(library).where(eq(library.id, libraryId))
  if (!lib) return
  const folders = await db
    .select()
    .from(libraryFolder)
    .where(eq(libraryFolder.libraryId, libraryId))
  // A file without a title means an earlier scan stopped before grouping.
  const regroupAll = request.regroup || (await hasUntitledFiles(libraryId))

  const state = newWalkState()
  const { targets, kept } = await planScan(
    libraryId,
    folders,
    request.targets,
    state,
  )
  const counts: ScanCounts = { found: 0, written: 0, moved: 0, gone: 0, kept }
  // Files from earlier scans. Unchanged ones aren't written again, and the
  // ones the walk doesn't find are gone or moved.
  const known = await loadKnown(libraryId, targets)
  const moveIndex = indexMoves([...known.values()])
  // Top-level entries with a file that came, changed, moved, or went.
  const touched = new Set<string>()
  // New files that may be a known one moved here, written after matching.
  const held: HeldFile[] = []

  for (const [dir, deep] of targets) {
    const folder = folderOf(folders, dir)
    if (!folder) continue
    let batch: FoundFile[] = []
    for await (const file of walk(folder.path, dir, deep, state)) {
      counts.found++
      const before = known.get(file.path)
      if (before) {
        known.delete(file.path)
        if (unchanged(before, folder.id, file)) continue
      } else if (mayBeMoved(file, moveIndex, (row) => known.has(row.path))) {
        held.push({ ...file, folderId: folder.id })
        continue
      }
      batch.push(file)
      touched.add(topLevelKey(file.relativePath))
      if (batch.length >= BATCH_SIZE) {
        await flush(libraryId, folder.id, startedAt, batch)
        counts.written += batch.length
        batch = []
      }
    }
    // Stop on shutdown before anything is deleted. The next scan redoes it.
    if (shutdownSignal.aborted) break
    await flush(libraryId, folder.id, startedAt, batch)
    counts.written += batch.length
  }
  if (shutdownSignal.aborted) {
    log.info(`Scan of library ${lib.name} stopped for shutdown`)
    return
  }

  // Left over: files the walk didn't find again.
  const leftover: KnownFile[] = []
  for (const row of known.values()) {
    const result = fate(row.path, targets, state)
    if (result === "gone") leftover.push(row)
    else if (result === "kept") counts.kept++
  }
  const settled = await settle(
    libraryId,
    folders,
    leftover,
    held,
    startedAt,
    counts,
    touched,
  )
  if (!settled) {
    log.info(`Scan of library ${lib.name} stopped for shutdown`)
    return
  }

  await updateSidecars(lib.name, libraryId, targets, state)
  if (regroupAll) await assignTitles(libraryId, lib.kind)
  else if (touched.size > 0) await assignTitles(libraryId, lib.kind, touched)
  if (!request.targets) {
    await db
      .update(library)
      .set({ lastScannedAt: new Date() })
      .where(eq(library.id, libraryId))
  }
  // What was walked, or what was asked for when every folder was offline.
  const scope = request.targets
    ? describeTargets(folders, targets.size > 0 ? targets : request.targets)
    : "full"
  log.info(
    `Scanned library ${lib.name} (${scope}): ${counts.found} files, ${counts.written} new or changed, ${counts.moved} moved, ${counts.gone} gone, ${counts.kept} kept as offline or unreadable, in ${Date.now() - startedAt.getTime()} ms`,
  )
}

async function scanOnce(libraryId: string, request: ScanRequest) {
  try {
    await runScan(libraryId, request)
    // Metadata and probes run on their own; the scan is over once the
    // files are in.
    if (!shutdownSignal.aborted) {
      void refreshLibrary(libraryId)
      void probeLibrary(libraryId)
    }
  } catch (cause) {
    log.error(`Scan of library ${libraryId} failed`, cause)
  }
}

type QueuedScan = ScanRequest & { done: Promise<void>; resolve: () => void }

function queuedScan(): QueuedScan {
  let resolve = () => {}
  const done = new Promise<void>((settle) => {
    resolve = settle
  })
  return { targets: new Map(), regroup: false, done, resolve }
}

/** Scans waiting their turn, one per library, oldest first. */
const queue = new Map<string, QueuedScan>()
let current: { libraryId: string; full: boolean; done: Promise<void> } | null =
  null
let draining = false
let stopped = false

/** Watcher scans are small, so they go before full ones. */
function nextScan(): [string, QueuedScan] | undefined {
  let first: [string, QueuedScan] | undefined
  for (const entry of queue) {
    if (entry[1].targets) return entry
    first ??= entry
  }
  return first
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (!stopped) {
      const next = nextScan()
      if (!next) return
      const [libraryId, request] = next
      queue.delete(libraryId)
      const done = scanOnce(libraryId, request)
      current = { libraryId, full: !request.targets, done }
      await done
      current = null
      request.resolve()
    }
  } finally {
    current = null
    draining = false
  }
}

export function isScanning(libraryId: string): boolean {
  return current?.libraryId === libraryId || queue.has(libraryId)
}

export type ScanOptions = {
  /** Folders to scan, as the watcher collects them. Unset scans all. */
  targets?: Targets
  /** Regroup every title, for a library that was created or edited. */
  regroup?: boolean
}

/**
 * Queue a scan. Scans run one at a time across libraries. Requests for a
 * library that is waiting merge into one scan, and a request during its
 * scan runs after it, since that scan may have walked past the change; a
 * plain full scan joins a full one already running. Resolves when the
 * scan that covers the request ends. The metadata refresh and media probes
 * it starts afterwards run on their own.
 */
export function scanLibrary(
  libraryId: string,
  options: ScanOptions = {},
): Promise<void> {
  if (stopped) return Promise.resolve()
  const regroup = options.regroup ?? false
  const waiting = queue.get(libraryId)
  if (
    !waiting &&
    !options.targets &&
    !regroup &&
    current?.libraryId === libraryId &&
    current.full
  ) {
    return current.done
  }
  const request = waiting ?? queuedScan()
  if (!options.targets) request.targets = null
  else if (request.targets) {
    for (const [path, deep] of options.targets) {
      addTarget(request.targets, path, deep)
    }
  }
  request.regroup ||= regroup
  queue.set(libraryId, request)
  void drain()
  return request.done
}

/**
 * Drop queued scans and wait for the one in progress, which stops early
 * once shutdown is requested.
 */
export async function stopScans(): Promise<void> {
  stopped = true
  for (const request of queue.values()) request.resolve()
  queue.clear()
  await current?.done
}
