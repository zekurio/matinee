type Named = { name: string }
export type Image = {
  file_path: string
  iso_639_1: string | null
  width?: number
  height?: number
  vote_average?: number
  vote_count?: number
}
type Images = { logos?: Image[]; posters?: Image[]; backdrops?: Image[] }
export type Video = {
  key: string
  /** `YouTube` or `Vimeo`. */
  site?: string
  /** `Trailer`, `Teaser`, `Clip`, `Featurette`, and so on. */
  type?: string
  name?: string
  /** ISO 639-1, or null for no language. */
  iso_639_1?: string | null
  official?: boolean
  published_at?: string
}
type Videos = { results?: Video[] }
/** What the `/images` endpoints answer. */
export type ImageList = Images & { stills?: Image[] }
export type Person = { id: number; name?: string; profile_path?: string | null }
type CastMember = Person & { character?: string; order?: number }
export type CrewMember = Person & { job?: string; department?: string }
export type AggregateCastMember = Person & {
  order?: number
  roles?: { character?: string; episode_count?: number }[]
}
type AggregateCrewMember = Person & {
  department?: string
  jobs?: { job?: string; episode_count?: number }[]
}

export type SearchResults<T> = { results: T[] }
export type MovieResult = {
  id: number
  title: string
  original_title?: string
  /** ISO 639-1, or `xx` for no language. */
  original_language?: string
  release_date?: string
  overview?: string
  poster_path?: string | null
}
export type ShowResult = {
  id: number
  name: string
  original_name?: string
  /** ISO 639-1, or `xx` for no language. */
  original_language?: string
  first_air_date?: string
  overview?: string
  poster_path?: string | null
}

export type Movie = MovieResult & {
  tagline?: string
  genres?: Named[]
  vote_average?: number
  vote_count?: number
  runtime?: number | null
  status?: string
  imdb_id?: string | null
  backdrop_path?: string | null
  images?: Images
  videos?: Videos
  production_companies?: Named[]
  credits?: { cast?: CastMember[]; crew?: CrewMember[] }
  release_dates?: {
    results: {
      iso_3166_1: string
      release_dates: { certification: string; type: number }[]
    }[]
  }
}

type Episode = {
  season_number: number
  episode_number: number
  name?: string
  overview?: string
  air_date?: string | null
  runtime?: number | null
  still_path?: string | null
}
export type SeasonResult = {
  season_number: number
  overview?: string
  poster_path?: string | null
  episodes?: Episode[]
}

export type Show = ShowResult & {
  tagline?: string
  genres?: Named[]
  vote_average?: number
  vote_count?: number
  episode_run_time?: number[]
  status?: string
  backdrop_path?: string | null
  images?: Images
  videos?: Videos
  seasons?: SeasonResult[]
  production_companies?: Named[]
  created_by?: Person[]
  number_of_episodes?: number
  aggregate_credits?: {
    cast?: AggregateCastMember[]
    crew?: AggregateCrewMember[]
  }
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] }
  external_ids?: { imdb_id?: string | null; tvdb_id?: number | null }
}

export type Found = {
  movie_results: { id: number }[]
  tv_results: { id: number }[]
}
