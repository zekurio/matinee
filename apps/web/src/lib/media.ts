import {
  type Artwork,
  artworkPath,
  artworkSrcSet,
  type ArtworkSize,
  knownChannelLayout,
  type HdrFormat,
  type ImagePlaceholder,
  type MediaItem,
  mediaThumbnailPath,
  videoCodecName,
} from "@matinee/contracts"

import { tr } from "@/i18n"

/** "5.1", "Stereo", or "8 channels" for a count no layout fits. */
export function channelLayout(
  layout: string | null,
  channels: number | null,
): string | null {
  const known = knownChannelLayout(layout, channels)
  if (known || !channels || channels < 1) return known
  return tr("media.channels", { count: channels })
}

/**
 * A season's name, as the server names it but in the interface's
 * language: "Season 2", "Specials", or "Other files" for files without a
 * season number.
 */
export function seasonName(number: number | null): string {
  if (number === null) return tr("media.otherFiles")
  return number === 0
    ? tr("media.specials")
    : tr("media.season", { number: String(number) })
}

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
function folderLabel(name: string): string {
  const season = SEASON_FOLDER.exec(name.trim())
  if (season) {
    const n = Number(season[1])
    return n === 0
      ? tr("media.specials")
      : tr("media.season", { number: String(n) })
  }
  if (/^specials?$/i.test(name.trim())) return tr("media.specials")
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
    title: untitled
      ? tr("media.episode", { number: String(episode) })
      : quietCaps(name),
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
    ? tr("media.special", { number: String(item.episodeNumber) })
    : tr("media.episodeCode", {
        season: String(item.seasonNumber),
        episode: String(item.episodeNumber),
      })
}

/**
 * An image to load, and the blurred stand-in to show until it does.
 * `srcSet` offers the server's other sizes of it.
 */
export type ImageSource = {
  src: string
  srcSet?: string
  placeholder: ImagePlaceholder | null
}

export function art(
  image: Artwork | null | undefined,
  size: ArtworkSize = "small",
): ImageSource | null {
  return image
    ? {
        src: artworkPath(image.id, size),
        srcSet: artworkSrcSet(image.id, size),
        placeholder: image.placeholder,
      }
    : null
}

/** A frame from the file itself, which has no placeholder. */
export function frame(
  itemId: string,
  size: ArtworkSize = "small",
): ImageSource {
  // Frames come in two sizes: for cards, and for banners.
  const thumbnail = size === "medium" || size === "large" ? "large" : "small"
  return { src: mediaThumbnailPath(itemId, thumbnail), placeholder: null }
}

/** The sources that exist, in order, for `Picture`. */
export function present(...sources: (ImageSource | null)[]): ImageSource[] {
  return sources.filter((source): source is ImageSource => source !== null)
}

/**
 * Landscape images for a file, best first: the provider's episode still,
 * then the show's or movie's backdrop for movies, then a frame from the
 * file itself.
 */
export function landscapeSources(
  item: MediaItem,
  size: ArtworkSize = "small",
): ImageSource[] {
  const still = art(item.episode?.still, size)
  const backdrop = art(item.title?.images.backdrop, size)
  const file = frame(item.id, size)
  return item.title?.kind === "movie"
    ? present(backdrop, file)
    : present(still, file, backdrop)
}

/** Share of the file watched, 0 to 1, or null when unknown. */
export function progressRatio(item: MediaItem): number | null {
  // A finished file shows the watched mark, never a bar. Cards hide the bar
  // while the user's mark says watched, but unmarking one flips that mark
  // before the file's progress refetches, which would flash a full bar.
  if (!item.progress || !item.durationSeconds || item.progress.completed) {
    return null
  }
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
  return tr("media.timeLeft", { minutes })
}

const HDR_LABELS = {
  hdr10: "HDR10",
  hlg: "HLG",
  "dolby-vision": "Dolby Vision",
} satisfies Record<HdrFormat, string>

/** "1080p" for 1920×800 too: wide films are cropped in height, not width. */
function resolutionLabel(width: number, height: number): string {
  if (width >= 3200 || height >= 2000) return "4K"
  if (width >= 2400 || height >= 1400) return "1440p"
  if (width >= 1800 || height >= 1000) return "1080p"
  if (width >= 1200 || height >= 700) return "720p"
  return `${height}p`
}

/**
 * Badges for a title page: resolution, dynamic range, and the main audio
 * track's layout, such as ["4K", "Dolby Vision", "5.1"]. SDR gets no
 * badge. Empty until the server has probed the file.
 */
export function mediaFlags(item: MediaItem): string[] {
  const probe = item.probe
  if (!probe) return []
  const { video, audio } = probe
  const main = audio.find((stream) => stream.default) ?? audio[0]
  const hdr =
    video?.hdr === "hdr10" && video.hdr10Plus
      ? "HDR10+"
      : video?.hdr && HDR_LABELS[video.hdr]
  return [
    video && resolutionLabel(video.width, video.height),
    hdr,
    main && channelLayout(main.channelLayout, main.channels),
  ].filter((flag): flag is string => Boolean(flag))
}

/**
 * "1080p · HEVC · 5.1 · 3 subtitles", from what the server probed. Null
 * until it has.
 */
export function streamSummary(item: MediaItem): string | null {
  const probe = item.probe
  if (!probe) return null
  const { video, audio, subtitles } = probe
  const main = audio.find((stream) => stream.default) ?? audio[0]
  const parts = [
    video && resolutionLabel(video.width, video.height),
    video && videoCodecName(video.codec),
    video?.hdr && HDR_LABELS[video.hdr],
    main && channelLayout(main.channelLayout, main.channels),
    audio.length > 1 && tr("media.audioTracks", { count: audio.length }),
    subtitles.length > 0 && tr("media.subtitles", { count: subtitles.length }),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}
