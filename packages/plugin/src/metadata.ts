import type { PluginCall } from "./call"

/** JSON values cross the sandbox boundary without prototypes or functions. */
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json }
/** IDs at other metadata providers, keyed by provider id. */
export type ExternalIds = Record<string, string>
/** A provider request's title kind and BCP 47 language tag. */
export type Lookup = { kind: "movie" | "show"; language: string }
/** Search by title, with an optional release year. */
export type SearchQuery = Lookup & { name: string; year: number | null }
/** One search result. Image URLs must be https and covered by your network grant. */
export type Candidate = {
  id: string
  name: string
  aliases: string[]
  year: number | null
  overview: string | null
  poster: string | null
}
/** Episode metadata. Dates use YYYY-MM-DD. */
export type EpisodeDetails = {
  season: number
  episode: number
  name: string | null
  overview: string | null
  airDate: string | null
  runtimeMinutes: number | null
  still: string | null
}
/** A season's number, summary, and remote poster. */
export type SeasonDetails = {
  number: number
  overview: string | null
  poster: string | null
}
/** Supported credit groups. */
export type CreditKind = "actor" | "creator" | "director" | "writer"
/** A person in the cast or crew. Keep cast in billing order. */
export type CreditDetails = {
  kind: CreditKind
  name: string
  role: string | null
  personId: string | null
  photo: string | null
}
/** Full title metadata. Use null for missing scalar data and empty arrays for missing lists. */
export type TitleDetails = {
  id: string
  name: string
  originalName: string | null
  originalLanguage: string | null
  year: number | null
  overview: string | null
  tagline: string | null
  genres: string[]
  rating: number | null
  contentRating: string | null
  releaseDate: string | null
  status: string | null
  runtimeMinutes: number | null
  externalIds: ExternalIds
  images: {
    poster: string | null
    backdrop: string | null
    logo: string | null
  }
  studios: string[]
  credits: CreditDetails[]
  seasons: SeasonDetails[]
  episodes: EpisodeDetails[]
}
/** Whose images the host wants. */
export type ImageScope =
  | { kind: "title" }
  | { kind: "season"; season: number }
  | { kind: "episode"; season: number; episode: number }
/** Supported artwork slots. */
export type ImageSlot = "poster" | "backdrop" | "logo" | "still"
/** An image before the host stores it. Higher score sorts first; votes break ties. */
export type ImageCandidate = {
  slot: ImageSlot
  url: string
  preview: string | null
  width: number | null
  height: number | null
  language: string | null
  score: number
  votes: number
}
/** Implement search and details. Lookup and image browsing are optional. */
export type MetadataProvider = {
  search(query: SearchQuery, call: PluginCall): Promise<Candidate[]>
  lookup?(
    ids: ExternalIds,
    lookup: Lookup,
    call: PluginCall,
  ): Promise<string | null>
  details(id: string, lookup: Lookup, call: PluginCall): Promise<TitleDetails>
  images?(
    id: string,
    lookup: Lookup,
    scope: ImageScope,
    call: PluginCall,
  ): Promise<ImageCandidate[]>
}
