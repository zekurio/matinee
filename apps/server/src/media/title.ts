import type { ExternalIds } from "@matinee/db"

const YEAR = /^(.*?)[\s._([-]+((?:19|20)\d{2})(?:[\s._)\]-]|$)/
const EPISODE = /^(.*?)[\s._-]*\b[Ss](\d{1,2})[Ee](\d{1,3})\b/

function tidy(value: string): string {
  return value
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s-]+$/, "")
    .trim()
}

/**
 * A readable title from a file name, without looking anything up.
 * `The.Matrix.1999.1080p.BluRay.mkv` becomes `The Matrix (1999)` and
 * `Show.Name.S01E02.720p.mkv` becomes `Show Name S01E02`.
 */
export function titleFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".")
  const stem = dot > 0 ? filename.slice(0, dot) : filename

  const episode = EPISODE.exec(stem)
  if (episode) {
    const show = tidy(episode[1] ?? "")
    const code = `S${episode[2]?.padStart(2, "0")}E${episode[3]?.padStart(2, "0")}`
    return show ? `${show} ${code}` : code
  }

  const year = YEAR.exec(stem)
  if (year && tidy(year[1] ?? "")) {
    return `${tidy(year[1] ?? "")} (${year[2]})`
  }

  return tidy(stem) || stem
}

/** The file name without its extension. */
export function stem(filename: string): string {
  const dot = filename.lastIndexOf(".")
  return dot > 0 ? filename.slice(0, dot) : filename
}

// Sonarr, Radarr, and Jellyfin put ids in folder names:
// `Show (2008) {tvdb-81189}`, `Movie [tmdbid-603]`, `[imdbid-tt0133093]`.
const ID_TAG = /[[{](tmdb|tvdb|imdb|anilist)(?:id)?[-=]([a-z0-9]+)[\]}]/gi
// Release groups, quality, and edition tags in brackets.
const BRACKETED = /\[[^\]]*\]|\{[^}]*\}/g
const PAREN_YEAR = /^(.*\S)\s*\(((?:19|20)\d{2})\)/
// The last year-like token, so `Blade.Runner.2049.2017` keeps its 2049.
const BARE_YEAR = /^(.*\S)[\s._-]+((?:19|20)\d{2})(?=[\s._)-]|$)/
// Where scene names stop being the title.
const RELEASE_TAG =
  /[\s._-](?:2160p|1080p|720p|576p|480p|4k|uhd|blu-?ray|bdrip|brrip|web-?dl|webrip|hdtv|dvdrip|remux|x26[45]|h\.?26[45]|hevc)(?=[\s._-]|$)/i

export type ParsedName = {
  name: string
  year: number | null
  ids: ExternalIds
}

/**
 * Name, year, and provider ids from a folder name or file stem.
 * `The.Matrix.1999.1080p.BluRay` reads as The Matrix (1999), and
 * `Breaking Bad (2008) {tvdb-81189}` also yields the TVDB id.
 */
export function parseName(raw: string): ParsedName {
  const ids: ExternalIds = {}
  let rest = raw.replace(ID_TAG, (_, site: string, id: string) => {
    ids[site.toLowerCase()] = id
    return " "
  })
  rest = rest.replace(BRACKETED, " ")

  const tag = RELEASE_TAG.exec(rest)
  if (tag) rest = rest.slice(0, tag.index)

  let year: number | null = null
  const match = PAREN_YEAR.exec(rest) ?? BARE_YEAR.exec(rest)
  if (match?.[1] && match[2]) {
    rest = match[1]
    year = Number(match[2])
  }

  // Scene names use dots for spaces. Names with real spaces keep theirs,
  // so "Mr. Robot" stays as it is.
  const spaced = rest.includes(" ") ? rest.replace(/_+/g, " ") : tidy(rest)
  const name = spaced
    .replace(/\s+/g, " ")
    .replace(/[\s(-]+$/, "")
    .trim()
  return { name: name || raw.trim(), year, ids }
}

const ARTICLE = /^(the|a|an)\s+/

/** Sort key: lowercase, no leading article or punctuation. */
export function sortName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(ARTICLE, "")
}

export type EpisodeNumbers = { season: number; episode: number }

const SXXEYY = /(?:^|[^a-z0-9])s(\d{1,3})[\s._-]?e(\d{1,4})(?![0-9])/i
const NXNN = /(?:^|[^0-9a-z])(\d{1,2})x(\d{2,3})(?![0-9])/i
const SEASON_FOLDER = /^(?:season|staffel|saison|temporada)[\s._-]*(\d{1,3})$/i
const SHORT_SEASON_FOLDER = /^s(\d{1,3})$/i
const SPECIALS_FOLDER = /^specials?$/i
const EPISODE_WORD = /(?:^|[^a-z])(?:e|ep|episode)[\s._-]?(\d{1,4})(?![0-9])/i
// "[Group] Show - 012 [1080p]", common for anime.
const DASH_NUMBER = /\s-\s(\d{1,4})(?:v\d)?(?=[\s._[(]|$)/
const LEADING_NUMBER = /^(\d{1,4})(?=[\s._-]|$)/

function seasonFromFolders(folders: string[]): number | null {
  for (const folder of folders.toReversed()) {
    const name = folder.trim()
    if (SPECIALS_FOLDER.test(name)) return 0
    const match = SEASON_FOLDER.exec(name) ?? SHORT_SEASON_FOLDER.exec(name)
    if (match) return Number(match[1])
  }
  return null
}

function isYear(value: string): boolean {
  return value.length === 4 && /^(?:19|20)\d{2}$/.test(value)
}

/**
 * Season and episode of a file in a show. `S02E05` and `2x05` in the file
 * name win. Otherwise a `Season 2` folder supplies the season (or season 1
 * is assumed) and `E05`, `Episode 5`, ` - 05`, or a leading number the
 * episode.
 */
export function episodeNumbers(relativePath: string): EpisodeNumbers | null {
  const parts = relativePath.split("/")
  const file = stem(parts.at(-1) ?? relativePath)

  const code = SXXEYY.exec(file) ?? NXNN.exec(file)
  if (code) return { season: Number(code[1]), episode: Number(code[2]) }

  const cleaned = file.replace(BRACKETED, " ").trim()
  const number =
    EPISODE_WORD.exec(cleaned)?.[1] ??
    DASH_NUMBER.exec(cleaned)?.[1] ??
    LEADING_NUMBER.exec(cleaned)?.[1]
  if (!number || isYear(number)) return null
  return {
    season: seasonFromFolders(parts.slice(1, -1)) ?? 1,
    episode: Number(number),
  }
}
