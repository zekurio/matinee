import { stat } from "node:fs/promises"
import { dirname, sep } from "node:path"

import { z } from "zod"

/**
 * Folders a scan covers, by absolute path. True walks everything below the
 * folder. False lists only the folder's own entries, which is enough for a
 * file in it that changed or an entry that went away.
 */
export type Targets = Map<string, boolean>

/** Node's fs errors carry a code such as ENOENT. */
const SystemError = z.object({ code: z.string().min(1) })

export function errorCode(cause: unknown): string | undefined {
  return SystemError.safeParse(cause).data?.code
}

/** True when `path` is `dir` or below it. */
export function isInside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep)
}

/**
 * Add a folder to scan. A folder whose whole subtree is queued covers
 * everything below it, and a new subtree replaces the folders below it.
 */
export function addTarget(targets: Targets, path: string, deep: boolean) {
  for (let dir = path; ; dir = dirname(dir)) {
    if (targets.get(dir) === true) return
    if (dirname(dir) === dir) break
  }
  if (!deep) {
    if (!targets.has(path)) targets.set(path, false)
    return
  }
  for (const queued of targets.keys()) {
    if (isInside(queued, path)) targets.delete(queued)
  }
  targets.set(path, true)
}

/**
 * The nearest folder at or above `path` that still exists, stopping at the
 * library folder `root`. Listing the parent of a folder that went away
 * drops its files, so a target that moved up lists only that parent.
 */
export async function resolveTarget(
  path: string,
  deep: boolean,
  root: string,
): Promise<{ path: string; deep: boolean }> {
  let dir = path
  while (dir !== root && isInside(dir, root)) {
    try {
      if ((await stat(dir)).isDirectory()) break
    } catch (cause) {
      // Anything but "not there", such as no permission, is the walk's to
      // report, and it keeps the files below.
      const code = errorCode(cause)
      if (code !== "ENOENT" && code !== "ENOTDIR") break
    }
    dir = dirname(dir)
  }
  return dir === path ? { path, deep } : { path: dir, deep: false }
}
