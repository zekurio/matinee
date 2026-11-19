import type {
  Artwork,
  CreditKind,
  MediaItem,
  PlaybackQualityPreset,
  Title,
} from "@matinee/contracts"
import {
  type ArtworkSize,
  artworkPath,
  mediaThumbnailPath,
} from "@matinee/contracts/paths"

import { language, locale, plural, tr } from "@/i18n"

/*
 * How the app words what the server sends: episode numbers, seasons,
 * lengths, and dates, in the TV's language. As the Android app's Format.kt
 * and TitleData.kt, so every TV reads the same.
 */

/** Names from the server, with episode numbers worded in the app's language. */
export type ItemLabel = {
  /** The show or movie name. For loose files, the top folder or the file's title. */
  showName: string
  year: string | null
  /** The episode's name, "Episode 4", or the movie's name. */
  title: string
  /** Neither the provider nor the file name gave the episode a name. */
  untitled: boolean
  /** S02E01, for episodes. */
  code: string | null
}

export function itemLabel(item: MediaItem): ItemLabel {
  const label = item.label
  const name =
    label.title ??
    (label.episodeNumber === null
      ? null
      : tr("media_episode", label.episodeNumber))
  return {
    showName: label.showName || item.fileTitle,
    year: label.year,
    title: name || item.fileTitle,
    untitled: label.untitled,
    code: label.code,
  }
}

/** "S2, E5", the way episode codes read in running text. */
export function episodeCode(item: MediaItem): string | null {
  if (item.seasonNumber === null || item.episodeNumber === null) return null
  return item.seasonNumber === 0
    ? tr("media_special", item.episodeNumber)
    : tr("media_episode_code", item.seasonNumber, item.episodeNumber)
}

/** "Episode 4", or "Special 4" in season 0. */
export function episodeNumber(item: MediaItem): string | null {
  if (item.episodeNumber === null) return null
  return item.seasonNumber === 0
    ? tr("media_special", item.episodeNumber)
    : tr("media_episode", item.episodeNumber)
}

export function seasonName(number: number | null): string {
  if (number === null) return tr("media_other_files")
  return number === 0 ? tr("media_specials") : tr("media_season", number)
}

/** Share of the file watched, 0 to 1, or null when unknown. */
export function progressRatio(item: MediaItem): number | null {
  const progress = item.progress
  if (!progress || item.durationSeconds === null) return null
  if (progress.completed) return 1
  if (item.durationSeconds <= 0) return null
  return Math.max(
    0,
    Math.min(1, progress.positionSeconds / item.durationSeconds),
  )
}

/** "12 min left", for files the person started. */
export function timeLeft(item: MediaItem): string | null {
  const progress = item.progress
  if (!progress || item.durationSeconds === null || progress.completed) {
    return null
  }
  const minutes = Math.max(
    1,
    Math.round((item.durationSeconds - progress.positionSeconds) / 60),
  )
  return tr("media_time_left", minutes)
}

export function formatRuntime(
  minutes: number | null | undefined,
): string | null {
  if (!minutes || minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return tr("format_minutes", rest)
  return rest === 0
    ? tr("format_hours", hours)
    : tr("format_hours_minutes", hours, rest)
}

/** A file's length in minutes: the provider's for an episode, else the file's. */
export function runtimeMinutes(item: MediaItem): number | null {
  if (item.episode?.runtimeMinutes) return item.episode.runtimeMinutes
  return item.durationSeconds === null
    ? null
    : Math.round(item.durationSeconds / 60)
}

const two = (value: number) => String(value).padStart(2, "0")

/** "1:02:35" or "4:05". */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours > 0
    ? `${hours}:${two(minutes)}:${two(rest)}`
    : `${minutes}:${two(rest)}`
}

let dayFormat: Intl.DateTimeFormat | null = null

function formatDate(date: Date): string {
  dayFormat ??= new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
  return dayFormat.format(date)
}

/** A YYYY-MM-DD date, as the TV's language writes dates. */
export function formatDay(day: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "")
  if (!match) return null
  const [, year, month, date] = match
  return formatDate(new Date(Number(year), Number(month) - 1, Number(date)))
}

/** A time from the server, as a date in the TV's language. */
export function formatInstant(value: Date): string {
  return Number.isNaN(value.getTime()) ? "\u2014" : formatDate(value)
}

export function formatRating(rating: number): string {
  return rating.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** A bit rate as the web writes it: 8 Mbps, 2.5 Mbps, or 800 kbps. */
export function formatBitrate(bits: number): string {
  if (bits < 1_000_000)
    return tr("player_bitrate_kbps", Math.round(bits / 1000))
  const tenths = Math.round(bits / 100_000)
  const number =
    tenths % 10 === 0
      ? String(tenths / 10)
      : (tenths / 10).toLocaleString(locale, { maximumFractionDigits: 1 })
  return tr("player_bitrate_mbps_exact", number)
}

/** "1080p, 20 Mbps" for an encode. */
export function qualityLabel(quality: PlaybackQualityPreset): string {
  return tr(
    "playback_quality_preset",
    quality.height,
    tr("player_bitrate_mbps", Math.round(quality.bitrate / 1_000_000)),
  )
}

/** Names for encode choices, which aren't probe streams. */
export function encodeCodecName(codec: string): string {
  return codec === "h264" ? "H.264" : codec.toUpperCase()
}

/*
 * Languages by name. Engines before Chromium 81 can't name one, so the
 * common ones are listed here, in the app's two languages.
 */
const LANGUAGE_NAMES = new Map<
  string,
  readonly [english: string, german: string]
>([
  ["ar", ["Arabic", "Arabisch"]],
  ["bg", ["Bulgarian", "Bulgarisch"]],
  ["cs", ["Czech", "Tschechisch"]],
  ["da", ["Danish", "Dänisch"]],
  ["de", ["German", "Deutsch"]],
  ["el", ["Greek", "Griechisch"]],
  ["en", ["English", "Englisch"]],
  ["es", ["Spanish", "Spanisch"]],
  ["et", ["Estonian", "Estnisch"]],
  ["fa", ["Persian", "Persisch"]],
  ["fi", ["Finnish", "Finnisch"]],
  ["fr", ["French", "Französisch"]],
  ["he", ["Hebrew", "Hebräisch"]],
  ["hi", ["Hindi", "Hindi"]],
  ["hr", ["Croatian", "Kroatisch"]],
  ["hu", ["Hungarian", "Ungarisch"]],
  ["id", ["Indonesian", "Indonesisch"]],
  ["is", ["Icelandic", "Isländisch"]],
  ["it", ["Italian", "Italienisch"]],
  ["ja", ["Japanese", "Japanisch"]],
  ["ko", ["Korean", "Koreanisch"]],
  ["lt", ["Lithuanian", "Litauisch"]],
  ["lv", ["Latvian", "Lettisch"]],
  ["nb", ["Norwegian Bokmål", "Norwegisch (Bokmål)"]],
  ["nl", ["Dutch", "Niederländisch"]],
  ["no", ["Norwegian", "Norwegisch"]],
  ["pl", ["Polish", "Polnisch"]],
  ["pt", ["Portuguese", "Portugiesisch"]],
  ["ro", ["Romanian", "Rumänisch"]],
  ["ru", ["Russian", "Russisch"]],
  ["sk", ["Slovak", "Slowakisch"]],
  ["sl", ["Slovenian", "Slowenisch"]],
  ["sr", ["Serbian", "Serbisch"]],
  ["sv", ["Swedish", "Schwedisch"]],
  ["th", ["Thai", "Thailändisch"]],
  ["tr", ["Turkish", "Türkisch"]],
  ["uk", ["Ukrainian", "Ukrainisch"]],
  ["vi", ["Vietnamese", "Vietnamesisch"]],
  ["zh", ["Chinese", "Chinesisch"]],
])

let displayNames: Intl.DisplayNames | null | undefined

function namer(): Intl.DisplayNames | null {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames([locale], { type: "language" })
    } catch {
      // An engine without it, or without this locale.
      displayNames = null
    }
  }
  return displayNames
}

/** "German" for `de`, in the app's language. The tag itself when nothing names it. */
export function languageName(tag: string): string {
  let named: string | undefined
  try {
    named = namer()?.of(tag)
  } catch {
    // Not a tag the engine takes.
    named = undefined
  }
  if (named && named !== tag) {
    return named.charAt(0).toLocaleUpperCase(locale) + named.slice(1)
  }
  const base = tag.toLowerCase().split("-")[0] ?? tag
  const known = LANGUAGE_NAMES.get(base)
  return known ? known[language === "de" ? 1 : 0] : tag
}

/**
 * "German, English" for tracks' tags, each language once in the order
 * given. Tracks that don't say are left out; null when none say.
 */
export function languageList(tags: readonly (string | null)[]): string | null {
  const seen = new Set<string>()
  const names: string[] = []
  for (const tag of tags) {
    const base = tag?.toLowerCase().split("-")[0]
    if (!tag || !base || seen.has(base)) continue
    seen.add(base)
    const name = languageName(tag)
    if (name !== tag) names.push(name)
  }
  return names.length ? names.join(", ") : null
}

/** "1080p · HEVC · HDR10", the picture's part of a file's details. */
export function videoSummary(item: MediaItem): string | null {
  const video = item.probe?.video
  if (!video) return null
  return [video.resolution, video.format, video.dynamicRange]
    .filter(Boolean)
    .join(" · ")
}

/** Badges for a title page: resolution, dynamic range, and the main audio's layout. */
export function mediaFlags(item: MediaItem): string[] {
  const probe = item.probe
  if (!probe) return []
  const main = probe.audio.find((stream) => stream.default) ?? probe.audio[0]
  return [
    probe.video?.resolution,
    probe.video?.dynamicRange,
    main?.layout,
  ].filter((flag): flag is string => Boolean(flag))
}

/** The person started the file and hasn't finished it, so Play resumes it. */
export function isResuming(item: MediaItem | null | undefined): boolean {
  const progress = item?.progress
  return Boolean(
    progress && !progress.completed && progress.positionSeconds > 0,
  )
}

/** A show's page leads with the episode up next: one not finished, of a show with more than one season. */
export function showsNextUp(title: Title): boolean {
  const next = title.next
  if (!next) return false
  return (
    title.kind === "show" &&
    next.progress?.completed !== true &&
    title.seasons.length > 1
  )
}

/** A title's facts: its year, then its episode count or runtime, then a show's status. */
export function titleFacts(title: Title): string[] {
  const show = title.kind === "show"
  return [
    title.year === null ? null : String(title.year),
    show
      ? plural("media_episode_count", title.itemCount)
      : formatRuntime(title.runtimeMinutes),
    show ? title.status : null,
  ].filter((fact): fact is string => Boolean(fact))
}

/** "Director", or "Directors" for a `count` above one. */
export function creditKind(kind: CreditKind, count: number): string {
  switch (kind) {
    case "creator":
      return plural("people_credit_creator", count)
    case "director":
      return plural("people_credit_director", count)
    case "writer":
      return plural("people_credit_writer", count)
    case "actor":
      return plural("people_credit_actor", count)
  }
}

/** "MO" for Masi Oka, "Z" for zekurio. */
export function initials(name: string): string {
  const words = name.split(/[\s\-_.]+/).filter(Boolean)
  const first = words[0]
  const last = words.at(-1)
  if (!first || !last) return "?"
  return words.length >= 2
    ? `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    : first.charAt(0).toUpperCase()
}

/** A picture to try: a path on the server. */
export type ImageSource = string

export function art(
  image: Artwork | null | undefined,
  size: ArtworkSize = "small",
): ImageSource | null {
  return image ? artworkPath(image.id, size) : null
}

/** A frame from the file itself. */
export function frame(itemId: string, large = false): ImageSource {
  return mediaThumbnailPath(itemId, large ? "large" : "small")
}

/** The sources that exist, in order. */
export function present(...sources: (ImageSource | null)[]): ImageSource[] {
  return sources.filter((source): source is ImageSource => source !== null)
}

/**
 * Landscape images for a file, best first: the provider's episode still,
 * then a frame from the file, then the show's backdrop; a movie's backdrop
 * comes first.
 */
export function landscape(item: MediaItem): ImageSource[] {
  const still = art(item.episode?.still)
  const backdrop = art(item.title?.images.backdrop)
  const file = frame(item.id)
  return item.title?.kind === "movie"
    ? present(backdrop, file)
    : present(still, file, backdrop)
}
