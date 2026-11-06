import {
  artworkPath,
  type ArtworkSize,
  type MediaItem,
  mediaThumbnailPath,
} from "@matinee/contracts"

export type ItemLabel = {
  /** The show or movie with its year. For loose files, the file's title. */
  show: string
  /** The show or movie name without the year. */
  showName: string
  /** The show's or movie's year, if known. */
  year: string | null
  /** The top-level folder, for grouping, tones, and folder links. */
  showKey: string
  /** Main line in a season list: the episode name, or "Episode 4". */
  title: string
  /** Neither metadata nor the file name an episode title (such as "TBA"). */
  untitled: boolean
  /** S02E01, for episodes. */
  code: string | null
  /** E01, for lists already headed by show and season. */
  shortCode: string | null
  /** Folder path the file sits in, for grouping lists. */
  group: string
  /** Readable parts of that path: ["Show (2023)", "Season 2"]. */
  groupLabel: string[]
}

const EPISODE = /\bS(\d{1,2})E(\d{1,3})\b/i
// Release tags and the extension trail the episode name.
const TRAILER = /\s*(\[.*|\.[a-z0-9]{2,4})$/i
// Names that say nothing about the episode.
const PLACEHOLDER = /^(tba|tbd|tbc|untitled|episode \d+)$/i
const SEASON_FOLDER = /^season\s*0*(\d+)$/i

/** "KILL THE SHADOW" reads as "Kill the Shadow"; mixed case is kept. */
function quietCaps(name: string): string {
  if (name.length <= 3 || name !== name.toUpperCase() || !/[A-Z]/.test(name)) {
    return name
  }
  const small = new Set([
    "a",
    "an",
    "and",
    "at",
    "by",
    "for",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "vs",
  ])
  return name
    .toLowerCase()
    .split(" ")
    .map((word, i) =>
      i > 0 && small.has(word)
        ? word
        : // The first letter, not the first character: "〔zero" → "(Zero".
          // Leading punctuation is skipped, but not digits ("9days").
          word.replace(
            /^([^\p{L}\p{N}]*)(\p{L})/u,
            (_, lead: string, letter: string) => lead + letter.toUpperCase(),
          ),
    )
    .join(" ")
}

function pad(n: string | undefined): string {
  return n?.padStart(2, "0") ?? "00"
}

const TRAILING_YEAR = /^(.*\S)\s*\(((?:19|20)\d{2})\)$/

/** Split a trailing "(2024)" off a show name. */
export function splitYear(name: string): {
  showName: string
  year: string | null
} {
  const match = TRAILING_YEAR.exec(name.trim())
  return match
    ? { showName: match[1] ?? name, year: match[2] ?? null }
    : { showName: name, year: null }
}

/** "Season 02" reads as "Season 2", and season 0 as "Specials". */
export function folderLabel(name: string): string {
  const season = SEASON_FOLDER.exec(name.trim())
  if (season) {
    const n = Number(season[1])
    return n === 0 ? "Specials" : `Season ${n}`
  }
  if (/^specials?$/i.test(name.trim())) return "Specials"
  return name
}

/**
 * Split a file into readable parts from its path alone. Episode files named
 * `Show - S02E01 - Into the Shadow [tags].mkv` read as "Into the Shadow".
 */
function labelFromPath(item: MediaItem): ItemLabel {
  const parts = item.relativePath.split("/")
  const file = parts.at(-1) ?? item.relativePath
  const folders = parts.slice(0, -1)
  const group = folders.join(" / ")
  const groupLabel = folders.map(folderLabel)
  const match = EPISODE.exec(file)

  if (!match) {
    const show = folders[0] ?? item.fileTitle
    return {
      show,
      ...splitYear(show),
      showKey: folders[0] ?? item.fileTitle,
      title: item.fileTitle,
      untitled: false,
      code: null,
      shortCode: null,
      group,
      groupLabel,
    }
  }

  const episode = Number(match[2])
  const name = file
    .slice((match.index ?? 0) + match[0].length)
    .replace(/^[\s._-]+/, "")
    .replace(TRAILER, "")
    .replace(/[._]+/g, " ")
    // Full-width and CJK brackets become parentheses; many UI fonts lack
    // them. Not "[", which TRAILER treats as the start of release tags.
    .replace(/[〔【［（]/g, "(")
    .replace(/[〕】］）]/g, ")")
    .trim()
  const untitled = !name || PLACEHOLDER.test(name)
  const show = folders[0] ?? item.fileTitle.replace(EPISODE, "").trim()
  return {
    show,
    ...splitYear(show),
    showKey: show,
    title: untitled ? `Episode ${episode}` : quietCaps(name),
    untitled,
    code: `S${pad(match[1])}E${pad(match[2])}`,
    shortCode: `E${pad(match[2])}`,
    group,
    groupLabel,
  }
}

/**
 * Readable parts of a file: names from the library's metadata provider
 * where it has them, and from the file and folder names otherwise.
 */
export function itemLabel(item: MediaItem): ItemLabel {
  const parsed = labelFromPath(item)
  const owner = item.title
  if (!owner) return parsed
  const year = owner.year ? String(owner.year) : parsed.year
  const base = {
    ...parsed,
    show: year ? `${owner.name} (${year})` : owner.name,
    showName: owner.name,
    year,
  }
  if (owner.kind === "movie") {
    return { ...base, title: owner.name, untitled: false, code: null }
  }
  const { seasonNumber: season, episodeNumber: number } = item
  if (season === null || number === null) return base
  const name = item.episode?.name?.trim()
  const named = name && !PLACEHOLDER.test(name) ? name : null
  return {
    ...base,
    title: named ?? parsed.title,
    untitled: !named && parsed.untitled,
    code: `S${pad(String(season))}E${pad(String(number))}`,
    shortCode: `E${pad(String(number))}`,
  }
}

/** "S2, E5", the way episode codes read in running text. */
export function episodeCode(item: MediaItem): string | null {
  if (item.seasonNumber === null || item.episodeNumber === null) return null
  return item.seasonNumber === 0
    ? `Special ${item.episodeNumber}`
    : `S${item.seasonNumber}, E${item.episodeNumber}`
}

export function art(
  id: string | null | undefined,
  size: ArtworkSize = "small",
): string | null {
  return id ? artworkPath(id, size) : null
}

/**
 * Landscape images for a file, best first: the provider's episode still,
 * then the show's or movie's backdrop for movies, then a frame from the
 * file itself.
 */
export function landscapeSources(
  item: MediaItem,
  size: ArtworkSize = "small",
): string[] {
  const frame = mediaThumbnailPath(item.id, size)
  const still = art(item.episode?.still, size)
  const backdrop = art(item.title?.images.backdrop, size)
  const isMovie = item.title?.kind === "movie"
  const order = isMovie ? [backdrop, frame] : [still, frame, backdrop]
  return order.filter((src): src is string => src !== null)
}

/** Share of the file watched, 0 to 1, or null when unknown. */
export function progressRatio(item: MediaItem): number | null {
  if (!item.progress || !item.durationSeconds) return null
  if (item.progress.completed) return 1
  return item.progress.positionSeconds / item.durationSeconds
}

/** "12 min left", for files the user started. */
export function timeLeft(item: MediaItem): string | null {
  if (!item.progress || !item.durationSeconds || item.progress.completed) {
    return null
  }
  const minutes = Math.max(
    1,
    Math.round((item.durationSeconds - item.progress.positionSeconds) / 60),
  )
  return `${minutes} min left`
}
