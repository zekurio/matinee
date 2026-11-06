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

/** Entries scans and the watcher skip: hidden ones and system folders. */
export function isIgnored(name: string): boolean {
  return name.startsWith(".") || SYSTEM_FOLDERS.has(name.toLowerCase())
}

/**
 * True when a scan reads a file with this name, so a change to it is worth
 * a scan of its folder.
 */
export function isScannedFile(name: string): boolean {
  return !isIgnored(name) && videoContainer(name) !== null
}
