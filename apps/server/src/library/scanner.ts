import { library, libraryFolder, mediaItem } from "@matinee/db"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "../db"
import { defineQueue, type Priority } from "../jobs/queue"
import { log } from "../log"
import { probeMissing } from "../media/probe"
import { prepareMissingSubtitles } from "../media/subtitles"
import { queueTrickplay } from "../media/trickplay"
import { queueRefresh } from "../metadata/refresh"
import { libraryChanged } from "../requests/arrival"
import {
  BATCH_SIZE,
  dateFiles,
  flush,
  type HeldFile,
  type KnownFile,
  loadKnown,
  type ScanCounts,
  settle,
  unchanged,
} from "./files"
import { indexMoves, mayBeMoved } from "./moves"
import {
  describeTargets,
  fate,
  type Folder,
  folderOf,
  newWalkState,
  planScan,
  type WalkState,
} from "./plan"
import { syncSidecars } from "./subtitles"
import { addTarget, type Targets } from "./targets"
import { assignTitles, topLevelKey } from "./titles"
import { type FoundFile, walk } from "./walk"

/** What a scan covers. Null targets scan every library folder. */
type ScanRequest = {
  libraryId: string
  targets: Targets | null
  regroup: boolean
}

async function hasUntitledFiles(libraryId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: mediaItem.id })
    .from(mediaItem)
    .where(and(eq(mediaItem.libraryId, libraryId), isNull(mediaItem.titleId)))
    .limit(1)
  return row !== undefined
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
  signal: AbortSignal,
): Promise<void> {
  try {
    const counts = await syncSidecars(libraryId, targets, state, signal)
    if (counts.written + counts.moved + counts.gone > 0) {
      log.info(
        `Subtitle files in library ${name}: ${counts.written} new or changed, ${counts.moved} moved, ${counts.gone} gone`,
      )
    }
  } catch (cause) {
    log.warn(`Couldn't update subtitles of library ${name}`, cause)
  }
}

/**
 * Walk the targets and write the files that came or changed. Takes the
 * files it finds out of `known` and returns the new ones that may be a
 * known one moved, unwritten.
 */
async function walkTargets(
  libraryId: string,
  folders: Folder[],
  targets: Targets,
  state: WalkState,
  known: Map<string, KnownFile>,
  seenAt: Date,
  counts: ScanCounts,
  touched: Set<string>,
  signal: AbortSignal,
): Promise<HeldFile[]> {
  const moveIndex = indexMoves([...known.values()])
  // New files that may be a known one moved here, written after matching.
  const held: HeldFile[] = []
  // Known files that were read before birth times were, to date.
  let undated: { id: string; fileCreatedAt: Date }[] = []
  for (const [dir, deep] of targets) {
    const folder = folderOf(folders, dir)
    if (!folder) continue
    let batch: FoundFile[] = []
    for await (const file of walk(folder.path, dir, deep, state, signal)) {
      counts.found++
      const before = known.get(file.path)
      if (before) {
        known.delete(file.path)
        if (unchanged(before, folder.id, file)) {
          if (!before.fileCreatedAt) {
            undated.push({ id: before.id, fileCreatedAt: file.fileCreatedAt })
            if (undated.length >= BATCH_SIZE) {
              await dateFiles(undated)
              undated = []
            }
          }
          continue
        }
      } else if (mayBeMoved(file, moveIndex, (row) => known.has(row.path))) {
        held.push({ ...file, folderId: folder.id })
        continue
      }
      batch.push(file)
      touched.add(topLevelKey(file.relativePath))
      if (batch.length >= BATCH_SIZE) {
        await flush(libraryId, folder.id, seenAt, batch)
        counts.written += batch.length
        batch = []
      }
    }
    // Stop before anything is deleted. The next scan redoes it.
    if (signal.aborted) break
    await flush(libraryId, folder.id, seenAt, batch)
    counts.written += batch.length
  }
  await dateFiles(undated)
  return held
}

/** The known files the walk didn't find again that are gone, not kept. */
function goneFiles(
  known: Map<string, KnownFile>,
  targets: Targets,
  state: WalkState,
  counts: ScanCounts,
): KnownFile[] {
  const leftover: KnownFile[] = []
  for (const row of known.values()) {
    const result = fate(row.path, targets, state)
    if (result === "gone") leftover.push(row)
    else if (result === "kept") counts.kept++
  }
  return leftover
}

async function runScan(
  request: ScanRequest,
  signal: AbortSignal,
): Promise<void> {
  const { libraryId } = request
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
  // Top-level entries with a file that came, changed, moved, or went.
  const touched = new Set<string>()
  const held = await walkTargets(
    libraryId,
    folders,
    targets,
    state,
    known,
    startedAt,
    counts,
    touched,
    signal,
  )
  if (signal.aborted) {
    log.info(`Scan of library ${lib.name} stopped`)
    return
  }

  // Left over: files the walk didn't find again.
  const leftover = goneFiles(known, targets, state, counts)
  const settled = await settle(
    libraryId,
    folders,
    leftover,
    held,
    startedAt,
    counts,
    touched,
    signal,
  )
  if (!settled) {
    log.info(`Scan of library ${lib.name} stopped`)
    return
  }

  await updateSidecars(lib.name, libraryId, targets, state, signal)
  if (regroupAll) await assignTitles(libraryId, lib.kind)
  else if (touched.size > 0) await assignTitles(libraryId, lib.kind, touched)
  libraryChanged(libraryId)
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

function mergeTargets(a: Targets | null, b: Targets | null): Targets | null {
  if (!a || !b) return null
  const merged: Targets = new Map(a)
  for (const [path, deep] of b) addTarget(merged, path, deep)
  return merged
}

/**
 * Library scans, one at a time across libraries. Requests for a library
 * that is waiting merge into one scan, and a request during its scan runs
 * after it, since that scan may have walked past the change; a plain full
 * scan joins a full one already running. A scan queues the metadata and
 * media probes its files need, which run on their own.
 */
export const scans = defineQueue<ScanRequest, void>({
  id: "library-scan",
  name: "Library scans",
  description: "Walk library folders for new, changed, and removed files.",
  concurrency: 1,
  key: (request) => request.libraryId,
  label: (request) => `library ${request.libraryId}`,
  group: (request) => request.libraryId,
  merge: (waiting, incoming) => ({
    libraryId: waiting.libraryId,
    targets: mergeTargets(waiting.targets, incoming.targets),
    regroup: waiting.regroup || incoming.regroup,
  }),
  joinsRunning: (running, incoming) =>
    !running.targets && !incoming.targets && !incoming.regroup,
  failure: (request) => `Scan of library ${request.libraryId} failed`,
  run: async (request, { signal }) => {
    await runScan(request, signal)
    if (signal.aborted) return
    queueRefresh(request.libraryId)
    queueFileWork(request.libraryId)
  },
})

/**
 * Probe the library's new and changed files, then make their trickplay
 * images, which need the probe's video stream. Both are left to their
 * queues.
 */
function queueFileWork(libraryId: string): void {
  probeMissing({ libraryId })
    .then(async () => {
      queueTrickplay(libraryId)
      await prepareMissingSubtitles({ libraryId })
    })
    .catch((cause: unknown) =>
      log.error(`Couldn't queue media probes for library ${libraryId}`, cause),
    )
}

export function isScanning(libraryId: string): boolean {
  return scans.has(libraryId)
}

export type ScanOptions = {
  /** Folders to scan, as the watcher collects them. Unset scans all. */
  targets?: Targets
  /** Regroup every title, for a library that was created or edited. */
  regroup?: boolean
}

/**
 * Queue a scan; the queue logs its failure. Watcher scans are small, so
 * they go first.
 */
export function scanLibrary(
  libraryId: string,
  options: ScanOptions = {},
): void {
  const priority: Priority = options.targets ? "high" : "normal"
  scans.push(
    {
      libraryId,
      targets: options.targets ?? null,
      regroup: options.regroup ?? false,
    },
    { priority },
  )
}
