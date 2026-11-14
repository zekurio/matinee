import { Artwork } from "./artwork"
import { MetadataProviderId } from "./library"
import { LanguageTag } from "./preferences"
import { t } from "./schema"
import { DisplayMediaProbe } from "./streams"

export const Images = t.object({
  /** Portrait cover, 2:3. */
  poster: Artwork.nullable(),
  /** Landscape art, usually without text. */
  backdrop: Artwork.nullable(),
  /** The title as a transparent image, for laying over a backdrop. */
  logo: Artwork.nullable(),
})
export type Images = t.infer<typeof Images>

/** What a title groups. Shows have seasons and episodes. */
export const TITLE_KINDS = ["movie", "show"] as const
export const TitleKind = t.enum(TITLE_KINDS)
export type TitleKind = t.infer<typeof TitleKind>

/** A movie or show: what a poster stands for. */
export const TitleSummary = t.object({
  id: t.uuid(),
  libraryId: t.uuid(),
  kind: TitleKind,
  name: t.string(),
  year: t.number().int().nullable(),
  overview: t.string().nullable(),
  images: Images,
  genres: t.array(t.string()),
  /** Community rating out of 10. */
  rating: t.number().nullable(),
  /** Age rating, like `TV-14` or `PG-13`. */
  contentRating: t.string().nullable(),
  /** A movie's length, or a show's episodes', in minutes. */
  runtimeMinutes: t.number().int().nullable(),
  /**
   * The BCP 47 tag of the language it was made in, from the metadata
   * provider. Null when the provider doesn't say or there is no match.
   */
  originalLanguage: t.string().nullable(),
  /** The signed-in user marked it as a favorite. */
  favorite: t.boolean(),
  /** The signed-in user watched every file it has. False without files. */
  watched: t.boolean(),
})
export type TitleSummary = t.infer<typeof TitleSummary>

/** The signed-in user's place in a file. */
export const WatchState = t.object({
  positionSeconds: t.number(),
  completed: t.boolean(),
  updatedAt: t.date(),
})
export type WatchState = t.infer<typeof WatchState>

/**
 * When the user watched a file they mark watched, as Trakt asks: a day
 * they pick, `released` for the day it came out, or `unknown` when they
 * don't remember. Episodes came out on their air date, movies on the
 * title's release date; a file without one counts as watched now, as does
 * a time past the server's clock. An `unknown` play counts in totals but
 * in nothing over time.
 */
export const WatchedAt = t.union([
  t.literal("released"),
  t.literal("unknown"),
  t.date(),
])
export type WatchedAt = t.infer<typeof WatchedAt>

/** What the library's provider knows about an episode. */
export const EpisodeInfo = t.object({
  name: t.string().nullable(),
  overview: t.string().nullable(),
  /** YYYY-MM-DD. */
  airDate: t.string().nullable(),
  runtimeMinutes: t.number().int().nullable(),
  /** A frame the provider picked. */
  still: Artwork.nullable(),
})
export type EpisodeInfo = t.infer<typeof EpisodeInfo>

/** One folder's name, or a season number for the client to word. */
export const ItemLabelFolder = t.object({
  /** The folder name. Null for a season folder. */
  name: t.string().nullable(),
  /** Zero means specials. Null for an ordinary folder. */
  seasonNumber: t.number().int().nullable(),
})
export type ItemLabelFolder = t.infer<typeof ItemLabelFolder>

/** Names from metadata, falling back to the file and folder names. */
export const ItemLabel = t.object({
  /** The show or movie with its year. For loose files, the file's title. */
  show: t.string(),
  /** The show or movie name without the year. */
  showName: t.string(),
  /** The show's or movie's year, if known. */
  year: t.string().nullable(),
  /** The top-level folder, for grouping, tones, and folder links. */
  showKey: t.string(),
  /** The episode or movie name. Null for an untitled episode. */
  title: t.string().nullable(),
  /** Neither metadata nor the file name supplies an episode title. */
  untitled: t.boolean(),
  /** The number to word when title is null, from the file name. */
  episodeNumber: t.number().int().nullable(),
  /** S02E01, for episodes. */
  code: t.string().nullable(),
  /** E01, for lists already headed by show and season. */
  shortCode: t.string().nullable(),
  /** Folder path the file sits in, joined with ` / ` for grouping lists. */
  group: t.string(),
  /** Readable folders in path order. Clients word season numbers. */
  groupLabel: t.array(ItemLabelFolder),
})
export type ItemLabel = t.infer<typeof ItemLabel>

export const MediaItem = t.object({
  id: t.uuid(),
  libraryId: t.uuid(),
  /** A readable name from the file name alone, like `Show S01E02`. */
  fileTitle: t.string(),
  /** What to call the file, worked out by the server. */
  label: ItemLabel,
  /** The movie or show the file belongs to. Null until scanned. */
  title: TitleSummary.nullable(),
  /** From the file name or its season folder. */
  seasonNumber: t.number().int().nullable(),
  episodeNumber: t.number().int().nullable(),
  /** Null for movies and episodes the provider doesn't know. */
  episode: EpisodeInfo.nullable(),
  /** Path below the library folder, for display. */
  relativePath: t.string(),
  container: t.string(),
  mimeType: t.string(),
  sizeBytes: t.number().int().int64(),
  modifiedAt: t.date(),
  /** Null until the server or a player has measured it. */
  durationSeconds: t.number().nullable(),
  /** Streams and container. Null until probed, or when ffprobe couldn't read the file. */
  probe: DisplayMediaProbe.nullable(),
  /** Null when the signed-in user hasn't started it. */
  progress: WatchState.nullable(),
  /**
   * The signed-in user marked the file as a favorite. A movie is a
   * favorite through its title, so for a movie's file see
   * `title.favorite`.
   */
  favorite: t.boolean(),
})
export type MediaItem = t.infer<typeof MediaItem>

/** The next unstarted episode of a show the viewer has watched. */
export const NextUpEntry = t.object({
  item: MediaItem,
  /** When the viewer last finished an episode of this show, used for ordering. */
  lastWatchedAt: t.date(),
})
export type NextUpEntry = t.infer<typeof NextUpEntry>

/** A title in Home's banner. */
export const FeaturedTitle = t.object({
  title: TitleSummary,
  /** What Play starts: the file in progress, the next one, or the first. */
  item: MediaItem,
  /** Files in the title; 1 for most movies. */
  count: t.number().int(),
})
export type FeaturedTitle = t.infer<typeof FeaturedTitle>

export const Season = t.object({
  /** Null collects files without a season number. */
  number: t.number().int().nullable(),
  name: t.string(),
  overview: t.string().nullable(),
  poster: Artwork.nullable(),
  itemCount: t.number().int(),
  /** Files the signed-in user finished. */
  watchedCount: t.number().int(),
  /**
   * The signed-in user marked the season as a favorite. Always false for
   * the files without a season number, which aren't a season to mark.
   */
  favorite: t.boolean(),
})
export type Season = t.infer<typeof Season>

/**
 * The files a show got last: those added within a day of its newest, like
 * a season downloaded over an evening.
 */
export const ShelfAdditions = t.object({
  /** How many files came. */
  count: t.number().int(),
  /** The first of them in episode order. */
  item: MediaItem,
  /**
   * The season they all came in. Null when they span seasons, or when the
   * show has only one season, since its own page lists the episodes.
   */
  season: Season.nullable(),
})
export type ShelfAdditions = t.infer<typeof ShelfAdditions>

export const ShelfEntry = t.object({
  title: TitleSummary,
  /** The title's first file, which Play starts. */
  item: MediaItem,
  /** Files in the title; 1 for most movies. */
  count: t.number().int(),
  /** When the newest of those files was added. */
  addedAt: t.date(),
  /**
   * What a show got last. Null for movies, and for shows whose files all
   * came at once, such as on the library's first scan.
   */
  added: ShelfAdditions.nullable(),
})
export type ShelfEntry = t.infer<typeof ShelfEntry>

/** What a person did on a title. Crew outside these isn't kept. */
export const CREDIT_KINDS = ["actor", "creator", "director", "writer"] as const
export const CreditKind = t.enum(CREDIT_KINDS)
export type CreditKind = t.infer<typeof CreditKind>

/** Someone in a title's cast or crew, as the provider bills them. */
export const Credit = t.object({
  kind: CreditKind,
  name: t.string(),
  /**
   * The character for actors, or the jobs for crew, like `Screenplay,
   * Story`. Null when the provider doesn't say.
   */
  role: t.string().nullable(),
  /** A portrait. */
  photo: Artwork.nullable(),
})
export type Credit = t.infer<typeof Credit>

/** A trailer on YouTube, from the metadata provider. */
export const Trailer = t.object({
  /** The video's page on YouTube. */
  url: t.string(),
  name: t.string().nullable(),
  /** BCP 47. Null when it has no spoken language or the provider doesn't say. */
  language: t.string().nullable(),
})
export type Trailer = t.infer<typeof Trailer>

/**
 * A genre or studio, with how many titles carry it. Titles name them as
 * the provider does, so the name is also how to ask for them.
 */
export const Facet = t.object({
  name: t.string(),
  titleCount: t.number().int(),
})
export type Facet = t.infer<typeof Facet>

/**
 * Someone credited on titles in the libraries. People are told apart by
 * name, as in Jellyfin, so one person matched by two providers is one
 * person here.
 */
export const PersonSummary = t.object({
  name: t.string(),
  /** A portrait from one of their credits. */
  photo: Artwork.nullable(),
  /** What they're credited as most often. */
  kind: CreditKind,
  titleCount: t.number().int(),
})
export type PersonSummary = t.infer<typeof PersonSummary>

/** A title a person is credited on, once for each kind of credit. */
export const PersonCredit = t.object({
  title: TitleSummary,
  kind: CreditKind,
  /** Every part or job they had in it, as in `Credit.role`. */
  role: t.string().nullable(),
})
export type PersonCredit = t.infer<typeof PersonCredit>

export const Person = PersonSummary.extend({
  /** Newest first. */
  credits: t.array(PersonCredit),
})
export type Person = t.infer<typeof Person>

/**
 * The orders a list of titles can take: by name, by when the newest file
 * arrived, by release year, by the provider's community score, and by
 * runtime (a show's episodes'). Titles without the value come last
 * either way.
 */
export const TITLE_SORTS = [
  "name",
  "recent",
  "year",
  "score",
  "runtime",
] as const
export const TitleSort = t.enum(TITLE_SORTS)
export type TitleSort = t.infer<typeof TitleSort>

/**
 * Which way a sort runs. Left out, it's the sort's usual way: A to Z by
 * name, and the newest, highest, or longest first for the rest.
 */
export const SortOrder = t.enum(["asc", "desc"])
export type SortOrder = t.infer<typeof SortOrder>

/** How far a score bound moves at a time, on 0 to 10. */
export const TITLE_SCORE_STEP = 0.5
/** How far a runtime bound moves at a time, in minutes. */
export const TITLE_RUNTIME_STEP = 15

/** Where the signed-in viewer is with a title. */
export const WATCH_STATES = ["unwatched", "inProgress", "watched"] as const
export const WatchFilter = t.enum(WATCH_STATES)
export type WatchFilter = t.infer<typeof WatchFilter>

/**
 * An age limit: the rating and every milder one of the same country's
 * system for one kind, as `titles.filterOptions` offers them.
 */
export const AgeLimit = t.object({
  /** ISO 3166-1, like US or DE. */
  country: t
    .string()
    .regex(/^[A-Z]{2}$/, "Use a two-letter country code like US."),
  rating: t.string().trim().min(1).max(16),
})
export type AgeLimit = t.infer<typeof AgeLimit>

const tags = t.array(t.string().trim().min(1).max(200)).max(20).$default([])
const filterYear = t
  .number()
  .int()
  .min(1800)
  .max(2200)
  .nullable()
  .$default(null)
const filterScore = t
  .number()
  .min(0)
  .max(10)
  .multipleOf(TITLE_SCORE_STEP)
  .nullable()
  .$default(null)
const filterRuntime = t
  .number()
  .int()
  .min(0)
  .max(1440)
  .multipleOf(TITLE_RUNTIME_STEP)
  .nullable()
  .$default(null)
const ordered = (low: number | null, high: number | null) =>
  low === null || high === null || low <= high

/**
 * What narrows a list of titles beyond its name. A title has to pass every
 * filter that is on. Null, or an empty list, leaves a filter off. Bounds
 * are inclusive, and a title without the value fails a bound.
 */
export const TitleFilters = t
  .object({
    /** Titles with every one of these genres, spelled as in `Title.genres`. */
    genres: tags,
    /** Titles from every one of these studios, spelled as in `Title.studios`. */
    studios: tags,
    yearFrom: filterYear,
    yearTo: filterYear,
    /** The provider's community score, out of 10. */
    scoreMin: filterScore,
    scoreMax: filterScore,
    /** Movies rated this or milder. Unrated movies and other kinds' ratings fail it. */
    movieRating: AgeLimit.nullable().$default(null),
    /** Shows rated this or milder, as `movieRating` for movies. */
    showRating: AgeLimit.nullable().$default(null),
    /** The language it was made in, as in `Title.originalLanguage`. */
    language: LanguageTag.nullable().$default(null),
    /** A movie's runtime, or a show's episodes', in minutes. */
    runtimeMin: filterRuntime,
    runtimeMax: filterRuntime,
    /** Where the signed-in viewer is with it. */
    watched: WatchFilter.nullable().$default(null),
  })
  .refine((value) => ordered(value.yearFrom, value.yearTo), {
    path: ["yearTo"],
    message: "The first year can't be after the last.",
  })
  .refine((value) => ordered(value.scoreMin, value.scoreMax), {
    path: ["scoreMax"],
    message: "The lowest score can't be above the highest.",
  })
  .refine((value) => ordered(value.runtimeMin, value.runtimeMax), {
    path: ["runtimeMax"],
    message: "The shortest runtime can't be longer than the longest.",
  })
export type TitleFilters = t.infer<typeof TitleFilters>

/** Every filter off. */
export const NO_TITLE_FILTERS: TitleFilters = {
  genres: [],
  studios: [],
  yearFrom: null,
  yearTo: null,
  scoreMin: null,
  scoreMax: null,
  movieRating: null,
  showRating: null,
  language: null,
  runtimeMin: null,
  runtimeMax: null,
  watched: null,
}

/** A list of titles: what it holds, in which order, and which page. */
export const TitleQuery = t.object({
  /** Part of the name or original name. */
  query: t.string().trim().max(200).optional(),
  kind: TitleKind.optional(),
  filters: TitleFilters.$default(NO_TITLE_FILTERS),
  sort: TitleSort.$default("name"),
  order: SortOrder.optional(),
  limit: t.number().int().min(1).max(200).$default(60),
  offset: t.number().int().min(0).$default(0),
})
export type TitleQuery = t.infer<typeof TitleQuery>

/**
 * The titles a filter's choices are drawn from: one library's, or every
 * library's, of one kind, and with a genre or from a studio for those
 * pages.
 */
export const TitleScope = t.object({
  libraryId: t.uuid().optional(),
  kind: TitleKind.optional(),
  /** The genre page's genre, which its titles all have. */
  genre: t.string().trim().min(1).max(200).optional(),
  /** The studio page's studio. */
  studio: t.string().trim().min(1).max(200).optional(),
})
export type TitleScope = t.infer<typeof TitleScope>

/** A span a filter's bounds move in, by `step`, from the lowest value to the highest. */
export const FilterRange = t.object({
  min: t.number(),
  max: t.number(),
  step: t.number(),
})
export type FilterRange = t.infer<typeof FilterRange>

/** An age rating titles carry, with how many do. */
export const RatingCount = t.object({
  rating: t.string(),
  titleCount: t.number().int(),
})

/** The age ratings of one kind, in the system they belong to. */
export const RatingSystem = t.object({
  kind: TitleKind,
  /** ISO 3166-1, like US or DE. Pass it back in an `AgeLimit`. */
  country: t.string(),
  /** Those the titles carry, mildest first. */
  ratings: t.array(RatingCount),
})
export type RatingSystem = t.infer<typeof RatingSystem>

export const LanguageCount = t.object({
  /** BCP 47, as in `Title.originalLanguage`. Clients name it. */
  language: t.string(),
  titleCount: t.number().int(),
})

/**
 * What each filter offers for the titles in a scope the viewer can see,
 * from what those titles carry. A filter with nothing to choose between
 * is empty or null.
 */
export const TitleFilterOptions = t.object({
  /**
   * By name. A genre page leaves its own genre out, and a studio page its
   * studio.
   */
  genres: t.array(Facet),
  /** Most titles first. */
  studios: t.array(Facet),
  /**
   * One system for each kind there are rated titles of, movies first: the
   * country's whose ratings most of them carry. Ratings from elsewhere
   * aren't offered. Empty when no system is known to the server.
   */
  ratings: t.array(RatingSystem),
  /** Most titles first. */
  languages: t.array(LanguageCount),
  years: FilterRange.nullable(),
  scores: FilterRange.nullable(),
  /** A movie's runtime, or a show's episodes', in minutes. */
  runtime: FilterRange.nullable(),
  /** How many titles the viewer hasn't started, is in the middle of, and has watched. */
  watched: t.object({
    unwatched: t.number().int(),
    inProgress: t.number().int(),
    watched: t.number().int(),
  }),
  /** Titles in the scope. */
  total: t.number().int(),
  /** The sorts there is something to order by: no score sort where no title has a score. */
  sorts: t.array(TitleSort),
})
export type TitleFilterOptions = t.infer<typeof TitleFilterOptions>

export const TitleList = t.object({
  items: t.array(TitleSummary),
  /** Titles that match, on every page. */
  total: t.number().int(),
})
export type TitleList = t.infer<typeof TitleList>

/** A page of titles from every library. */
export const BrowsedTitles = TitleList.extend({
  /**
   * How many match of each kind, with `kind` left out of the filter, so a
   * client offers only the kinds there are.
   */
  kinds: t.object({ movie: t.number().int(), show: t.number().int() }),
})
export type BrowsedTitles = t.infer<typeof BrowsedTitles>

/** The genres and studios of a set of titles, most titles first. */
export const TitleFacets = t.object({
  genres: t.array(Facet),
  studios: t.array(Facet),
})
export type TitleFacets = t.infer<typeof TitleFacets>

export const Title = TitleSummary.extend({
  originalName: t.string().nullable(),
  tagline: t.string().nullable(),
  /** First release or air date, YYYY-MM-DD. */
  releaseDate: t.string().nullable(),
  /** Such as `Ended` or `Returning Series`, in the provider's words. */
  status: t.string().nullable(),
  /** The folder or file below the library folder that makes this title. */
  path: t.string(),
  /** Null when the library has no provider or nothing matched. */
  provider: MetadataProviderId.nullable(),
  providerId: t.string().nullable(),
  /** Ids at other sites, such as `imdb`, `tmdb`, or `tvdb`. */
  externalIds: t.record(t.string(), t.string()),
  refreshedAt: t.date().nullable(),
  /** Production companies, or the studio for anime, in the provider's order. */
  studios: t.array(t.string()),
  /** Cast in billing order, then crew. */
  credits: t.array(Credit),
  /**
   * Best first: in the library's metadata language, then English, then
   * without a language. A client may put those in its own language first.
   * Empty when the provider has none.
   */
  trailers: t.array(Trailer),
  /** Its files, less the specials when the account hides them. */
  itemCount: t.number().int(),
  /**
   * The seasons it has files in, in order. Season 0 is left out when the
   * account hides specials and the show has other seasons.
   */
  seasons: t.array(Season),
  /**
   * Season 0 when it's left out of `seasons`, so its own page still opens
   * from a link. Null otherwise.
   */
  specials: Season.nullable(),
  /** What Play starts: the file in progress, the next one, or the first. */
  next: MediaItem.nullable(),
})
export type Title = t.infer<typeof Title>

/** A candidate from a provider search, for fixing a wrong match. */
export const MetadataMatch = t.object({
  provider: MetadataProviderId,
  id: t.string(),
  name: t.string(),
  year: t.number().int().nullable(),
  overview: t.string().nullable(),
  poster: Artwork.nullable(),
})
export type MetadataMatch = t.infer<typeof MetadataMatch>

/** The images of a movie or show itself, as in `Images`. */
export const TITLE_IMAGE_SLOTS = ["poster", "backdrop", "logo"] as const
export const TitleImageSlot = t.enum(TITLE_IMAGE_SLOTS)
export type TitleImageSlot = t.infer<typeof TitleImageSlot>

/**
 * Every kind of image there is to edit: a title's, a season's poster, and
 * an episode's still.
 */
export const IMAGE_SLOTS = [...TITLE_IMAGE_SLOTS, "still"] as const
export const ImageSlot = t.enum(IMAGE_SLOTS)
export type ImageSlot = t.infer<typeof ImageSlot>

/**
 * Whose images: the title's own, a season's with `season`, or an
 * episode's with `season` and `episode`.
 */
export const ImageTarget = t.object({
  id: t.uuid(),
  season: t.number().int().min(0).optional(),
  episode: t.number().int().min(0).optional(),
})
export type ImageTarget = t.infer<typeof ImageTarget>

/** One image of a title, season, or episode, for editing it. */
export const ItemImage = t.object({
  slot: ImageSlot,
  /** Null when it has none. */
  image: Artwork.nullable(),
  /**
   * An admin picked, uploaded, or removed it, so fetching the metadata
   * again leaves it alone. False while it's the provider's.
   */
  chosen: t.boolean(),
  /** It was uploaded, not taken from a provider. */
  uploaded: t.boolean(),
})
export type ItemImage = t.infer<typeof ItemImage>

/** An image the library's provider has for a title, season, or episode. */
export const RemoteImage = t.object({
  /** Pass it to `titles.setImage` to use the image. */
  id: t.string(),
  /** A smaller copy, for showing the choices. */
  preview: Artwork,
  /** In pixels. Null when the provider doesn't say. */
  width: t.number().int().nullable(),
  height: t.number().int().nullable(),
  /**
   * BCP 47 tag of the language of any text on it. Null for an image
   * without text, or when the provider doesn't say.
   */
  language: t.string().nullable(),
})
export type RemoteImage = t.infer<typeof RemoteImage>

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

/** An image to use as it is. The server scales it as it does a provider's. */
export const ImageUpload = t
  .file()
  .min(1, "That file is empty.")
  .max(MAX_IMAGE_BYTES, "Pick an image under 25 MB.")
  .mime([...IMAGE_TYPES], "Pick a JPEG, PNG, or WebP image.")
