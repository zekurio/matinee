import type { ExternalIds } from "@matinee/db"

import { env } from "../env"
import { limiter } from "../media/process"
import { fetchJson } from "./http"
import {
  type Candidate,
  type EpisodeDetails,
  isoDate,
  type Lookup,
  type MetadataSource,
  ProviderError,
  type SearchQuery,
  type SeasonDetails,
  text,
  type TitleDetails,
  yearOf,
} from "./types"

const API = "https://api4.thetvdb.com/v4"
const ARTWORK_HOST = "https://artworks.thetvdb.com"
// Tokens last a month. Renew well before that.
const TOKEN_TTL_MS = 25 * 24 * 60 * 60 * 1000
const limit = limiter(4)

type Envelope<T> = { data: T; links?: { next?: string | null } }

type Translation = {
  language: string
  name?: string
  overview?: string
  /** Movies only. */
  tagline?: string
}
type Translations = {
  nameTranslations?: Translation[]
  overviewTranslations?: Translation[]
}
type Artwork = {
  image: string
  type: number
  language: string | null
  score?: number
  includesText?: boolean
}
type RemoteId = { id: string; sourceName?: string }

type SearchResult = {
  tvdb_id: string
  name: string
  aliases?: string[]
  translations?: Record<string, string>
  overviews?: Record<string, string>
  overview?: string
  year?: string
  image_url?: string
  thumbnail?: string
}

type BaseRecord = {
  id: number
  name: string
  year?: string
  image?: string | null
  genres?: { name: string }[]
  status?: { name?: string } | null
  artworks?: Artwork[]
  remoteIds?: RemoteId[]
  translations?: Translations
  contentRatings?: { name: string; country: string }[]
  originalLanguage?: string
}

type Series = BaseRecord & {
  overview?: string
  firstAired?: string
  averageRuntime?: number | null
  defaultSeasonType?: number
  seasons?: {
    number: number
    name?: string | null
    image?: string | null
    type?: { id: number; type: string }
  }[]
}

type Movie = BaseRecord & {
  runtime?: number | null
  first_release?: { date?: string } | null
}

type Episode = {
  seasonNumber: number
  number: number
  name?: string | null
  overview?: string | null
  aired?: string | null
  runtime?: number | null
  image?: string | null
}

type ArtworkType = { id: number; name: string; recordType: string }

// TVDB speaks ISO 639-2. The rest of Matinee uses two-letter codes.
const LANGUAGES = new Map([
  ["ar", "ara"],
  ["cs", "ces"],
  ["da", "dan"],
  ["de", "deu"],
  ["el", "ell"],
  ["en", "eng"],
  ["es", "spa"],
  ["fi", "fin"],
  ["fr", "fra"],
  ["he", "heb"],
  ["hu", "hun"],
  ["it", "ita"],
  ["ja", "jpn"],
  ["ko", "kor"],
  ["nl", "nld"],
  ["no", "nor"],
  ["pl", "pol"],
  ["pt", "por"],
  ["ru", "rus"],
  ["sv", "swe"],
  ["tr", "tur"],
  ["uk", "ukr"],
  ["zh", "zho"],
])
const COUNTRIES = new Map([
  ["AU", "aus"],
  ["CA", "can"],
  ["DE", "deu"],
  ["ES", "esp"],
  ["FR", "fra"],
  ["GB", "gbr"],
  ["IT", "ita"],
  ["JP", "jpn"],
  ["NL", "nld"],
  ["US", "usa"],
])

function tvdbLanguage(language: string): string {
  // TVDB files Brazilian Portuguese under "pt" and Portugal's under "por".
  if (language === "pt-BR") return "pt"
  return LANGUAGES.get(language.split("-")[0] ?? "en") ?? "eng"
}

let token: { value: string; expires: number } | null = null
let loggingIn: Promise<string> | null = null

async function login(): Promise<string> {
  if (!env.tvdbApiKey) throw new Error("MATINEE_TVDB_API_KEY isn't set")
  const body = {
    apikey: env.tvdbApiKey,
    pin: env.MATINEE_TVDB_PIN || undefined,
  }
  const data = await fetchJson<Envelope<{ token: string }>>(
    "TheTVDB",
    `${API}/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  )
  token = { value: data.data.token, expires: Date.now() + TOKEN_TTL_MS }
  return token.value
}

function currentToken(): Promise<string> {
  if (token && token.expires > Date.now()) return Promise.resolve(token.value)
  loggingIn ??= login().finally(() => (loggingIn = null))
  return loggingIn
}

async function request<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<Envelope<T>> {
  const url = new URL(`${API}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  const send = async () =>
    fetchJson<Envelope<T>>("TheTVDB", url, {
      headers: { authorization: `Bearer ${await currentToken()}` },
    })
  return limit(async () => {
    try {
      return await send()
    } catch (error) {
      // A revoked or expired token: log in again once.
      if (!(error instanceof ProviderError) || error.status !== 401) throw error
      token = null
      return send()
    }
  })
}

let artworkTypes: Promise<ArtworkType[]> | null = null

/** Artwork type ids by record and name, such as series/poster → 2. */
async function artworkType(
  record: "series" | "movie",
  name: "poster" | "background" | "clearlogo",
): Promise<number | null> {
  artworkTypes ??= request<ArtworkType[]>("/artwork/types")
    .then((res) => res.data)
    .catch((cause: unknown) => {
      artworkTypes = null
      throw cause
    })
  const types = await artworkTypes
  return (
    types.find((t) => t.recordType === record && t.name.toLowerCase() === name)
      ?.id ?? null
  )
}

function absolute(url: string | null | undefined): string | null {
  if (!url) return null
  return url.startsWith("/") ? `${ARTWORK_HOST}${url}` : url
}

/**
 * The best artwork of a type: highest score in the user's language, then
 * without text, then in English, then any.
 */
function pickArtwork(
  artworks: Artwork[] | undefined,
  type: number | null,
  lang: string,
  preferTextless = false,
): string | null {
  if (type === null) return null
  const ofType = (artworks ?? [])
    .filter((art) => art.type === type)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const order = preferTextless ? [null, lang, "eng"] : [lang, null, "eng"]
  for (const language of order) {
    const match = ofType.find((art) => art.language === language)
    if (match) return absolute(match.image)
  }
  return absolute(ofType[0]?.image)
}

function translated(translations: Translations | undefined, lang: string) {
  const name = translations?.nameTranslations?.find(
    (t) => t.language === lang,
  )?.name
  const overview =
    translations?.overviewTranslations?.find((t) => t.language === lang)
      ?.overview ??
    translations?.overviewTranslations?.find((t) => t.language === "eng")
      ?.overview
  return { name: text(name), overview: text(overview) }
}

function remoteIds(id: number, remote: RemoteId[] | undefined): ExternalIds {
  const ids: ExternalIds = { tvdb: String(id) }
  for (const entry of remote ?? []) {
    const source = entry.sourceName?.toLowerCase() ?? ""
    if (source.includes("imdb")) ids.imdb = entry.id
    else if (source.includes("themoviedb")) ids.tmdb = entry.id
  }
  return ids
}

function contentRating(
  ratings: BaseRecord["contentRatings"],
  language: string,
): string | null {
  const region = language.split("-")[1] ?? "US"
  const country = COUNTRIES.get(region) ?? "usa"
  const match =
    ratings?.find((r) => r.country === country) ??
    ratings?.find((r) => r.country === "usa")
  return text(match?.name)
}

async function search(query: SearchQuery): Promise<Candidate[]> {
  const lang = tvdbLanguage(query.language)
  const run = async (year: number | null) => {
    const res = await request<SearchResult[]>("/search", {
      query: query.name,
      type: query.kind === "movie" ? "movie" : "series",
      year: year ?? undefined,
      limit: 20,
    })
    return res.data.map((result): Candidate => ({
      id: result.tvdb_id,
      name: result.translations?.[lang] ?? result.name,
      aliases: [
        result.name,
        ...Object.values(result.translations ?? {}),
        ...(result.aliases ?? []),
      ],
      year: result.year ? Number(result.year) || null : null,
      overview: text(
        result.overviews?.[lang] ?? result.overviews?.eng ?? result.overview,
      ),
      poster: absolute(result.image_url ?? result.thumbnail),
    }))
  }
  const results = await run(query.year)
  return results.length === 0 && query.year ? run(null) : results
}

async function lookup(ids: ExternalIds, { kind }: Lookup) {
  if (ids.tvdb) return ids.tvdb
  for (const id of [ids.imdb, ids.tmdb]) {
    if (!id) continue
    const res = await request<
      { series?: { id: number }; movie?: { id: number } }[]
    >(`/search/remoteid/${encodeURIComponent(id)}`)
    for (const hit of res.data) {
      const match = kind === "movie" ? hit.movie : hit.series
      if (match) return String(match.id)
    }
  }
  return null
}

/** Every episode in the default order, translated where TVDB can. */
async function episodes(id: number, lang: string): Promise<Episode[]> {
  const fetchAll = async (language: string) => {
    const all: Episode[] = []
    for (let page = 0; page < 50; page++) {
      const res = await request<{ episodes?: Episode[] }>(
        `/series/${id}/episodes/default/${language}`,
        { page },
      )
      all.push(...(res.data.episodes ?? []))
      if (!res.links?.next) break
    }
    return all
  }
  const list = await fetchAll(lang)
  // Untranslated episodes come back nameless. Fill them in from English.
  if (lang !== "eng" && list.some((episode) => !episode.name)) {
    const english = new Map(
      (await fetchAll("eng")).map((e) => [`${e.seasonNumber}x${e.number}`, e]),
    )
    for (const episode of list) {
      const fallback = english.get(`${episode.seasonNumber}x${episode.number}`)
      episode.name ||= fallback?.name ?? null
      episode.overview ||= fallback?.overview ?? null
    }
  }
  return list
}

async function seriesDetails(id: string, language: string) {
  const lang = tvdbLanguage(language)
  const { data: series } = await request<Series>(
    `/series/${encodeURIComponent(id)}/extended`,
    { meta: "translations" },
  )
  const [poster, background, logo, list] = await Promise.all([
    artworkType("series", "poster"),
    artworkType("series", "background"),
    artworkType("series", "clearlogo"),
    episodes(series.id, lang),
  ])
  const names = translated(series.translations, lang)
  const name = names.name ?? series.name
  const seasons: SeasonDetails[] = (series.seasons ?? [])
    .filter(
      (season) =>
        season.type?.id === series.defaultSeasonType ||
        season.type?.type === "official",
    )
    .filter(
      (season, i, all) =>
        all.findIndex((s) => s.number === season.number) === i,
    )
    .map((season) => ({
      number: season.number,
      name: text(season.name),
      overview: null,
      poster: absolute(season.image),
    }))
  return {
    id: String(series.id),
    name,
    originalName: series.name !== name ? series.name : null,
    year: Number(series.year) || yearOf(series.firstAired),
    overview: names.overview ?? text(series.overview),
    tagline: null,
    genres: series.genres?.map((genre) => genre.name) ?? [],
    // TVDB's score counts favourites; it isn't a rating.
    rating: null,
    contentRating: contentRating(series.contentRatings, language),
    releaseDate: isoDate(series.firstAired),
    status: text(series.status?.name),
    runtimeMinutes: series.averageRuntime || null,
    externalIds: remoteIds(series.id, series.remoteIds),
    images: {
      poster:
        pickArtwork(series.artworks, poster, lang) ?? absolute(series.image),
      backdrop: pickArtwork(series.artworks, background, lang, true),
      logo: pickArtwork(series.artworks, logo, lang),
    },
    seasons,
    episodes: list.map((episode): EpisodeDetails => ({
      season: episode.seasonNumber,
      episode: episode.number,
      name: text(episode.name),
      overview: text(episode.overview),
      airDate: isoDate(episode.aired),
      runtimeMinutes: episode.runtime || null,
      still: absolute(episode.image),
    })),
  } satisfies TitleDetails
}

async function movieDetails(id: string, language: string) {
  const lang = tvdbLanguage(language)
  const { data: movie } = await request<Movie>(
    `/movies/${encodeURIComponent(id)}/extended`,
    { meta: "translations" },
  )
  const [poster, background, logo] = await Promise.all([
    artworkType("movie", "poster"),
    artworkType("movie", "background"),
    artworkType("movie", "clearlogo"),
  ])
  const names = translated(movie.translations, lang)
  const name = names.name ?? movie.name
  const tagline = movie.translations?.nameTranslations?.find(
    (t) => t.language === lang,
  )?.tagline
  return {
    id: String(movie.id),
    name,
    originalName: movie.name !== name ? movie.name : null,
    year: Number(movie.year) || yearOf(movie.first_release?.date),
    overview: names.overview,
    tagline: text(tagline),
    genres: movie.genres?.map((genre) => genre.name) ?? [],
    rating: null,
    contentRating: contentRating(movie.contentRatings, language),
    releaseDate: isoDate(movie.first_release?.date),
    status: text(movie.status?.name),
    runtimeMinutes: movie.runtime || null,
    externalIds: remoteIds(movie.id, movie.remoteIds),
    images: {
      poster:
        pickArtwork(movie.artworks, poster, lang) ?? absolute(movie.image),
      backdrop: pickArtwork(movie.artworks, background, lang, true),
      logo: pickArtwork(movie.artworks, logo, lang),
    },
    seasons: [],
    episodes: [],
  } satisfies TitleDetails
}

export const tvdb: MetadataSource = {
  id: "tvdb",
  name: "TheTVDB",
  description:
    "Shows in the season order Sonarr uses, plus movies, logos, and episode images.",
  episodes: true,
  setup:
    "Set MATINEE_TVDB_API_KEY, and MATINEE_TVDB_PIN if your key needs a subscriber PIN.",
  configured: () => Boolean(env.tvdbApiKey),
  search,
  lookup,
  details: (id, { kind, language }) =>
    kind === "movie" ? movieDetails(id, language) : seriesDetails(id, language),
}
