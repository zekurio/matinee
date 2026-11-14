import { mediaItem, type MediaItemRow } from "@matinee/db"
import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "../db"
import { titleFromFilename } from "../media/title"
import { matchMoves } from "./moves"
import { below, type Folder } from "./plan"
import { isInside, type Targets } from "./targets"
import { topLevelKey } from "./titles"
import type { FoundFile } from "./walk"

export const BATCH_SIZE = 500

/** The columns a scan writes, as the last write left them. */
export type KnownFile = Pick<
  MediaItemRow,
  | "id"
  | "path"
  | "folderId"
  | "relativePath"
  | "title"
  | "container"
  | "sizeBytes"
  | "modifiedAt"
  | "fileCreatedAt"
>

/** A new file held back until the scan knows whether it was moved. */
export type HeldFile = FoundFile & { folderId: string }

/** What a scan did, for its log line. */
export type ScanCounts = {
  added: number
  found: number
  written: number
  moved: number
  gone: number
  kept: number
}

function fileTitle(file: FoundFile): string {
  return titleFromFilename(file.relativePath.split("/").at(-1) ?? "")
}

/**
 * True when writing the file again would only bump `seenAt`. A ctime moves
 * on a chmod, so `fileCreatedAt` alone doesn't count as a change.
 */
export function unchanged(known: KnownFile, folderId: string, file: FoundFile) {
  return (
    known.folderId === folderId &&
    known.relativePath === file.relativePath &&
    known.container === file.container &&
    known.sizeBytes === file.sizeBytes &&
    known.modifiedAt.getTime() === file.modifiedAt.getTime() &&
    known.title === fileTitle(file)
  )
}

export async function flush(
  libraryId: string,
  folderId: string,
  seenAt: Date,
  batch: FoundFile[],
): Promise<number> {
  if (batch.length === 0) return 0
  const rows = await db
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
        fileCreatedAt: file.fileCreatedAt,
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
        // The earliest one: a file replaced in place keeps when it came.
        fileCreatedAt: sql`least(${mediaItem.fileCreatedAt}, excluded.file_created_at)`,
        seenAt: sql`excluded.seen_at`,
        // A file that changed gets probed again.
        probedAt: sql`case when ${mediaItem.sizeBytes} = excluded.size_bytes and ${mediaItem.modifiedAt} = excluded.modified_at then ${mediaItem.probedAt} else null end`,
      },
    })
    .returning({ inserted: sql<boolean>`xmax = 0` })
  return rows.filter((row) => row.inserted).length
}

/**
 * Give rows from before `fileCreatedAt` existed the one the walk read,
 * without writing them as changed.
 */
export async function dateFiles(
  files: { id: string; fileCreatedAt: Date }[],
): Promise<void> {
  if (files.length === 0) return
  const values = sql.join(
    files.map(
      (file) => sql`(${file.id}::uuid, ${file.fileCreatedAt}::timestamptz)`,
    ),
    sql`, `,
  )
  await db.execute(
    sql`update ${mediaItem} set file_created_at = dated.at from (values ${values}) as dated(id, at) where ${mediaItem.id} = dated.id and ${mediaItem.fileCreatedAt} is null`,
  )
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
        // A copy to another disk is newer than the file it moved.
        fileCreatedAt: sql`least(${mediaItem.fileCreatedAt}, ${file.fileCreatedAt}::timestamptz)`,
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
export async function loadKnown(
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
        fileCreatedAt: mediaItem.fileCreatedAt,
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
 * when it stopped before deleting, for shutdown or a cancel.
 */
export async function settle(
  libraryId: string,
  folders: Folder[],
  leftover: KnownFile[],
  held: HeldFile[],
  seenAt: Date,
  counts: ScanCounts,
  touched: Set<string>,
  signal: AbortSignal,
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
      counts.added += await flush(
        libraryId,
        folder.id,
        seenAt,
        files.slice(i, i + BATCH_SIZE),
      )
    }
  }
  counts.written += added.length
  for (const file of added) touched.add(topLevelKey(file.relativePath))

  const gone = leftover.filter((row) => !movedRows.has(row))
  // Stop before deleting. Moved and new files have no title
  // yet, so the next scan regroups everything.
  if (gone.length > 0 && signal.aborted) return false
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
