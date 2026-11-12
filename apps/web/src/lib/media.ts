import {
  type Artwork,
  artworkPath,
  artworkSrcSet,
  type ArtworkSize,
  knownChannelLayout,
  type ImagePlaceholder,
  type MediaItem,
  mediaThumbnailPath,
} from "@matinee/contracts"

import { tr } from "@/i18n"

/** "5.1", "Stereo", or "8 channels" for a count no layout fits. */
export function channelLayout(
  layout: string | null,
  channels: number | null,
): string | null {
  if (layout || !channels || channels < 1) return layout
  return tr("media.channels", { count: channels })
}

/** Layout for an output channel count, rather than a probed stream. */
export function outputChannelLayout(channels: number): string | null {
  return channelLayout(knownChannelLayout(null, channels), channels)
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

/** Add interface words to the server's label. */
export function itemLabel(item: MediaItem): ItemLabel {
  const { episodeNumber, ...label } = item.label
  return {
    ...label,
    title:
      label.title ?? tr("media.episode", { number: String(episodeNumber) }),
    groupLabel: label.groupLabel.map((folder) =>
      folder.seasonNumber === null
        ? (folder.name ?? "")
        : seasonName(folder.seasonNumber),
    ),
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
  return [
    video?.resolution,
    video?.dynamicRange,
    main && channelLayout(main.layout, main.channels),
  ].filter((flag): flag is string => Boolean(flag))
}
