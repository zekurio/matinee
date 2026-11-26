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
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { createdAt } from "./columns"

/** How much of a play's time is known; see `playbackSession.precision`. */
export type PlayPrecision = "time" | "day" | "none"
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

/**
 * The tracks each user picked in each file's player, for the next time it
 * plays and for the closest match in the other files of its title. A kind
 * of track counts as picked once its time is set: an audio stream, or a
 * subtitle track, where no track means subtitles off.
 */
export const trackPick = pgTable(
  "track_pick",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaItemId: uuid()
      .notNull()
      .references(() => mediaItem.id, { onDelete: "cascade" }),
    /** The audio stream's index in the file. */
    audioStreamIndex: integer(),
    audioPickedAt: timestamp({ withTimezone: true }),
    /** A subtitle track's id, as `media.subtitles` lists them. */
    subtitleTrackId: text(),
    subtitlePickedAt: timestamp({ withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.mediaItemId] })],
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
 * A season of a show a user marked as a favorite. Files without a season
 * number aren't a season to mark. The season needn't have provider
 * metadata, so the row hangs off the show.
 */
export const favoriteSeason = pgTable(
  "favorite_season",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    titleId: uuid()
      .notNull()
      .references(() => title.id, { onDelete: "cascade" }),
    seasonNumber: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.titleId, t.seasonNumber] }),
    index("favorite_season_recent_idx").on(t.userId, t.createdAt),
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
    /**
     * How much of `startedAt` is known: `time` for a play, or a file marked
     * watched just now; `day` for one marked on a day the user picked or
     * its release date, whose hour means nothing; `none` for one whose
     * time the user doesn't remember, stored at the time it was marked.
     * Statistics over time leave out what they can't place: the hourly
     * heatmap needs `time`, charts, streaks, ranges, and recently watched
     * need a day. Totals over all time count every play.
     */
    precision: text().$type<PlayPrecision>().notNull().default("time"),
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
    /** What the client called itself, like `Chrome Android`; see `session.clientName`. */
    client: text(),
    /**
     * The sign-in that played it, which tells a reload from another device
     * with the same name. Null for plays from before it was kept. Not a
     * foreign key: a play outlives the sign-in, and nothing reads the
     * session through it.
     */
    authSessionId: uuid(),
    startedAt: createdAt(),
    /** The last report or stream. */
    updatedAt: createdAt(),
    endedAt: timestamp({ withTimezone: true }),
    /**
     * When the player's last `playback.presence` connection dropped. The
     * session stops counting as live a little after, unless a connection
     * opens again, which clears it. A report or a stream while none is
     * open moves it to then. Null for players that never open one, which
     * go by reports alone.
     */
    leftAt: timestamp({ withTimezone: true }),
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

/**
 * What a user had on a file that went, kept by what the file was rather
 * than where it was, as Jellyfin does. A file that comes later with a key
 * in common, like a Blu-ray in place of a WEB-DL, takes it back: the
 * progress, the favorite, and the plays. A movie's keys are its title's
 * match and the ids it has at other sites, like `tmdb:603` and
 * `imdb:tt0133093`; an episode's add its numbers, like `tvdb:81189/1x3`.
 * A file without a match has none, and nothing is kept for it. Rows
 * older than the `forget-detached-watch-state` task's window go.
 */
export const detachedWatchState = pgTable(
  "detached_watch_state",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    keys: text().array().notNull(),
    /** Null when the user had no progress, only a favorite or plays. */
    positionSeconds: doublePrecision(),
    completed: boolean().notNull().default(false),
    /** When the progress last changed, to pick between rows. */
    progressAt: timestamp({ withTimezone: true }),
    favorite: boolean().notNull().default(false),
    /** The file's plays, which point at no file until it comes back. */
    sessionIds: uuid()
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    detachedAt: createdAt(),
  },
  (t) => [
    index("detached_watch_state_keys_idx").using("gin", t.keys),
    index("detached_watch_state_detached_idx").on(t.detachedAt),
  ],
)

export type WatchProgressRow = typeof watchProgress.$inferSelect
export type PlaybackSessionRow = typeof playbackSession.$inferSelect
