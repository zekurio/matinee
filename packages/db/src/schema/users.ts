import type {
  AccessOverride,
  AccessSource,
  AvatarSource,
  PlaybackPreferences,
  UserRole,
} from "@matinee/contracts"
import { sql } from "drizzle-orm"
import {
  boolean,
  jsonb,
  pgTable,
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
    /** The synced audio and subtitle choices; readers parse it. Null before the first change. */
    playbackPreferences: jsonb().$type<PlaybackPreferences>(),
    /**
     * What's set on the account over its access groups; readers parse it.
     * Null follows the groups.
     */
    accessOverride: jsonb().$type<AccessOverride>(),
    /** `provider` when the OIDC policy claim set `accessOverride`. */
    accessOverrideSource: text()
      .$type<AccessSource>()
      .notNull()
      .default("manual"),
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

export type UserRow = typeof user.$inferSelect
