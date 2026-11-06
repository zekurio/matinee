import type { Dirent } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"

import { mediaItem, subtitleFile } from "@matinee/db"
import { eq, inArray, sql } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { languageFromName, languageTag } from "../media/language"
import { limiter } from "../media/process"

/** Extensions of subtitle files. `sup` (PGS) and `idx` (VobSub) are pictures. */
const SUBTITLE_FORMATS = new Set(["srt", "vtt", "ass", "ssa", "sup", "idx"])
// Folders beside a video that hold its subtitles, in lower case.
const SUBTITLE_FOLDERS = new Set(["subs", "subtitles"])
const BATCH_SIZE = 500
// Listing a folder is quick on a local disk and slow on a network share.
const withSlot = limiter(8)

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

function subtitleFormat(name: string): string | null {
  const ext = extname(name).slice(1).toLowerCase()
  return SUBTITLE_FORMATS.has(ext) ? ext : null
}

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

/** Whether a folder entry is a file or folder, following symlinks. */
async function entryKind(
  dir: string,
  entry: Dirent,
): Promise<"file" | "dir" | null> {
  if (entry.isFile()) return "file"
  if (entry.isDirectory()) return "dir"
  if (!entry.isSymbolicLink()) return null
  const target = await stat(join(dir, entry.name)).catch(() => null)
  if (target?.isFile()) return "file"
  if (target?.isDirectory()) return "dir"
  return null
}

async function list(dir: string): Promise<Dirent[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter((entry) => !entry.name.startsWith("."))
}

/**
 * Subtitle files that belong to the videos in one folder: `<video>.*.srt`
 * beside them or in a Subs folder, any subtitle in `Subs/<video>/`, and any
 * subtitle in Subs when the folder holds one video. Null when the folder
 * can't be read.
 */
async function findInFolder(
  dir: string,
  videos: Video[],
): Promise<FoundSubtitle[] | null> {
  let entries
  try {
    entries = await list(dir)
  } catch {
    return null
  }
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
  const add = (video: Video, path: string, format: string) => {
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

  // Names are checked before types, so only likely entries cost a stat.
  for (const entry of entries) {
    const path = join(dir, entry.name)
    const format = subtitleFormat(entry.name)
    if (format) {
      const video = owner(entry.name)
      if (video && (await entryKind(dir, entry)) === "file") {
        add(video, path, format)
      }
      continue
    }
    if (
      !SUBTITLE_FOLDERS.has(entry.name.toLowerCase()) ||
      (await entryKind(dir, entry)) !== "dir"
    ) {
      continue
    }
    for (const inner of await list(path).catch(() => [])) {
      const innerPath = join(path, inner.name)
      const innerFormat = subtitleFormat(inner.name)
      if (innerFormat) {
        const video =
          owner(inner.name) ?? (videos.length === 1 ? videos[0] : undefined)
        if (video && (await entryKind(path, inner)) === "file") {
          add(video, innerPath, innerFormat)
        }
        continue
      }
      // Release packs put each episode's subtitles in `Subs/<episode>/`.
      const video = videos.find(
        (candidate) =>
          candidate.stem.toLowerCase() === inner.name.toLowerCase(),
      )
      if (!video || (await entryKind(path, inner)) !== "dir") continue
      for (const file of await list(innerPath).catch(() => [])) {
        const fileFormat = subtitleFormat(file.name)
        if (fileFormat && (await entryKind(innerPath, file)) === "file") {
          add(video, join(innerPath, file.name), fileFormat)
        }
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

async function runSync(libraryId: string): Promise<void> {
  const items = await db
    .select({ id: mediaItem.id, path: mediaItem.path })
    .from(mediaItem)
    .where(eq(mediaItem.libraryId, libraryId))
  const folders = new Map<string, Video[]>()
  for (const item of items) {
    const dir = dirname(item.path)
    const video = { id: item.id, stem: basename(item.path, extname(item.path)) }
    const videos = folders.get(dir)
    if (videos) videos.push(video)
    else folders.set(dir, [video])
  }

  const key = (row: { mediaItemId: string; path: string }) =>
    `${row.mediaItemId}\0${row.path}`
  const found = new Map<string, FoundSubtitle>()
  // Items whose folder was read. The rest keep their rows.
  const checked = new Set<string>()
  await Promise.all(
    [...folders].map(([dir, videos]) =>
      withSlot(async () => {
        const files = await findInFolder(dir, videos)
        if (!files) return
        for (const video of videos) checked.add(video.id)
        for (const file of files) found.set(key(file), file)
      }),
    ),
  )

  const existing = await db
    .select({
      id: subtitleFile.id,
      mediaItemId: subtitleFile.mediaItemId,
      path: subtitleFile.path,
      format: subtitleFile.format,
      language: subtitleFile.language,
      title: subtitleFile.title,
      forced: subtitleFile.forced,
      sdh: subtitleFile.sdh,
      isDefault: subtitleFile.isDefault,
    })
    .from(subtitleFile)
    .innerJoin(mediaItem, eq(mediaItem.id, subtitleFile.mediaItemId))
    .where(eq(mediaItem.libraryId, libraryId))
  const known = new Map(existing.map((row) => [key(row), row]))

  // Upsert on the file's path, so a track keeps its id across scans.
  const changed = [...found.values()].filter((file) => {
    const row = known.get(key(file))
    return !row || !sameInfo(row, file)
  })
  for (let i = 0; i < changed.length; i += BATCH_SIZE) {
    await db
      .insert(subtitleFile)
      .values(changed.slice(i, i + BATCH_SIZE))
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
  const gone = existing
    .filter((row) => checked.has(row.mediaItemId) && !found.has(key(row)))
    .map((row) => row.id)
  for (let i = 0; i < gone.length; i += BATCH_SIZE) {
    await db
      .delete(subtitleFile)
      .where(inArray(subtitleFile.id, gone.slice(i, i + BATCH_SIZE)))
  }
  if (changed.length > 0 || gone.length > 0) {
    log.info(
      `Subtitles in library ${libraryId}: ${changed.length} new or changed, ${gone.length} gone`,
    )
  }
}

/**
 * Bring the subtitle files of a library's videos up to date. Runs after a
 * scan. Folders that can't be read keep their rows, as the scan keeps the
 * files of a missing folder. A failure is logged and doesn't fail the scan.
 */
export async function syncSubtitles(libraryId: string): Promise<void> {
  try {
    await runSync(libraryId)
  } catch (cause) {
    log.warn(`Couldn't update subtitles of library ${libraryId}`, cause)
  }
}
