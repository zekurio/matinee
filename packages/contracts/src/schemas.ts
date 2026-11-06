import type {
  AuthenticationExtensionsClientOutputs,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser"
import { z } from "zod"

export const USER_ROLES = ["admin", "user"] as const
export const UserRole = z.enum(USER_ROLES)
export type UserRole = z.infer<typeof UserRole>

export const User = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  role: UserRole,
})
export type User = z.infer<typeof User>

export const Username = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(32, "Use at most 32 characters.")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    "Use letters, numbers, dots, dashes, and underscores.",
  )

export const AuthConfig = z.object({
  /** No account exists yet. The first account becomes the admin. */
  setupRequired: z.boolean(),
  /** Setup needs the token the server printed to its log. */
  setupTokenRequired: z.boolean(),
  /** Anyone may create an account with a passkey. */
  passkeySignUp: z.boolean(),
  oidc: z.object({ displayName: z.string() }).nullable(),
})
export type AuthConfig = z.infer<typeof AuthConfig>

// SimpleWebAuthn verifies the ceremony payloads. The schemas only check the
// envelope so malformed requests fail before reaching it.
const ExtensionOutputs = z.looseObject({})

const credentialEnvelope = {
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal("public-key"),
  // Outputs vary by extension; SimpleWebAuthn reads the ones it knows.
  clientExtensionResults: z.custom<AuthenticationExtensionsClientOutputs>(
    (value) => ExtensionOutputs.safeParse(value).success,
  ),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
}

export const RegistrationResponse = z.object({
  ...credentialEnvelope,
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
    authenticatorData: z.string().optional(),
    // Browsers report transports as free strings. The server keeps the
    // ones it knows.
    transports: z.array(z.string().max(32)).max(16).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: z.string().optional(),
  }),
}) satisfies z.ZodType<RegistrationResponseJSON>

export const AuthenticationResponse = z.object({
  ...credentialEnvelope,
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
}) satisfies z.ZodType<AuthenticationResponseJSON>

export const PasskeyCreation = z.object({
  challengeId: z.uuid(),
  options: z.custom<PublicKeyCredentialCreationOptionsJSON>(),
})

export const PasskeyRequest = z.object({
  challengeId: z.uuid(),
  options: z.custom<PublicKeyCredentialRequestOptionsJSON>(),
})

export const Passkey = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  backedUp: z.boolean(),
  createdAt: z.date(),
  lastUsedAt: z.date().nullable(),
})
export type Passkey = z.infer<typeof Passkey>

export const PasskeyName = z.string().trim().max(64).nullable()

export const OidcAccount = z.object({
  id: z.uuid(),
  label: z.string().nullable(),
  createdAt: z.date(),
})
export type OidcAccount = z.infer<typeof OidcAccount>

export const LIBRARY_KINDS = ["movies", "shows", "other"] as const
export const LibraryKind = z.enum(LIBRARY_KINDS)
export type LibraryKind = z.infer<typeof LibraryKind>

export const METADATA_PROVIDERS = ["tmdb", "tvdb", "anilist"] as const
export const MetadataProviderId = z.enum(METADATA_PROVIDERS)
export type MetadataProviderId = z.infer<typeof MetadataProviderId>

/** A language with an optional region, like `en`, `de-DE`, or `pt-BR`. */
export const MetadataLanguage = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use a language code like en or de-DE.")

export const MetadataProvider = z.object({
  id: MetadataProviderId,
  name: z.string(),
  /** What it is good at, in a line. */
  description: z.string(),
  /** It names and describes episodes, not only the show. */
  episodes: z.boolean(),
  /** The server has the API key it needs. */
  configured: z.boolean(),
  /** What to set to enable it. Null once configured. */
  setup: z.string().nullable(),
})
export type MetadataProvider = z.infer<typeof MetadataProvider>

export const Library = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: LibraryKind,
  paths: z.array(z.string()),
  itemCount: z.number().int(),
  /** Movies or shows found, or top-level folders in an `other` library. */
  titleCount: z.number().int(),
  metadataProvider: MetadataProviderId.nullable(),
  metadataLanguage: z.string(),
  lastScannedAt: z.date().nullable(),
  scanning: z.boolean(),
  /** Metadata is being fetched for new or changed titles. */
  refreshing: z.boolean(),
})
export type Library = z.infer<typeof Library>

const AbsolutePath = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.startsWith("/"), "Use an absolute path.")

export const LibraryInput = z.object({
  name: z.string().trim().min(1, "Give the library a name.").max(100),
  kind: LibraryKind,
  paths: z
    .array(AbsolutePath)
    .min(1, "Add at least one folder.")
    .max(32)
    .refine(
      (paths) => new Set(paths).size === paths.length,
      "Each folder can be added once.",
    ),
  /** Where titles get names, art, and descriptions. Ignored for `other`. */
  metadataProvider: MetadataProviderId.nullable(),
  metadataLanguage: MetadataLanguage,
})
export type LibraryInput = z.infer<typeof LibraryInput>

/** Artwork ids. Load them through `artworkPath()`. */
export const Images = z.object({
  /** Portrait cover, 2:3. */
  poster: z.string().nullable(),
  /** Landscape art, usually without text. */
  backdrop: z.string().nullable(),
  /** The title as a transparent image, for laying over a backdrop. */
  logo: z.string().nullable(),
})
export type Images = z.infer<typeof Images>

/**
 * What a title groups. Shows have seasons and episodes; folders are the
 * top-level folders of an `other` library and never get metadata.
 */
export const TITLE_KINDS = ["movie", "show", "folder"] as const
export const TitleKind = z.enum(TITLE_KINDS)
export type TitleKind = z.infer<typeof TitleKind>

/** A movie, show, or folder: what a poster stands for. */
export const TitleSummary = z.object({
  id: z.uuid(),
  libraryId: z.uuid(),
  kind: TitleKind,
  name: z.string(),
  year: z.number().int().nullable(),
  overview: z.string().nullable(),
  images: Images,
})
export type TitleSummary = z.infer<typeof TitleSummary>

/** The signed-in user's place in a file. */
export const WatchState = z.object({
  positionSeconds: z.number(),
  completed: z.boolean(),
  updatedAt: z.date(),
})
export type WatchState = z.infer<typeof WatchState>

/** What the library's provider knows about an episode. */
export const EpisodeInfo = z.object({
  name: z.string().nullable(),
  overview: z.string().nullable(),
  /** YYYY-MM-DD. */
  airDate: z.string().nullable(),
  runtimeMinutes: z.number().int().nullable(),
  /** Artwork id of a frame the provider picked. */
  still: z.string().nullable(),
})
export type EpisodeInfo = z.infer<typeof EpisodeInfo>

export const MediaItem = z.object({
  id: z.uuid(),
  libraryId: z.uuid(),
  /** A readable name from the file name alone, like `Show S01E02`. */
  fileTitle: z.string(),
  /** The movie, show, or folder the file belongs to. Null until scanned. */
  title: TitleSummary.nullable(),
  /** From the file name or its season folder. */
  seasonNumber: z.number().int().nullable(),
  episodeNumber: z.number().int().nullable(),
  /** Null for movies and episodes the provider doesn't know. */
  episode: EpisodeInfo.nullable(),
  /** Path below the library folder, for display. */
  relativePath: z.string(),
  container: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  modifiedAt: z.date(),
  /** Null until the server or a player has measured it. */
  durationSeconds: z.number().nullable(),
  /** Null when the signed-in user hasn't started it. */
  progress: WatchState.nullable(),
})
export type MediaItem = z.infer<typeof MediaItem>

export const SUBTITLE_SOURCES = ["sidecar", "embedded"] as const
/** A file next to the video, or a stream inside it. */
export const SubtitleSource = z.enum(SUBTITLE_SOURCES)
export type SubtitleSource = z.infer<typeof SubtitleSource>

/** A subtitle track of a file. Load it as WebVTT from `subtitlePath()`. */
export const SubtitleTrack = z.object({
  id: z.string(),
  /** The language, plus the track's own title if it has one. */
  label: z.string(),
  /** BCP 47 tag, like `en` or `pt-BR`. Null when the file doesn't say. */
  language: z.string().nullable(),
  /** Translates only foreign dialogue and signs. */
  forced: z.boolean(),
  /** Also describes sounds, for deaf and hard of hearing viewers (SDH, CC). */
  sdh: z.boolean(),
  /** The file marks it as the track to show by default. */
  default: z.boolean(),
  source: SubtitleSource,
  /**
   * False for picture-based subtitles (PGS, VobSub, DVB), which can't be
   * shown without burning them into the video.
   */
  available: z.boolean(),
})
export type SubtitleTrack = z.infer<typeof SubtitleTrack>

export const Subtitles = z.object({
  /** Files next to the video first, then streams in file order. */
  tracks: z.array(SubtitleTrack),
  /** Language of the audio that plays first, for picking forced tracks. */
  audioLanguage: z.string().nullable(),
})
export type Subtitles = z.infer<typeof Subtitles>

export const ShelfEntry = z.object({
  title: TitleSummary,
  /** The title's first file, which Play starts. */
  item: MediaItem,
  /** Files in the title; 1 for most movies. */
  count: z.number().int(),
  /** When the newest of those files was added. */
  addedAt: z.date(),
})
export type ShelfEntry = z.infer<typeof ShelfEntry>

export const Season = z.object({
  /** Null collects files without a season number. */
  number: z.number().int().nullable(),
  name: z.string(),
  overview: z.string().nullable(),
  poster: z.string().nullable(),
  itemCount: z.number().int(),
  /** Files the signed-in user finished. */
  watchedCount: z.number().int(),
})
export type Season = z.infer<typeof Season>

export const Title = TitleSummary.extend({
  originalName: z.string().nullable(),
  tagline: z.string().nullable(),
  genres: z.array(z.string()),
  /** Community rating out of 10. */
  rating: z.number().nullable(),
  /** Age rating, like `TV-14` or `PG-13`. */
  contentRating: z.string().nullable(),
  /** First release or air date, YYYY-MM-DD. */
  releaseDate: z.string().nullable(),
  /** Such as `Ended` or `Returning Series`, in the provider's words. */
  status: z.string().nullable(),
  runtimeMinutes: z.number().int().nullable(),
  /** The folder or file below the library folder that makes this title. */
  path: z.string(),
  /** Null when the library has no provider or nothing matched. */
  provider: MetadataProviderId.nullable(),
  providerId: z.string().nullable(),
  /** Ids at other sites, such as `imdb`, `tmdb`, or `tvdb`. */
  externalIds: z.record(z.string(), z.string()),
  refreshedAt: z.date().nullable(),
  itemCount: z.number().int(),
  seasons: z.array(Season),
  /** What Play starts: the file in progress, the next one, or the first. */
  next: MediaItem.nullable(),
})
export type Title = z.infer<typeof Title>

/** A candidate from a provider search, for fixing a wrong match. */
export const MetadataMatch = z.object({
  provider: MetadataProviderId,
  id: z.string(),
  name: z.string(),
  year: z.number().int().nullable(),
  overview: z.string().nullable(),
  poster: z.string().nullable(),
})
export type MetadataMatch = z.infer<typeof MetadataMatch>

export const DirectoryListing = z.object({
  path: z.string(),
  parent: z.string().nullable(),
  directories: z.array(z.object({ name: z.string(), path: z.string() })),
})
export type DirectoryListing = z.infer<typeof DirectoryListing>

export const IdInput = z.object({ id: z.uuid() })
