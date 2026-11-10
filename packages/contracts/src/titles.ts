import { Artwork } from "./artwork"
import { MetadataProviderId } from "./library"
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

export const TITLE_SORTS = ["name", "recent", "year"] as const
export const TitleSort = t.enum(TITLE_SORTS)
export type TitleSort = t.infer<typeof TitleSort>

/** What narrows a list of titles. A title has to match every one given. */
export const TitleFilter = t.object({
  /** Part of the name or original name. */
  query: t.string().trim().max(200).optional(),
  kind: TitleKind.optional(),
  /** A genre, spelled as in `Title.genres`. */
  genre: t.string().trim().min(1).max(200).optional(),
  /** A studio, spelled as in `Title.studios`. */
  studio: t.string().trim().min(1).max(200).optional(),
  sort: TitleSort.$default("name"),
  limit: t.number().int().min(1).max(200).$default(60),
  offset: t.number().int().min(0).$default(0),
})
export type TitleFilter = t.infer<typeof TitleFilter>

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
  runtimeMinutes: t.number().int().nullable(),
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
  itemCount: t.number().int(),
  seasons: t.array(Season),
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
