import type {
  PlaybackMethod,
  PlaybackQuality,
  TitleKind,
} from "@matinee/contracts"
import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { createdAt } from "./columns"
import { title } from "./library"
import { mediaItem } from "./media"
import { user } from "./users"

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

/** A title a user marked as a favorite. */
export const favorite = pgTable(
  "favorite",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    titleId: uuid()
      .notNull()
      .references(() => title.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.titleId] }),
    index("favorite_recent_idx").on(t.userId, t.createdAt),
  ],
)

/**
 * A file a user marked as a favorite, such as an episode. A movie is a
 * favorite through its title.
 */
export const favoriteItem = pgTable(
  "favorite_item",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaItemId: uuid()
      .notNull()
      .references(() => mediaItem.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.mediaItemId] }),
    index("favorite_item_recent_idx").on(t.userId, t.createdAt),
  ],
)

/**
 * One sitting with one file, for statistics. The player makes the id and
 * reports how long it has played; the stream route adds what the server
 * converted. Marking a file watched adds a `marked` row instead, ended at
 * the time the user gave. Rows outlive the file and its title, so watch
 * time stays when a library loses them.
 */
export const playbackSession = pgTable(
  "playback_session",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaItemId: uuid().references(() => mediaItem.id, {
      onDelete: "set null",
    }),
    titleId: uuid().references(() => title.id, { onDelete: "set null" }),
    /** The title's kind when the session began, kept for counting. */
    titleKind: text().$type<TitleKind>(),
    positionSeconds: doublePrecision().notNull().default(0),
    /** Time spent playing, without pauses and buffering. */
    watchedSeconds: doublePrecision().notNull().default(0),
    /** Reached the point that marks a file watched. */
    completed: boolean().notNull().default(false),
    /**
     * The user marked the file watched; nothing played. Its watch time is
     * the runtime the player hadn't covered, and it counts as a play.
     */
    marked: boolean().notNull().default(false),
    paused: boolean().notNull().default(false),
    /** The most the server did to play it. */
    method: text().$type<PlaybackMethod>().notNull().default("direct"),
    audioConverted: boolean().notNull().default(false),
    /** ffmpeg's codec names of the video and of the audio track played. */
    videoCodec: text(),
    audioCodec: text(),
    /** The latest video encoder, like `libx264` or `h264_vaapi`. */
    videoEncoder: text(),
    hardwareEncoding: boolean().notNull().default(false),
    hardwareDecoding: boolean().notNull().default(false),
    toneMapper: text(),
    /** The latest audio encoder, like `libopus`. */
    audioEncoder: text(),
    /** The latest stream's quality. Null while only the file played. */
    quality: text().$type<PlaybackQuality>(),
    /** How long ffmpeg ran encoding for it. */
    encodeSeconds: doublePrecision().notNull().default(0),
    /** The browser and system, like `Firefox on Linux`. */
    client: text(),
    startedAt: createdAt(),
    /** The last report or stream. */
    updatedAt: createdAt(),
    endedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // The statistics only read these columns, so with them as trailing
    // keys Postgres answers from the index alone: by time for the server's
    // statistics, by person and time for profiles and the leaderboard.
    // Drizzle has no INCLUDE, which would do the same.
    index("playback_session_started_idx").on(
      t.startedAt,
      t.userId,
      t.watchedSeconds,
      t.completed,
      t.titleKind,
      t.titleId,
      t.mediaItemId,
    ),
    index("playback_session_user_idx").on(
      t.userId,
      t.startedAt,
      t.watchedSeconds,
      t.completed,
      t.titleKind,
      t.titleId,
      t.mediaItemId,
    ),
    // Deleting a file or title looks its sessions up by these.
    index("playback_session_item_idx").on(t.mediaItemId),
    index("playback_session_title_idx").on(t.titleId),
    index("playback_session_open_idx")
      .on(t.updatedAt)
      .where(sql`${t.endedAt} is null`),
  ],
)

export type WatchProgressRow = typeof watchProgress.$inferSelect
export type PlaybackSessionRow = typeof playbackSession.$inferSelect
