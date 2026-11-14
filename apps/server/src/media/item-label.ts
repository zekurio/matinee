import type { ItemLabel, ItemLabelFolder, MediaItem } from "@matinee/contracts"

/** Only the naming inputs, so callers need not build a whole item. */
type LabelSource = Pick<
  MediaItem,
  | "relativePath"
  | "fileTitle"
  | "title"
  | "seasonNumber"
  | "episodeNumber"
  | "episode"
>

const LABEL_EPISODE = /\bS(\d{1,2})E(\d{1,3})\b/i
// Release tags and the extension trail the episode name.
const TRAILER = /\s*(\[.*|\.[a-z0-9]{2,4})$/i
// Names that say nothing about the episode.
const PLACEHOLDER = /^(tba|tbd|tbc|untitled|episode \d+)$/i
const LABEL_SEASON_FOLDER = /^season\s*0*(\d+)$/i

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
        : // The first letter, not the first character: "〔ZERO" becomes "(Zero".
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

/** A folder name or a season number for the client to word. */
function folderLabel(name: string): ItemLabelFolder {
  const season = LABEL_SEASON_FOLDER.exec(name.trim())
  if (season) return { name: null, seasonNumber: Number(season[1]) }
  if (/^specials?$/i.test(name.trim())) return { name: null, seasonNumber: 0 }
  return { name, seasonNumber: null }
}

/**
 * Split a file into readable parts from its path alone. Episode files named
 * `Show - S02E01 - Into the Shadow [tags].mkv` read as "Into the Shadow".
 */
function labelFromPath(item: LabelSource): ItemLabel {
  const parts = item.relativePath.split("/")
  const file = parts.at(-1) ?? item.relativePath
  const folders = parts.slice(0, -1)
  const group = folders.join(" / ")
  const groupLabel = folders.map(folderLabel)
  const match = LABEL_EPISODE.exec(file)

  if (!match) {
    const show = folders[0] ?? item.fileTitle
    return {
      show,
      ...splitYear(show),
      showKey: folders[0] ?? item.fileTitle,
      title: item.fileTitle,
      episodeNumber: null,
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
    // The extension goes first: after `S01E02.mkv` only `.mkv` is left,
    // which the next line would turn into a name.
    .replace(TRAILER, "")
    .replace(/^[\s._-]+/, "")
    .replace(/[._]+/g, " ")
    // Full-width and CJK brackets become parentheses; many UI fonts lack
    // them. Not "[", which TRAILER treats as the start of release tags.
    .replace(/[〔【［（]/g, "(")
    .replace(/[〕】］）]/g, ")")
    .trim()
  const untitled = !name || PLACEHOLDER.test(name)
  const show = folders[0] ?? item.fileTitle.replace(LABEL_EPISODE, "").trim()
  return {
    show,
    ...splitYear(show),
    showKey: show,
    title: untitled ? null : quietCaps(name),
    episodeNumber: episode,
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
export function itemLabel(item: LabelSource): ItemLabel {
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
