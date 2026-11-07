import type { MediaProbe } from "@matinee/contracts"
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { createdAt } from "./columns"
import { library, libraryFolder, title } from "./library"

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
    /**
     * When the file appeared on its disk: its birth time, or its ctime on a
     * file system that keeps none. Unlike the mtime, which a release or a
     * copy can carry over from years back, nothing sets it to the past.
     * Null until a scan reads it.
     */
    fileCreatedAt: timestamp({ withTimezone: true }),
    /** Learned from ffprobe or the player; null until then. */
    durationSeconds: doublePrecision(),
    /**
     * What ffprobe read. Null until probed, or when that failed. A change
     * to `MediaProbe` needs a migration that clears `probedAt` too, so
     * files are read again.
     */
    probe: jsonb().$type<MediaProbe>(),
    /**
     * When ffprobe last read the file, whether or not it could. Null means
     * it's due: the file is new, changed, or from before probing.
     */
    probedAt: timestamp({ withTimezone: true }),
    /** Why the last probe failed. */
    probeError: text(),
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
    index("media_item_unprobed_idx")
      .on(t.libraryId)
      .where(sql`${t.probedAt} is null`),
  ],
)

/**
 * A subtitle file next to a media item, found by the scan. The server reads
 * it by id; clients never send a path.
 */
export const subtitleFile = pgTable(
  "subtitle_file",
  {
    id: uuid().primaryKey().defaultRandom(),
    mediaItemId: uuid()
      .notNull()
      .references(() => mediaItem.id, { onDelete: "cascade" }),
    path: text().notNull(),
    /** The extension: srt, vtt, ass, ssa, or sup and idx for pictures. */
    format: text().notNull(),
    /** BCP 47 tag from the file name, like `en` or `pt-BR`. */
    language: text(),
    /** Other words in the file name, like `Commentary`. */
    title: text(),
    forced: boolean().notNull().default(false),
    /** SDH, CC, or HI in the file name. */
    sdh: boolean().notNull().default(false),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("subtitle_file_item_path").on(t.mediaItemId, t.path)],
)

export type MediaItemRow = typeof mediaItem.$inferSelect
export type SubtitleFileRow = typeof subtitleFile.$inferSelect

/**
 * A file's trickplay images, the seek bar's thumbnails, from the last time
 * they were made. The tiles sit in `trickplay/<mediaItemId>/<key>` in the
 * data dir. A file whose size or time differs from the row's has changed,
 * and the images no longer fit it. Settings that differ from the row's
 * mean the images get made again, and show until then.
 */
export const trickplay = pgTable("trickplay", {
  mediaItemId: uuid()
    .primaryKey()
    .references(() => mediaItem.id, { onDelete: "cascade" }),
  /** Names the folder of tiles. New images get a new key. */
  key: text().notNull(),
  /** The file the images were made from. */
  sizeBytes: bigint({ mode: "number" }).notNull(),
  modifiedAt: timestamp({ withTimezone: true }).notNull(),
  /** One thumbnail's size in pixels. The width is the setting's. */
  width: integer().notNull(),
  height: integer().notNull(),
  /** Thumbnails across and down a tile. */
  columns: integer().notNull(),
  rows: integer().notNull(),
  /** Thumbnails in all. */
  count: integer().notNull(),
  intervalSeconds: doublePrecision().notNull(),
  keyframesOnly: boolean().notNull(),
  createdAt: createdAt(),
})

export type TrickplayRow = typeof trickplay.$inferSelect
