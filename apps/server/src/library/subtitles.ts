import { readdir, stat } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"

import { mediaItem, subtitleFile } from "@matinee/db"
import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { languageFromName, languageTag } from "../media/language"
import { shutdownSignal } from "../shutdown"
import { isIgnored, isSubtitleFolder, subtitleFormat } from "./entries"
import { below, directlyIn, type Listing, type WalkState } from "./plan"
import { errorCode, isInside, type Targets } from "./targets"

const BATCH_SIZE = 500

type SidecarInfo = {
  language: string | null
  title: string | null
  forced: boolean
  sdh: boolean
  isDefault: boolean
}

type Video = { id: string; stem: string }

type FoundSubtitle = SidecarInfo & {
  mediaItemId: string
  path: string
  format: string
}

/** A row from an earlier scan, with the folder its video is in now. */
type KnownSubtitle = FoundSubtitle & { id: string; videoDir: string }

/** What a scan did to subtitle rows, for its log line. */
export type SidecarCounts = { written: number; moved: number; gone: number }

/**
 * Read the language and flags from what follows the video's name in a
 * subtitle file name: `en`, `eng.forced`, `de.sdh`, or `2_English` in a Subs
 * folder. Other words become the title.
 */
function parseSidecarName(rest: string): SidecarInfo {
  const info: SidecarInfo = {
    language: null,
    title: null,
    forced: false,
    sdh: false,
    isDefault: false,
  }
  const extra: string[] = []
  for (const word of rest.split(/[\s._()[\]]+/)) {
    const lower = word.toLowerCase()
    // Numbers count tracks, as in `2_English.srt`.
    if (!word || /^\d+$/.test(word)) continue
    if (lower === "forced" || lower === "foreign") {
      info.forced = true
    } else if (lower === "sdh" || lower === "cc") {
      info.sdh = true
    } else if (lower === "hi" && info.language) {
      // `hi` alone is Hindi; after a language it means hearing impaired.
      info.sdh = true
    } else if (lower === "default") {
      info.isDefault = true
    } else {
      const language = info.language
        ? null
        : (languageTag(word) ?? languageFromName(word))
      if (language) info.language = language
      else extra.push(word)
    }
  }
  info.title = extra.length > 0 ? extra.join(" ") : null
  return info
}

/**
 * List a Subs folder the walk didn't enter. Null when it can't be read;
 * that and entries it can't stat go to `unreadable`, so their rows stay.
 */
async function readListing(
  dir: string,
  unreadable: Set<string>,
): Promise<Listing | null> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (cause) {
    log.warn(
      `Couldn't read ${dir} (${errorCode(cause) ?? "unknown error"}), keeping its subtitles`,
    )
    unreadable.add(dir)
    return null
  }
  const listing: Listing = { subtitles: [], folders: [] }
  for (const entry of entries) {
    if (isIgnored(entry.name)) continue
    let isDir = entry.isDirectory()
    let isFile = entry.isFile()
    if (entry.isSymbolicLink()) {
      const target = await stat(join(dir, entry.name)).catch(() => null)
      if (!target) {
        unreadable.add(join(dir, entry.name))
        continue
      }
      isDir = target.isDirectory()
      isFile = target.isFile()
    }
    if (isDir) listing.folders.push(entry.name)
    else if (isFile && subtitleFormat(entry.name)) {
      listing.subtitles.push(entry.name)
    }
  }
  return listing
}

/**
 * Subtitle files that belong to the videos in one folder: `<video>.*.srt`
 * beside them or in a Subs folder, any subtitle in `Subs/<video>/`, and any
 * subtitle in Subs when the folder holds one video.
 */
async function findInFolder(
  dir: string,
  videos: Video[],
  lookup: (dir: string) => Promise<Listing | null>,
): Promise<FoundSubtitle[]> {
  // The longest name wins, so `Movie.Extended.en.srt` goes to
  // `Movie.Extended.mkv` and not to `Movie.mkv`.
  const owner = (name: string) => {
    const lower = name.toLowerCase()
    let best: Video | null = null
    for (const video of videos) {
      if (!lower.startsWith(`${video.stem.toLowerCase()}.`)) continue
      if (!best || video.stem.length > best.stem.length) best = video
    }
    return best
  }
  const found: FoundSubtitle[] = []
  const add = (video: Video, path: string) => {
    const format = subtitleFormat(path)
    if (!format) return
    let rest = basename(path).slice(0, -(format.length + 1))
    if (rest.toLowerCase().startsWith(`${video.stem.toLowerCase()}.`)) {
      rest = rest.slice(video.stem.length + 1)
    } else if (rest.toLowerCase() === video.stem.toLowerCase()) {
      rest = ""
    }
    found.push({
      mediaItemId: video.id,
      path,
      format,
      ...parseSidecarName(rest),
    })
  }

  const listing = await lookup(dir)
  for (const name of listing?.subtitles ?? []) {
    const video = owner(name)
    if (video) add(video, join(dir, name))
  }
  for (const name of listing?.folders ?? []) {
    if (!isSubtitleFolder(name)) continue
    const subs = join(dir, name)
    const inner = await lookup(subs)
    for (const file of inner?.subtitles ?? []) {
      const video = owner(file) ?? (videos.length === 1 ? videos[0] : null)
      if (video) add(video, join(subs, file))
    }
    // Release packs put each episode's subtitles in `Subs/<episode>/`.
    for (const folder of inner?.folders ?? []) {
      const video = videos.find(
        (candidate) => candidate.stem.toLowerCase() === folder.toLowerCase(),
      )
      if (!video) continue
      const files = await lookup(join(subs, folder))
      for (const file of files?.subtitles ?? []) {
        add(video, join(subs, folder, file))
      }
    }
  }
  return found
}

function sameInfo(a: FoundSubtitle, b: FoundSubtitle): boolean {
  return (
    a.format === b.format &&
    a.language === b.language &&
    a.title === b.title &&
    a.forced === b.forced &&
    a.sdh === b.sdh &&
    a.isDefault === b.isDefault
  )
}

const key = (row: { mediaItemId: string; path: string }) =>
  `${row.mediaItemId}\0${row.path}`

/** The same track of the same video, whatever its path. */
const trackKey = (row: FoundSubtitle) =>
  JSON.stringify([
    row.mediaItemId,
    row.format,
    row.language,
    row.title,
    row.forced,
    row.sdh,
    row.isDefault,
  ])

/**
 * Pair rows whose file is gone with new files of the same track, so a
 * subtitle that moved or was renamed with its video keeps its id. Only
 * pairs where each side has one candidate.
 */
function matchMoves(
  gone: KnownSubtitle[],
  added: FoundSubtitle[],
): [KnownSubtitle, FoundSubtitle][] {
  const group = <Row extends FoundSubtitle>(rows: Row[]) => {
    const groups = new Map<string, Row[]>()
    for (const row of rows) {
      const same = groups.get(trackKey(row))
      if (same) same.push(row)
      else groups.set(trackKey(row), [row])
    }
    return groups
  }
  const files = group(added)
  const pairs: [KnownSubtitle, FoundSubtitle][] = []
  for (const [track, rows] of group(gone)) {
    const fits = files.get(track) ?? []
    const [row] = rows
    const [file] = fits
    if (rows.length === 1 && fits.length === 1 && row && file) {
      pairs.push([row, file])
    }
  }
  return pairs
}

/**
 * True when a row's file is gone: its video moved away from it, or every
 * folder between them was read. One that couldn't be read keeps it.
 */
function isGone(row: KnownSubtitle, unreadable: Set<string>): boolean {
  if (!isInside(row.path, row.videoDir)) return true
  for (let at = row.path; at !== row.videoDir; at = dirname(at)) {
    if (unreadable.has(at)) return false
  }
  return true
}

/**
 * Videos in the folders the walk listed, and their subtitle rows. A
 * listing-only target lists just its own folder.
 */
async function loadVideos(
  libraryId: string,
  targets: Targets,
  listed: Map<string, Listing>,
): Promise<{
  videos: Map<string, Video[]>
  known: Map<string, KnownSubtitle>
}> {
  const videos = new Map<string, Video[]>()
  const known = new Map<string, KnownSubtitle>()
  for (const [target, deep] of targets) {
    const rows = await db
      .select({
        id: mediaItem.id,
        path: mediaItem.path,
        subtitle: subtitleFile,
      })
      .from(mediaItem)
      .leftJoin(subtitleFile, eq(subtitleFile.mediaItemId, mediaItem.id))
      .where(
        and(
          eq(mediaItem.libraryId, libraryId),
          deep
            ? below(mediaItem.path, target)
            : directlyIn(mediaItem.path, target),
        ),
      )
    const seen = new Set<string>()
    for (const row of rows) {
      const dir = dirname(row.path)
      if (!listed.has(dir)) continue
      if (row.subtitle) {
        known.set(key(row.subtitle), { ...row.subtitle, videoDir: dir })
      }
      if (seen.has(row.id)) continue
      seen.add(row.id)
      const video = { id: row.id, stem: basename(row.path, extname(row.path)) }
      const inDir = videos.get(dir)
      if (inDir) inDir.push(video)
      else videos.set(dir, [video])
    }
  }
  return { videos, known }
}

/**
 * Bring the subtitle rows of the videos in the folders the walk listed up
 * to date, from those listings and their Subs folders. Rows of other
 * videos aren't touched, rows below a folder that couldn't be read stay,
 * and nothing is deleted once shutdown is requested.
 */
export async function syncSidecars(
  libraryId: string,
  targets: Targets,
  state: WalkState,
): Promise<SidecarCounts> {
  const counts: SidecarCounts = { written: 0, moved: 0, gone: 0 }
  const { videos, known } = await loadVideos(libraryId, targets, state.listed)
  // Subs folders a listing-only walk didn't enter get listed here, once.
  const extra = new Map<string, Promise<Listing | null>>()
  const lookup = (dir: string) => {
    const listed = state.listed.get(dir)
    if (listed) return Promise.resolve(listed)
    if (state.unreadable.has(dir)) return Promise.resolve(null)
    let listing = extra.get(dir)
    if (!listing) {
      listing = readListing(dir, state.unreadable)
      extra.set(dir, listing)
    }
    return listing
  }
  const found = new Map<string, FoundSubtitle>()
  for (const [dir, inDir] of videos) {
    if (shutdownSignal.aborted) return counts
    for (const file of await findInFolder(dir, inDir, lookup)) {
      found.set(key(file), file)
    }
  }

  const added = [...found.values()].filter((file) => !known.has(key(file)))
  const changed = [...found.values()].filter((file) => {
    const row = known.get(key(file))
    return row && !sameInfo(row, file)
  })
  const leftover = [...known.values()].filter(
    (row) => !found.has(key(row)) && isGone(row, state.unreadable),
  )
  const moves = matchMoves(leftover, added)
  const movedRows = new Set<KnownSubtitle>()
  const movedFiles = new Set<FoundSubtitle>()
  for (const [row, file] of moves) {
    movedRows.add(row)
    movedFiles.add(file)
    await db
      .update(subtitleFile)
      .set({ path: file.path })
      .where(eq(subtitleFile.id, row.id))
  }
  counts.moved = moves.length

  // Upsert on the file's path, so a track keeps its id across scans.
  const writes = [
    ...added.filter((file) => !movedFiles.has(file)),
    ...changed,
  ].map((file) => ({
    mediaItemId: file.mediaItemId,
    path: file.path,
    format: file.format,
    language: file.language,
    title: file.title,
    forced: file.forced,
    sdh: file.sdh,
    isDefault: file.isDefault,
  }))
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    await db
      .insert(subtitleFile)
      .values(writes.slice(i, i + BATCH_SIZE))
      .onConflictDoUpdate({
        target: [subtitleFile.mediaItemId, subtitleFile.path],
        set: {
          format: sql`excluded.format`,
          language: sql`excluded.language`,
          title: sql`excluded.title`,
          forced: sql`excluded.forced`,
          sdh: sql`excluded.sdh`,
          isDefault: sql`excluded.is_default`,
        },
      })
  }
  counts.written = writes.length

  const gone = leftover
    .filter((row) => !movedRows.has(row))
    .map((row) => row.id)
  if (gone.length > 0 && shutdownSignal.aborted) return counts
  for (let i = 0; i < gone.length; i += BATCH_SIZE) {
    await db
      .delete(subtitleFile)
      .where(inArray(subtitleFile.id, gone.slice(i, i + BATCH_SIZE)))
  }
  counts.gone = gone.length
  return counts
}
