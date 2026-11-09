import { Artwork } from "./artwork"
import { t } from "./schema"

export const LIBRARY_KINDS = ["movies", "shows"] as const
export const LibraryKind = t.enum(LIBRARY_KINDS)
export type LibraryKind = t.infer<typeof LibraryKind>

export const METADATA_PROVIDERS = ["tmdb", "tvdb"] as const
export const MetadataProviderId = t.enum(METADATA_PROVIDERS)
export type MetadataProviderId = t.infer<typeof MetadataProviderId>

/** A language with an optional region, like `en`, `de-DE`, or `pt-BR`. */
export const MetadataLanguage = t
  .string()
  .trim()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use a language code like en or de-DE.")

export const MetadataProvider = t.object({
  id: MetadataProviderId,
  name: t.string(),
  /** What it is good at, in a line. */
  description: t.string(),
  /** It names and describes episodes, not only the show. */
  episodes: t.boolean(),
  /** The server has the API key it needs. */
  configured: t.boolean(),
  /** What to set to enable it. Null once configured. */
  setup: t.string().nullable(),
})
export type MetadataProvider = t.infer<typeof MetadataProvider>

export const Library = t.object({
  id: t.uuid(),
  name: t.string(),
  kind: LibraryKind,
  paths: t.array(t.string()),
  itemCount: t.number().int(),
  /** Movies or shows found. */
  titleCount: t.number().int(),
  metadataProvider: MetadataProviderId.nullable(),
  metadataLanguage: t.string(),
  lastScannedAt: t.date().nullable(),
  scanning: t.boolean(),
  /** Metadata is being fetched for new or changed titles. */
  refreshing: t.boolean(),
  /**
   * The backdrop of one of its titles, to show the library by. A different
   * title gets picked each day. Null when no title has a backdrop.
   */
  backdrop: Artwork.nullable(),
})
export type Library = t.infer<typeof Library>

const AbsolutePath = t
  .string()
  .trim()
  .min(1)
  .refine((value) => value.startsWith("/"), "Use an absolute path.")

export const LibraryInput = t.object({
  name: t.string().trim().min(1, "Give the library a name.").max(100),
  kind: LibraryKind,
  paths: t
    .array(AbsolutePath)
    .min(1, "Add at least one folder.")
    .max(32)
    .refine(
      (paths) => new Set(paths).size === paths.length,
      "Each folder can be added once.",
    ),
  /** Where titles get names, art, and descriptions. */
  metadataProvider: MetadataProviderId.nullable(),
  metadataLanguage: MetadataLanguage,
})
export type LibraryInput = t.infer<typeof LibraryInput>

export const DirectoryListing = t.object({
  path: t.string(),
  parent: t.string().nullable(),
  directories: t.array(t.object({ name: t.string(), path: t.string() })),
})
export type DirectoryListing = t.infer<typeof DirectoryListing>
