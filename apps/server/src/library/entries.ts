import { basename, dirname, extname } from "node:path"

import { videoContainer } from "../media/mime"

// Folders that NAS systems and file managers keep for themselves.
const SYSTEM_FOLDERS = new Set([
  "#recycle",
  "#snapshot",
  "$recycle.bin",
  "@eadir",
  "@recently-snapshot",
  "@recycle",
  "lost+found",
])

/** Extensions of subtitle files. `sup` (PGS) and `idx` (VobSub) are pictures. */
const SUBTITLE_FORMATS = new Set(["srt", "vtt", "ass", "ssa", "sup", "idx"])
// Folders beside a video that hold its subtitles, in lower case.
const SUBTITLE_FOLDERS = new Set(["subs", "subtitles"])

/** Entries scans and the watcher skip: hidden ones and system folders. */
export function isIgnored(name: string): boolean {
  return name.startsWith(".") || SYSTEM_FOLDERS.has(name.toLowerCase())
}

export function subtitleFormat(name: string): string | null {
  const ext = extname(name).slice(1).toLowerCase()
  return SUBTITLE_FORMATS.has(ext) ? ext : null
}

export function isSubtitleFolder(name: string): boolean {
  return SUBTITLE_FOLDERS.has(name.toLowerCase())
}

/**
 * The folder whose videos own the subtitles in `dir`, when `dir` is a `Subs`
 * folder or a `Subs/<video>` folder. Null for any other folder.
 */
export function subtitleOwnerFolder(dir: string): string | null {
  const parent = dirname(dir)
  if (isSubtitleFolder(basename(dir))) return parent
  if (isSubtitleFolder(basename(parent))) return dirname(parent)
  return null
}

/**
 * True when a scan reads a file with this name, so a change to it is worth
 * a scan of its folder.
 */
export function isScannedFile(name: string): boolean {
  return (
    !isIgnored(name) &&
    (videoContainer(name) !== null || subtitleFormat(name) !== null)
  )
}
