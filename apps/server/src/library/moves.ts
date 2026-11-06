import { basename } from "node:path"

/** What a scan knows about a file, from the disk or an earlier scan. */
type FileFacts = { path: string; sizeBytes: number; modifiedAt: Date }

/**
 * Two files are one moved or renamed when they share a key: the same size
 * and file name (a move), or the same size and mtime (a rename, which is
 * how Sonarr renames).
 */
function moveKeys(file: FileFacts): [string, string] {
  return [
    `${file.sizeBytes}/${basename(file.path)}`,
    `${file.sizeBytes}@${file.modifiedAt.getTime()}`,
  ]
}

/** Files by one of their move keys. */
function indexBy<File extends FileFacts>(
  files: File[],
  key: (file: FileFacts) => string,
): Map<string, File[]> {
  const index = new Map<string, File[]>()
  for (const file of files) {
    const same = index.get(key(file))
    if (same) same.push(file)
    else index.set(key(file), [file])
  }
  return index
}

const byName = (file: FileFacts) => moveKeys(file)[0]
const byTime = (file: FileFacts) => moveKeys(file)[1]

/** Files by both move keys, to find candidates without a full search. */
export function indexMoves<File extends FileFacts>(
  files: File[],
): Map<string, File[]> {
  return new Map([...indexBy(files, byName), ...indexBy(files, byTime)])
}

/**
 * Pair rows a scan didn't find with files it found new, as Navidrome does:
 * first by size and name, then what's left by size and mtime. A pair needs
 * each side to have the other as its only candidate, so lookalikes stay
 * apart.
 */
export function matchMoves<Gone extends FileFacts, Added extends FileFacts>(
  gone: Gone[],
  added: Added[],
): [Gone, Added][] {
  const pairs: [Gone, Added][] = []
  const paired = new Set<FileFacts>()
  for (const key of [byName, byTime]) {
    const rows = gone.filter((row) => !paired.has(row))
    const files = added.filter((file) => !paired.has(file))
    const rowIndex = indexBy(rows, key)
    const fileIndex = indexBy(files, key)
    for (const row of rows) {
      const fits = fileIndex.get(key(row)) ?? []
      const [file] = fits
      if (fits.length !== 1 || !file) continue
      if (rowIndex.get(key(file))?.length !== 1) continue
      pairs.push([row, file])
      paired.add(row)
      paired.add(file)
    }
  }
  return pairs
}

/** True when a new file could pair with a row the scan hasn't found yet. */
export function mayBeMoved<Known extends FileFacts>(
  file: FileFacts,
  index: Map<string, Known[]>,
  unfound: (row: Known) => boolean,
): boolean {
  return moveKeys(file).some((key) => index.get(key)?.some(unfound))
}
