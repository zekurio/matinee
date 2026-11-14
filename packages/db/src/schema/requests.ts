import type {
  CatalogRef,
  FulfilmentValues,
  RemoteRef,
} from "@matinee/contracts"
import { sql } from "drizzle-orm"
import {
  boolean,
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
import { artworkRef, library } from "./library"
import { user } from "./users"
const instant = () => timestamp({ withTimezone: true })

export const fulfilmentConnection = pgTable(
  "fulfilment_connection",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    source: text().notNull(),
    /**
     * How to reach it and how it behaves, parsed by its source's schema.
     * Never returned without redaction.
     */
    settings: jsonb().$type<FulfilmentValues>().notNull().default({}),
    /**
     * What a request is sent with, like the quality and the folder,
     * parsed by its source's schema. Override rules change them per title.
     */
    options: jsonb().$type<FulfilmentValues>().notNull().default({}),
    /** Requests for films go through it. At most one connection is. */
    defaultMovies: boolean().notNull().default(false),
    /** Requests for shows go through it. At most one connection is. */
    defaultShows: boolean().notNull().default(false),
    /**
     * The library a folder lands in, by folder, picked by an admin because
     * no library's folder holds it, as when the download manager runs in
     * a container and sees it under another path.
     */
    folderLibraries: jsonb()
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    /** Saved plaintext secret overrides MATINEE_CONNECTION_<SLUG>_API_KEY. */
    apiKey: text(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("fulfilment_default_movies")
      .on(t.defaultMovies)
      .where(sql`${t.defaultMovies}`),
    uniqueIndex("fulfilment_default_shows")
      .on(t.defaultShows)
      .where(sql`${t.defaultShows}`),
  ],
)

/**
 * An override rule of a connection: when a title matches its conditions,
 * it is sent with the rule's settings instead of the connection's. A
 * condition left empty matches anything, but at least one is set.
 */
export const fulfilmentRule = pgTable(
  "fulfilment_rule",
  {
    id: uuid().primaryKey().defaultRandom(),
    connectionId: uuid()
      .notNull()
      .references(() => fulfilmentConnection.id, { onDelete: "cascade" }),
    /** Its place among the connection's rules. The first wins a tie. */
    position: integer().notNull().default(0),
    /** Accounts whose requests it applies to. */
    users: jsonb().$type<string[]>().notNull().default([]),
    /** TMDB genre ids. */
    genres: jsonb().$type<number[]>().notNull().default([]),
    /** ISO 639-1 codes of the language a title was made in. */
    languages: jsonb().$type<string[]>().notNull().default([]),
    /** TMDB keywords, with their names for showing the rule. */
    keywords: jsonb()
      .$type<{ id: number; name: string }[]>()
      .notNull()
      .default([]),
    /** The options it changes, parsed by the connection's source. */
    settings: jsonb().$type<FulfilmentValues>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [index("fulfilment_rule_connection_idx").on(t.connectionId)],
)

export const request = pgTable(
  "request",
  {
    id: uuid().primaryKey().defaultRandom(),
    libraryId: uuid()
      .notNull()
      .references(() => library.id, { onDelete: "cascade" }),
    kind: text().$type<CatalogRef["kind"]>().notNull(),
    provider: text().$type<CatalogRef["provider"]>().notNull(),
    providerId: text().notNull(),
    externalIds: jsonb().$type<Record<string, string>>().notNull().default({}),
    /** Small provider snapshot. Poster uses the same artwork storage as identify candidates. */
    name: text().notNull(),
    year: integer(),
    posterId: artworkRef(),
    status: text()
      .$type<"asked" | "approved" | "declined">()
      .notNull()
      .default("asked"),
    future: boolean().notNull().default(false),
    declineReason: text().$type<"alreadyHere" | "notForServer" | "notFound">(),
    declineNote: text(),
    declinedBy: uuid().references(() => user.id, { onDelete: "set null" }),
    declinedAt: instant(),
    fulfilmentState: text().$type<"queued" | "sent" | "failed">(),
    fulfilmentError: text(),
    /** Adapter-owned reference to what the connection made of it. */
    remoteRef: jsonb().$type<RemoteRef>(),
    /**
     * The connection it is sent through, and the options it is sent with,
     * worked out when it was requested or moved, so a later change to the
     * connection or its rules doesn't send it somewhere else.
     */
    connectionId: uuid().references(() => fulfilmentConnection.id, {
      onDelete: "set null",
    }),
    options: jsonb().$type<FulfilmentValues>(),
    sentAt: instant(),
    /** First film arrival, for notification deduplication only, never availability. */
    arrivedAt: instant(),
    approvedAt: instant(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("request_identity").on(t.libraryId, t.provider, t.providerId),
    index("request_queue_idx").on(t.status, t.fulfilmentState),
    index("request_arrival_idx").on(t.arrivedAt),
  ],
)

export const requestSeason = pgTable(
  "request_season",
  {
    requestId: uuid()
      .notNull()
      .references(() => request.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    /** First playable episode noticed in this season, not cached availability. */
    arrivedAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.number] })],
)

export const requestFollower = pgTable(
  "request_follower",
  {
    requestId: uuid()
      .notNull()
      .references(() => request.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** True for an ask, false for Notify me. Only asks consume a title quota. */
    asked: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.userId] }),
    index("request_follower_user_idx").on(t.userId, t.createdAt),
  ],
)

export const notification = pgTable(
  "notification",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text()
      .$type<"ready" | "unavailable" | "waiting" | "needsAttention">()
      .notNull(),
    requestId: uuid().references(() => request.id, { onDelete: "set null" }),
    /** Null for a film or an admin summary. */
    season: integer(),
    count: integer().notNull().default(1),
    /** Stable event identity prevents repeated delivery on retries. */
    dedupeKey: text().notNull(),
    readAt: instant(),
    pushSentAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notification_dedupe").on(t.userId, t.dedupeKey),
    index("notification_user_idx").on(t.userId, t.createdAt),
    index("notification_unread_idx").on(t.userId, t.readAt),
  ],
)

export const webPushSubscription = pgTable(
  "web_push_subscription",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("web_push_user_idx").on(t.userId)],
)

export const providerCache = pgTable("provider_cache", {
  /** Includes provider, language, operation and all arguments. */
  key: text().primaryKey(),
  body: jsonb().notNull(),
  fetchedAt: createdAt(),
})
