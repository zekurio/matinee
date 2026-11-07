import type {
  AvatarSource,
  PlaybackPreferences,
  SyncedThemePreferences,
  UserRole,
  UserThemeVariant,
} from "@matinee/contracts"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { createdAt } from "./columns"

export const user = pgTable(
  "user",
  {
    id: uuid().primaryKey().defaultRandom(),
    username: text().notNull(),
    displayName: text(),
    role: text().$type<UserRole>().notNull().default("user"),
    /** The synced theme choice; readers parse it. Null before the first pick. */
    themePreferences: jsonb().$type<SyncedThemePreferences>(),
    /** The synced audio and subtitle choices; readers parse it. Null before the first change. */
    playbackPreferences: jsonb().$type<PlaybackPreferences>(),
    /** Names the file in `$MATINEE_DATA_DIR/avatars`. Null shows the initial. */
    avatarId: text(),
    avatarSource: text().$type<AvatarSource>().notNull().default("provider"),
    /** The provider picture URL the current avatar came from. */
    avatarUrl: text(),
    /** Others see the user's favorites on their profile. */
    shareFavorites: boolean().notNull().default(false),
    /** Others see the user's watch statistics on their profile. */
    shareStats: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [uniqueIndex("user_username_lower").on(sql`lower(${t.username})`)],
)

/**
 * A user's own color themes. The client makes the ids, so they're only unique
 * per user; the theme choice in `user.theme_preferences` refers to them as
 * `<theme id>:<variant id>`.
 */
export const userTheme = pgTable(
  "user_theme",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    id: text().notNull(),
    name: text().notNull(),
    /** Readers parse this with the contract's schema. */
    variants: jsonb().$type<UserThemeVariant[]>().notNull(),
    guided: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    check(
      "user_theme_variants_check",
      sql`jsonb_typeof(${t.variants}) = 'array' and jsonb_array_length(${t.variants}) > 0`,
    ),
  ],
)

export type UserRow = typeof user.$inferSelect
export type UserThemeRow = typeof userTheme.$inferSelect
