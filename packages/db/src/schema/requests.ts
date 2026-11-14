import type {
  CatalogRef,
  FulfilmentValues,
  RemoteRef,
} from "@matinee/contracts"
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

export const fulfilmentConnection = pgTable("fulfilment_connection", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  source: text().notNull(),
  /** Adapter-specific settings, parsed by its schema. Never returned without redaction. */
  settings: jsonb().$type<FulfilmentValues>().notNull().default({}),
  /** Saved plaintext secret overrides MATINEE_CONNECTION_<SLUG>_API_KEY. */
  apiKey: text(),
  createdAt: createdAt(),
  updatedAt: createdAt(),
})

export const libraryFulfilment = pgTable("library_fulfilment", {
  libraryId: uuid()
    .primaryKey()
    .references(() => library.id, { onDelete: "cascade" }),
  connectionId: uuid()
    .notNull()
    .references(() => fulfilmentConnection.id, { onDelete: "cascade" }),
  options: jsonb().$type<FulfilmentValues>().notNull().default({}),
  /**
   * The options anime is sent with instead, parsed by the connection's
   * source like `options`. Null when anime is sent like everything else.
   */
  animeOptions: jsonb().$type<FulfilmentValues>(),
  /**
   * The library anime lands in, picked by an admin because its folder is
   * in no library's folders. Unused while a library's folder holds it.
   */
  animeLibraryId: uuid().references(() => library.id, {
    onDelete: "set null",
  }),
  updatedAt: createdAt(),
})

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
    /** Adapter-owned reference. Connection retained separately so changed mappings cannot misroute it. */
    remoteRef: jsonb().$type<RemoteRef>(),
    connectionId: uuid().references(() => fulfilmentConnection.id, {
      onDelete: "set null",
    }),
    /**
     * The library whose mapping's anime options send it, which may be its
     * own library. Null sends it with its own library's mapping.
     */
    animeFrom: uuid().references(() => library.id, { onDelete: "set null" }),
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
