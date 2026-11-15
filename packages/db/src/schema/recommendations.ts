import type { TitleKind } from "@matinee/contracts"
import {
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
import { title } from "./library"
import { user } from "./users"

/*
 * Recommendations. Every row keys a title by its kind and TMDB id, not
 * by a library title, so titles on the server and titles to ask for share
 * one space, and a title keeps its signals when a library loses it.
 *
 *   watch time ─▶ user_title_signal ─┐
 *   TMDB ───────▶ title_features ────┼─▶ scoring job ─▶ recommendation
 *   "not interested" ─▶ recommendation_dismissal ─┘
 *
 * What the rows showed goes in recommendation_impression, to measure them
 * against what people went on to play or ask for.
 */

/** A person a title credits, as recommendations weigh them. */
export type FeaturePerson = {
  /** TMDB's person id. */
  id: string
  name: string
  role: "director" | "writer" | "creator" | "actor"
}

/** What a title is about at TMDB, for scoring what's like it. */
export const titleFeatures = pgTable(
  "title_features",
  {
    kind: text().$type<TitleKind>().notNull(),
    tmdbId: text().notNull(),
    genreIds: jsonb().$type<number[]>().notNull().default([]),
    keywordIds: jsonb().$type<number[]>().notNull().default([]),
    /** Directors, writers, creators, then the top of the cast in billing order. */
    people: jsonb().$type<FeaturePerson[]>().notNull().default([]),
    companyIds: jsonb().$type<number[]>().notNull().default([]),
    /** ISO 639-1, as TMDB gives it. */
    originalLanguage: text(),
    year: integer(),
    /** TMDB's user score, 0 to 10, and how many voted. */
    rating: doublePrecision(),
    votes: integer().notNull().default(0),
    popularity: doublePrecision().notNull().default(0),
    fetchedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.kind, t.tmdbId] }),
    index("title_features_fetched_idx").on(t.fetchedAt),
  ],
)

/**
 * How much a user likes a title, from their watch time, finished plays,
 * rewatches and favorites, fading with time. Abandoned titles score
 * below zero. Rebuilt by the scoring job from `playback_session`.
 */
export const userTitleSignal = pgTable(
  "user_title_signal",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text().$type<TitleKind>().notNull(),
    tmdbId: text().notNull(),
    /** The library title the latest play was of, if it's still there. */
    titleId: uuid().references(() => title.id, { onDelete: "set null" }),
    score: doublePrecision().notNull(),
    watchedSeconds: doublePrecision().notNull().default(0),
    /** Sittings, finished or not, marked ones included. */
    plays: integer().notNull().default(0),
    /** Files finished, counting each rewatch. */
    completions: integer().notNull().default(0),
    lastWatchedAt: timestamp({ withTimezone: true }),
    updatedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind, t.tmdbId] }),
    index("user_title_signal_score_idx").on(t.userId, t.score),
  ],
)

/** Why a recommendation is there, as the scoring job stored it. */
export type StoredReason =
  | {
      kind: "watched"
      /** The title it's like, which the user watched. */
      seed: { kind: TitleKind; tmdbId: string; name: string }
    }
  | { kind: "person"; personId: string; name: string }
  | { kind: "taste" }

/**
 * A title recommended to a user, best first. One on the server carries
 * its library title; the rest are titles to ask for, with what a catalog
 * card shows, so Discover reads them without asking TMDB.
 */
export const recommendation = pgTable(
  "recommendation",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text().$type<TitleKind>().notNull(),
    tmdbId: text().notNull(),
    /** A library title the user could see when it was worked out. */
    titleId: uuid().references(() => title.id, { onDelete: "set null" }),
    score: doublePrecision().notNull(),
    reason: jsonb().$type<StoredReason>().notNull(),
    name: text().notNull(),
    year: integer(),
    /** The provider's poster URL, saved to `artwork` when a page shows it. */
    poster: text(),
    releaseDate: text(),
    /** What worked it out, like `profile-v1`, to tell versions apart. */
    algorithm: text().notNull(),
    computedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind, t.tmdbId] }),
    index("recommendation_score_idx").on(t.userId, t.score),
  ],
)

/** A title a user marked "Not interested". */
export const recommendationDismissal = pgTable(
  "recommendation_dismissal",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text().$type<TitleKind>().notNull(),
    tmdbId: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.tmdbId] })],
)

/** When each user's recommendations were last worked out, and from what. */
export const recommendationRun = pgTable("recommendation_run", {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** The newest watch the run saw, to tell when there's more since. */
  signalsAt: timestamp({ withTimezone: true }),
  algorithm: text().notNull(),
  computedAt: timestamp({ withTimezone: true }).notNull(),
})

/**
 * A recommendation a user was shown, once a day per title and place. What
 * they played or asked for afterwards comes from `playback_session` and
 * `request`, so no click is logged.
 */
export const recommendationImpression = pgTable(
  "recommendation_impression",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text().$type<TitleKind>().notNull(),
    tmdbId: text().notNull(),
    surface: text().$type<"home" | "discover">().notNull(),
    /** The row it was in, like `forYou`. */
    rail: text().notNull(),
    /** Its place in the row, from 0. */
    position: integer().notNull(),
    score: doublePrecision().notNull(),
    algorithm: text().notNull(),
    day: date({ mode: "string" }).notNull(),
    shownAt: createdAt(),
  },
  (t) => [
    uniqueIndex("recommendation_impression_daily_idx").on(
      t.userId,
      t.kind,
      t.tmdbId,
      t.surface,
      t.day,
    ),
    index("recommendation_impression_user_idx").on(t.userId, t.shownAt),
  ],
)

export type TitleFeaturesRow = typeof titleFeatures.$inferSelect
export type UserTitleSignalRow = typeof userTitleSignal.$inferSelect
export type RecommendationRow = typeof recommendation.$inferSelect
