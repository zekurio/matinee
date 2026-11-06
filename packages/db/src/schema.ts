import type {
  LibraryKind,
  MetadataProviderId,
  TitleKind,
  UserRole,
} from "@matinee/contracts"
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()

export const user = pgTable(
  "user",
  {
    id: uuid().primaryKey().defaultRandom(),
    username: text().notNull(),
    displayName: text(),
    role: text().$type<UserRole>().notNull().default("user"),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [uniqueIndex("user_username_lower").on(sql`lower(${t.username})`)],
)

/** One row per signed-in client. Only the token's SHA-256 is stored. */
export const session = pgTable(
  "session",
  {
    id: uuid().primaryKey().defaultRandom(),
    tokenHash: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    userAgent: text(),
    createdAt: createdAt(),
    lastSeenAt: createdAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
)

export const passkey = pgTable(
  "passkey",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialId: text().notNull().unique(),
    /** COSE public key, base64url. */
    publicKey: text().notNull(),
    counter: integer().notNull().default(0),
    transports: text().array(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull().default(false),
    name: text(),
    createdAt: createdAt(),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("passkey_user_idx").on(t.userId)],
)

/** A link between a user and a subject at the configured OIDC issuer. */
export const oidcAccount = pgTable(
  "oidc_account",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    issuer: text().notNull(),
    subject: text().notNull(),
    /** Username claim at link time, so the owner can tell accounts apart. */
    label: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("oidc_account_issuer_subject").on(t.issuer, t.subject),
    index("oidc_account_user_idx").on(t.userId),
  ],
)

/** A value JSON can hold. `undefined` members drop out when it's stored. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined }
export type JsonObject = { [key: string]: JsonValue | undefined }

export type ChallengePayload = Record<string, string | number | boolean | null>

/** Single-use state for passkey ceremonies and OIDC round trips. */
export const authChallenge = pgTable(
  "auth_challenge",
  {
    id: uuid().primaryKey().defaultRandom(),
    purpose: text().notNull(),
    challenge: text().notNull(),
    payload: jsonb().$type<ChallengePayload>().notNull().default({}),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_challenge_expires_idx").on(t.expiresAt)],
)

/**
 * Settings an admin saved in the app, one row per group. A missing row or key
 * falls back to the environment.
 */
export const setting = pgTable("setting", {
  key: text().primaryKey(),
  /** Readers parse this with the schema of their setting. */
  value: jsonb().$type<JsonObject>().notNull(),
  updatedAt: createdAt(),
})

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
 * A remote image a provider pointed at. The id is derived from the URL, so
 * the same image is stored once, and clients can only make the server fetch
 * URLs a provider gave it.
 */
export const artwork = pgTable("artwork", {
  /** First 32 hex characters of the URL's SHA-256. */
  id: text().primaryKey(),
  url: text().notNull(),
  createdAt: createdAt(),
})

const artworkRef = () =>
  text().references(() => artwork.id, { onDelete: "set null" })

export type ExternalIds = Record<string, string>

/**
 * A movie, show, or folder, grouping one or more files. The scanner creates
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
    posterId: artworkRef(),
    backdropId: artworkRef(),
    logoId: artworkRef(),
    /** Provider of the last refresh. Null if the library has none. */
    provider: text().$type<MetadataProviderId>(),
    /** The match at that provider. Null when nothing matched. */
    providerId: text(),
    /** Ids from the folder name and the provider, by site. */
    externalIds: jsonb().$type<ExternalIds>().notNull().default({}),
    /** When the newest file arrived. */
    addedAt: createdAt(),
    refreshedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("title_library_path").on(t.libraryId, t.path),
    index("title_sort_idx").on(t.libraryId, t.sortName),
    index("title_added_idx").on(t.libraryId, t.addedAt),
  ],
)

export const season = pgTable(
  "season",
  {
    titleId: uuid()
      .notNull()
      .references(() => title.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    name: text(),
    overview: text(),
    posterId: artworkRef(),
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
  },
  (t) => [
    primaryKey({ columns: [t.titleId, t.seasonNumber, t.episodeNumber] }),
  ],
)

/** A playable file found by a library scan. */
export const mediaItem = pgTable(
  "media_item",
  {
    id: uuid().primaryKey().defaultRandom(),
    libraryId: uuid()
      .notNull()
      .references(() => library.id, { onDelete: "cascade" }),
    folderId: uuid()
      .notNull()
      .references(() => libraryFolder.id, { onDelete: "cascade" }),
    path: text().notNull(),
    relativePath: text().notNull(),
    title: text().notNull(),
    /** Set by the scan after the file is found. */
    titleId: uuid().references(() => title.id, { onDelete: "set null" }),
    seasonNumber: integer(),
    episodeNumber: integer(),
    container: text().notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    modifiedAt: timestamp({ withTimezone: true }).notNull(),
    /** Learned from ffprobe or the player; null until then. */
    durationSeconds: doublePrecision(),
    createdAt: createdAt(),
    /** Start of the last scan that found the file new, changed, or moved. */
    seenAt: createdAt(),
  },
  (t) => [
    uniqueIndex("media_item_library_path").on(t.libraryId, t.path),
    index("media_item_title_idx").on(t.libraryId, t.title),
    index("media_item_title_id_idx").on(
      t.titleId,
      t.seasonNumber,
      t.episodeNumber,
    ),
  ],
)

/** Where each user is in each file. One row per user and file. */
export const watchProgress = pgTable(
  "watch_progress",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaItemId: uuid()
      .notNull()
      .references(() => mediaItem.id, { onDelete: "cascade" }),
    positionSeconds: doublePrecision().notNull(),
    completed: boolean().notNull().default(false),
    updatedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.mediaItemId] }),
    index("watch_progress_recent_idx").on(t.userId, t.updatedAt),
  ],
)

export type UserRow = typeof user.$inferSelect
export type PasskeyRow = typeof passkey.$inferSelect
export type LibraryRow = typeof library.$inferSelect
export type TitleRow = typeof title.$inferSelect
export type EpisodeRow = typeof episode.$inferSelect
export type MediaItemRow = typeof mediaItem.$inferSelect
export type WatchProgressRow = typeof watchProgress.$inferSelect
