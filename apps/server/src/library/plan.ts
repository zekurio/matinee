import { opendir } from "node:fs/promises"
import { dirname, relative, sep } from "node:path"

import { libraryFolder, mediaItem } from "@matinee/db"
import { and, type Column, count, eq, sql } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { isIgnored, subtitleOwnerFolder } from "./entries"
import {
  addTarget,
  errorCode,
  isInside,
  resolveTarget,
  type Targets,
} from "./targets"

export type Folder = typeof libraryFolder.$inferSelect

/** A folder's subtitle files and subfolders, by name, for finding sidecars. */
export type Listing = { subtitles: string[]; folders: string[] }

/** What a walk saw besides the files it found. */
export type WalkState = {
  /** Real paths of folders already walked, to skip symlink loops. */
  visited: Set<string>
  /** Listings that failed and entries it couldn't stat. Files at or below them stay. */
  unreadable: Set<string>
  /** Folders a listing-only walk saw but didn't enter. Files below them aren't its business. */
  notEntered: Set<string>
  /** Folders the walk listed in full, for the subtitles of their videos. */
  listed: Map<string, Listing>
}

export function newWalkState(): WalkState {
  return {
    visited: new Set(),
    unreadable: new Set(),
    notEntered: new Set(),
    listed: new Map(),
  }
}

/** Rows whose path is below a folder. */
export function below(column: Column, dir: string) {
  return sql`starts_with(${column}, ${dir.endsWith(sep) ? dir : dir + sep})`
}

/** Rows whose path is directly in a folder, not in a folder below it. */
export function directlyIn(column: Column, dir: string) {
  const prefix = dir.endsWith(sep) ? dir : dir + sep
  return sql`(starts_with(${column}, ${prefix}) and strpos(substr(${column}, length(${prefix}) + 1), '/') = 0)`
}

async function filesBelow(libraryId: string, dir: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(mediaItem)
    .where(and(eq(mediaItem.libraryId, libraryId), below(mediaItem.path, dir)))
  return row?.n ?? 0
}

/**
 * Check a library folder before scanning it. One that is missing, can't be
 * read, or is empty while it still has files is usually an unmounted
 * share, and scanning it would drop them all. Returns how many files that
 * keeps, or null when the folder is fine.
 */
async function offlineFiles(
  libraryId: string,
  folder: Folder,
): Promise<number | null> {
  let empty = true
  try {
    for await (const entry of await opendir(folder.path)) {
      if (isIgnored(entry.name)) continue
      empty = false
      break
    }
  } catch (cause) {
    const files = await filesBelow(libraryId, folder.path)
    log.warn(
      `Library folder ${folder.path} is missing or can't be read (${errorCode(cause) ?? "unknown error"}), so its ${files} files stay. If it's gone for good, remove it from the library.`,
    )
    return files
  }
  if (!empty) return null
  const files = await filesBelow(libraryId, folder.path)
  if (files === 0) return null
  log.warn(
    `Library folder ${folder.path} is empty, so its ${files} files stay in case it's an unmounted share. If it really is empty now, remove it from the library.`,
  )
  return files
}

/** The library folder a path is in, the deepest one if they nest. */
export function folderOf(folders: Folder[], path: string): Folder | undefined {
  let best: Folder | undefined
  for (const folder of folders) {
    if (!isInside(path, folder.path)) continue
    if (!best || folder.path.length > best.path.length) best = folder
  }
  return best
}

/**
 * The folders to walk: every library folder for a full scan, else the
 * requested ones, plus the folder above a `Subs` target. Skips library
 * folders that are offline and marks them so nothing below them goes, and
 * moves a target that went away up to the nearest folder that's still
 * there. Returns the targets and how many files the offline folders keep.
 */
export async function planScan(
  libraryId: string,
  folders: Folder[],
  requested: Targets | null,
  state: WalkState,
): Promise<{ targets: Targets; kept: number }> {
  const wanted = new Map<Folder, Targets>()
  if (!requested) {
    for (const folder of folders) {
      wanted.set(folder, new Map([[folder.path, true]]))
    }
  } else {
    for (const [path, deep] of requested) {
      // A folder removed from the library since has nothing to scan.
      const folder = folderOf(folders, path)
      if (!folder) continue
      const targets: Targets = wanted.get(folder) ?? new Map()
      addTarget(targets, path, deep)
      // Subtitles in a Subs folder belong to the videos beside it.
      const owner = subtitleOwnerFolder(path)
      if (owner && isInside(owner, folder.path)) {
        addTarget(targets, owner, false)
      }
      wanted.set(folder, targets)
    }
  }
  const targets: Targets = new Map()
  let kept = 0
  for (const [folder, wantedHere] of wanted) {
    const offline = await offlineFiles(libraryId, folder)
    if (offline !== null) {
      kept += offline
      state.unreadable.add(folder.path)
      continue
    }
    for (const [path, deep] of wantedHere) {
      const resolved = await resolveTarget(path, deep, folder.path)
      addTarget(targets, resolved.path, resolved.deep)
    }
  }
  return { targets, kept }
}

/**
 * What happens to a file the walk didn't find: it's gone, unless a listing
 * at or above it failed, or it's below a folder that a listing-only target
 * saw but didn't enter. The deepest target above it decides.
 */
export function fate(
  path: string,
  targets: Targets,
  state: WalkState,
): "gone" | "kept" | "unseen" {
  for (let dir = path; ; dir = dirname(dir)) {
    if (state.unreadable.has(dir)) return "kept"
    if (targets.has(dir)) return "gone"
    if (state.notEntered.has(dir)) return "unseen"
    if (dirname(dir) === dir) return "unseen"
  }
}

/** The targets for the log line, relative to their library folder. */
export function describeTargets(folders: Folder[], targets: Targets): string {
  const names = [...targets].map(([path, deep]) => {
    const folder = folderOf(folders, path)
    const name = (folder && relative(folder.path, path)) || path
    return deep ? name : `${name} (listing only)`
  })
  const more = names.length > 5 ? `, and ${names.length - 5} more` : ""
  return names.slice(0, 5).join(", ") + more
}
