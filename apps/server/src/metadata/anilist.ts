import type { ExternalIds } from "@matinee/db"

import { limiter } from "../media/process"
import { fetchJson } from "./http"
import {
  type Candidate,
  type Lookup,
  type MetadataSource,
  ProviderError,
  type SearchQuery,
  text,
  type TitleDetails,
} from "./types"

const API = "https://graphql.anilist.co"
// AniList allows 90 requests a minute, and only 30 while it is degraded.
const limit = limiter(1, 2100)

const FIELDS = `
  id
  idMal
  title { romaji english native }
  synonyms
  format
  status
  duration
  averageScore
  genres
  isAdult
  description(asHtml: false)
  startDate { year month day }
  coverImage { extraLarge large }
  bannerImage
`

const SHOW_FORMATS = ["TV", "TV_SHORT", "ONA", "OVA", "SPECIAL"]
const MOVIE_FORMATS = ["MOVIE"]

type Media = {
  id: number
  idMal: number | null
  title: {
    romaji: string | null
    english: string | null
    native: string | null
  }
  synonyms: string[] | null
  format: string | null
  status: string | null
  duration: number | null
  averageScore: number | null
  genres: string[] | null
  isAdult: boolean | null
  description: string | null
  startDate: { year: number | null; month: number | null; day: number | null }
  coverImage: { extraLarge: string | null; large: string | null } | null
  bannerImage: string | null
}

const STATUS = new Map([
  ["FINISHED", "Ended"],
  ["RELEASING", "Airing"],
  ["NOT_YET_RELEASED", "Upcoming"],
  ["CANCELLED", "Canceled"],
  ["HIATUS", "On hiatus"],
])

/** GraphQL variables; every query here takes strings, numbers, or lists of strings. */
type Variables = Record<string, string | number | string[]>

async function query<T>(graphql: string, variables: Variables): Promise<T> {
  const body = await limit(() =>
    fetchJson<{
      data: T | null
      errors?: { message: string; status?: number }[]
    }>("AniList", API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: graphql, variables }),
    }),
  )
  if (!body.data) {
    const error = body.errors?.[0]
    throw new ProviderError(
      `AniList: ${error?.message ?? "empty answer"}`,
      error?.status ?? null,
    )
  }
  return body.data
}

/** English, else romaji. Japanese gets the native title. */
function pickName(media: Media, language: string): string {
  const { romaji, english, native } = media.title
  if (language.startsWith("ja")) return native ?? romaji ?? english ?? ""
  return english ?? romaji ?? native ?? ""
}

/** AniList descriptions carry a little HTML and a source credit. */
function plain(description: string | null): string | null {
  if (!description) return null
  return text(
    description
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&#039;|&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\(Source:[^)]*\)\s*$/i, "")
      .replace(/\n{3,}/g, "\n\n"),
  )
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function date(start: Media["startDate"]): string | null {
  if (!start.year || !start.month || !start.day) return null
  return `${start.year}-${pad(start.month)}-${pad(start.day)}`
}

function toCandidate(media: Media, language: string): Candidate {
  const { romaji, english, native } = media.title
  return {
    id: String(media.id),
    name: pickName(media, language),
    aliases: [romaji, english, native, ...(media.synonyms ?? [])].filter(
      (name): name is string => Boolean(name),
    ),
    year: media.startDate.year,
    overview: plain(media.description),
    poster: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
  }
}

async function search({ kind, name, language }: SearchQuery) {
  const data = await query<{ Page: { media: Media[] } }>(
    `query ($search: String, $formats: [MediaFormat]) {
      Page(perPage: 15) {
        media(search: $search, type: ANIME, format_in: $formats, sort: SEARCH_MATCH) {
          ${FIELDS}
        }
      }
    }`,
    { search: name, formats: kind === "movie" ? MOVIE_FORMATS : SHOW_FORMATS },
  )
  remember(data.Page.media)
  return data.Page.media.map((media) => toCandidate(media, language))
}

// Search results carry every field `details` needs. Keeping them a few
// minutes saves a request per match against AniList's tight rate limit.
const RECENT_MS = 5 * 60 * 1000
const recent = new Map<number, { media: Media; at: number }>()

function remember(list: Media[]) {
  const now = Date.now()
  for (const [id, entry] of recent) {
    if (now - entry.at > RECENT_MS) recent.delete(id)
  }
  for (const media of list) recent.set(media.id, { media, at: now })
}

async function fetchMedia(id: number): Promise<Media> {
  const cached = recent.get(id)
  if (cached && Date.now() - cached.at < RECENT_MS) return cached.media
  const { Media: media } = await query<{ Media: Media }>(
    `query ($id: Int) { Media(id: $id, type: ANIME) { ${FIELDS} } }`,
    { id },
  )
  return media
}

async function details(id: string, { language }: Lookup) {
  const media = await fetchMedia(Number(id))
  const name = pickName(media, language)
  const original = media.title.native ?? media.title.romaji
  const externalIds: ExternalIds = { anilist: String(media.id) }
  if (media.idMal) externalIds.mal = String(media.idMal)
  return {
    id: String(media.id),
    name,
    originalName: original && original !== name ? original : null,
    year: media.startDate.year,
    overview: plain(media.description),
    tagline: null,
    genres: media.genres ?? [],
    rating: media.averageScore ? media.averageScore / 10 : null,
    contentRating: media.isAdult ? "18+" : null,
    releaseDate: date(media.startDate),
    status: media.status ? (STATUS.get(media.status) ?? null) : null,
    runtimeMinutes: media.duration,
    externalIds,
    images: {
      poster: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
      // A wide strip rather than 16:9, but the closest AniList has.
      backdrop: media.bannerImage,
      logo: null,
    },
    seasons: [],
    episodes: [],
  } satisfies TitleDetails
}

export const anilist: MetadataSource = {
  id: "anilist",
  name: "AniList",
  description:
    "Anime, without an API key. Names and art for the show only: episodes keep their file names, and each AniList entry covers one season.",
  episodes: false,
  setup: null,
  configured: () => true,
  search,
  lookup: async (ids: ExternalIds) => ids.anilist ?? null,
  details: (id, lookup) => details(id, lookup),
}
