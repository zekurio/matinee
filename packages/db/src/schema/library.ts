import type {
  CreditKind,
  LibraryKind,
  MetadataProviderId,
  TitleImageSlot,
  TitleKind,
} from "@matinee/contracts"
import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { createdAt } from "./columns"

export const library = pgTable("library", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  kind: text().$type<LibraryKind>().notNull(),
  /** Null means titles keep the names read from folders and files. */
  metadataProvider: text().$type<MetadataProviderId>(),
  metadataLanguage: text().notNull().default("en-US"),
  lastScannedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: createdAt(),
})

export const libraryFolder = pgTable(
  "library_folder",
  {
    id: uuid().primaryKey().defaultRandom(),
    libraryId: uuid()
      .notNull()
      .references(() => library.id, { onDelete: "cascade" }),
    path: text().notNull(),
    position: integer().notNull().default(0),
  },
  (t) => [uniqueIndex("library_folder_path").on(t.libraryId, t.path)],
)

/**
 * A remote image a provider pointed at, or one an admin uploaded. The id
 * is derived from the URL, so the same image is stored once, and clients
 * can only make the server fetch URLs a provider gave it.
 */
export const artwork = pgTable("artwork", {
  /**
   * First 32 hex characters of the URL's SHA-256, or of the bytes' for an
   * upload.
   */
  id: text().primaryKey(),
  /** Null for an upload, whose only copy is on disk. */
  url: text(),
  /**
   * A BlurHash of the image, for clients to show while it loads. Null
   * until the server has downloaded and read it.
   */
  blurhash: text(),
  /** Width over height, set with `blurhash`. */
  aspectRatio: doublePrecision(),
  createdAt: createdAt(),
})

export const artworkRef = () =>
  text().references(() => artwork.id, { onDelete: "set null" })

export type ExternalIds = Record<string, string>

/** A trailer the metadata provider lists, by its YouTube video id. */
export type YouTubeTrailer = {
  key: string
  name: string | null
  /** BCP 47. Null when it has no spoken language or the provider doesn't say. */
  language: string | null
}

/**
 * A movie or show, grouping one or more files. The scanner creates
 * it from folder and file names; a metadata refresh fills in the rest.
 */
export const title = pgTable(
  "title",
  {
    id: uuid().primaryKey().defaultRandom(),
    libraryId: uuid()
      .notNull()
      .references(() => library.id, { onDelete: "cascade" }),
    kind: text().$type<TitleKind>().notNull(),
    /** Folder or file below the library folders that forms the title. */
    path: text().notNull(),
    name: text().notNull(),
    /** Lowercase name without a leading article, for sorting. */
    sortName: text().notNull(),
    originalName: text(),
    /** BCP 47 tag of the language it was made in, from the provider. */
    originalLanguage: text(),
    year: integer(),
    overview: text(),
    tagline: text(),
    genres: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    rating: doublePrecision(),
    contentRating: text(),
    releaseDate: date({ mode: "string" }),
    status: text(),
    runtimeMinutes: integer(),
    /** Production companies, in the provider's order. */
    studios: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    posterId: artworkRef(),
    backdropId: artworkRef(),
    logoId: artworkRef(),
    /**
     * The images an admin picked or uploaded, which a refresh leaves
     * alone. A slot here with a null id was removed on purpose.
     */
    chosenImages: text()
      .array()
      .$type<TitleImageSlot[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Provider of the last refresh. Null if the library has none. */
    provider: text().$type<MetadataProviderId>(),
    /** The match at that provider. Null when nothing matched. */
    providerId: text(),
    /** Ids from the folder name and the provider, by site. */
    externalIds: jsonb().$type<ExternalIds>().notNull().default({}),
    /** Best first: the library's metadata language, English, then none. */
    trailers: jsonb().$type<YouTubeTrailer[]>().notNull().default([]),
    /** When the newest file arrived. */
    addedAt: createdAt(),
    refreshedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("title_library_path").on(t.libraryId, t.path),
    index("title_provider_identity_idx").on(
      t.libraryId,
      t.kind,
      t.provider,
      t.providerId,
    ),
    index("title_external_ids_idx").using("gin", t.externalIds),
    index("title_sort_idx").on(t.libraryId, t.sortName),
    index("title_added_idx").on(t.libraryId, t.addedAt),
    // Genre and studio pages and filters ask for titles that contain one.
    index("title_genres_idx").using("gin", t.genres),
    index("title_studios_idx").using("gin", t.studios),
  ],
)

export const season = pgTable(
  "season",
  {
    titleId: uuid()
      .notNull()
      .references(() => title.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    overview: text(),
    posterId: artworkRef(),
    /** An admin picked the poster, so a refresh keeps it. */
    posterChosen: boolean().notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.titleId, t.number] })],
)

/** Every episode the provider lists, whether or not a file exists. */
export const episode = pgTable(
  "episode",
  {
    titleId: uuid()
      .notNull()
      .references(() => title.id, { onDelete: "cascade" }),
    seasonNumber: integer().notNull(),
    episodeNumber: integer().notNull(),
    name: text(),
    overview: text(),
    airDate: date({ mode: "string" }),
    runtimeMinutes: integer(),
    stillId: artworkRef(),
    /** An admin picked the still, so a refresh keeps it. */
    stillChosen: boolean().notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.titleId, t.seasonNumber, t.episodeNumber] }),
  ],
)

/**
 * The cast and crew the provider lists for a title. A refresh replaces
 * them all, like episodes.
 */
export const credit = pgTable(
  "credit",
  {
    titleId: uuid()
      .notNull()
      .references(() => title.id, { onDelete: "cascade" }),
    /** Billing order: cast first, then crew. */
    position: integer().notNull(),
    kind: text().$type<CreditKind>().notNull(),
    name: text().notNull(),
    /** The character, or the crew member's jobs. */
    role: text(),
    /** The person's id at the title's provider. */
    personId: text(),
    photoId: artworkRef(),
  },
  (t) => [
    primaryKey({ columns: [t.titleId, t.position] }),
    // A person's page finds their credits by name.
    index("credit_name_idx").on(t.name),
  ],
)

export type LibraryRow = typeof library.$inferSelect
export type TitleRow = typeof title.$inferSelect
export type SeasonRow = typeof season.$inferSelect
export type EpisodeRow = typeof episode.$inferSelect
export type CreditRow = typeof credit.$inferSelect
