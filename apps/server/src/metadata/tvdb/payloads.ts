export type Translation = {
  language: string
  name?: string
  overview?: string
  /** Movies only. */
  tagline?: string
}
export type Translations = {
  nameTranslations?: Translation[]
  overviewTranslations?: Translation[]
}
export type Artwork = {
  image: string
  /** A smaller copy, as a full URL. */
  thumbnail?: string | null
  type: number
  language: string | null
  score?: number
  width?: number | null
  height?: number | null
  includesText?: boolean
}
export type RemoteId = { id: string; sourceName?: string }
export type Trailer = {
  /** Usually a YouTube link. */
  url?: string | null
  name?: string | null
  /** ISO 639-2, like `eng`. */
  language?: string | null
}
/** A person on a series or movie, whether they play someone or not. */
export type Character = {
  /** The character's name, for actors. */
  name?: string | null
  peopleId?: number | null
  /** `Actor`, `Director`, `Writer`, `Creator`, `Guest Star`, and so on. */
  peopleType?: string | null
  personName?: string | null
  personImgURL?: string | null
  sort?: number | null
}
export type Company = {
  name?: string | null
  primaryCompanyType?: number | null
}
export type CompanyType = { companyTypeId: number; companyTypeName: string }

export type SearchResult = {
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

export type BaseRecord = {
  id: number
  name: string
  year?: string
  image?: string | null
  /** English names, whatever the language; `slug` is `anime` for anime. */
  genres?: { name: string; slug?: string }[]
  status?: { name?: string } | null
  artworks?: Artwork[]
  remoteIds?: RemoteId[]
  translations?: Translations
  contentRatings?: { name: string; country: string }[]
  originalLanguage?: string
  characters?: Character[] | null
  trailers?: Trailer[] | null
}

export type Series = BaseRecord & {
  overview?: string
  firstAired?: string
  averageRuntime?: number | null
  defaultSeasonType?: number
  companies?: Company[] | null
  seasons?: SeasonRecord[]
}

export type SeasonRecord = {
  id: number
  number: number
  image?: string | null
  type?: { id: number; type: string }
  overviewTranslations?: string[] | null
}

export type Movie = BaseRecord & {
  runtime?: number | null
  first_release?: { date?: string } | null
  companies?: {
    studio?: Company[] | null
    production?: Company[] | null
  } | null
}

export type Episode = {
  seasonNumber: number
  number: number
  name?: string | null
  overview?: string | null
  aired?: string | null
  runtime?: number | null
  image?: string | null
}

export type ArtworkType = { id: number; name: string; recordType: string }
