import { readdir, realpath, stat } from "node:fs/promises"
import { join, relative } from "node:path"

import { log } from "../log"
import { videoContainer } from "../media/mime"
import { isIgnored, subtitleFormat } from "./entries"
import type { Listing, WalkState } from "./plan"
import { errorCode } from "./targets"

export type FoundFile = {
  path: string
  relativePath: string
  container: string
  sizeBytes: number
  modifiedAt: Date
  /** See `mediaItem.fileCreatedAt`. */
  fileCreatedAt: Date
}

/**
 * Walk a folder for video files, or with `deep` false look only at its own
 * entries. Skips hidden entries and symlink loops, notes what it couldn't
 * read so the scan keeps the files there, and keeps each listing's
 * subtitle files and folders for finding sidecars after.
 */
export async function* walk(
  root: string,
  dir: string,
  deep: boolean,
  state: WalkState,
  signal: AbortSignal,
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
    if (signal.aborted) return
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
      if (deep) yield* walk(root, path, true, state, signal)
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
      // A file system without birth times reports 0 for it.
      fileCreatedAt: info.birthtimeMs > 0 ? info.birthtime : info.ctime,
    }
  }
}
