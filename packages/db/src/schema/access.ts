import type { AccessSource, RequestLimit } from "@matinee/contracts"
import { sql } from "drizzle-orm"
import {
  jsonb,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { invite } from "./auth"
import { createdAt } from "./columns"
import { library } from "./library"
import { user } from "./users"

/**
 * What its members may open and how the server streams to them; see
 * `access.ts` in the contracts. An account gets the most generous of its
 * groups.
 */
export const accessGroup = pgTable(
  "access_group",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    /**
     * The group every account is in, without a membership row. The
     * migration that adds groups makes the one row that has it.
     */
    everyone: boolean().notNull().default(false),
    /** The OIDC provider's group whose members are in this one. */
    providerGroup: text(),
    /** Every library, also ones added later. Else `accessGroupLibrary`. */
    allLibraries: boolean().notNull().default(false),
    /** Bits per second. Null for no limit. */
    maxBitrate: integer(),
    transcode: boolean().notNull().default(true),
    downloads: boolean().notNull().default(true),
    /** Whether members may ask for titles, and whether an ask needs approval. */
    requests: text().$type<"off" | "ask" | "add">().notNull().default("off"),
    /** Titles per days. Null for no limit. Readers parse the JSON. */
    requestLimit: jsonb().$type<RequestLimit>(),
    /** Null for no limit. */
    maxStreams: integer(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("access_group_name_lower").on(sql`lower(${t.name})`),
    uniqueIndex("access_group_everyone")
      .on(t.everyone)
      .where(sql`${t.everyone}`),
  ],
)

export const accessGroupLibrary = pgTable(
  "access_group_library",
  {
    groupId: uuid()
      .notNull()
      .references(() => accessGroup.id, { onDelete: "cascade" }),
    libraryId: uuid()
      .notNull()
      .references(() => library.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.libraryId] })],
)

/**
 * An account in a group. One an admin and the provider both put there has
 * a row for each, so a sync of the provider's groups leaves the admin's
 * choice alone.
 */
export const accessGroupMember = pgTable(
  "access_group_member",
  {
    groupId: uuid()
      .notNull()
      .references(() => accessGroup.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: text().$type<AccessSource>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId, t.source] }),
    index("access_group_member_user_idx").on(t.userId),
  ],
)

/** The groups an invite's account starts in. */
export const inviteGroup = pgTable(
  "invite_group",
  {
    inviteId: uuid()
      .notNull()
      .references(() => invite.id, { onDelete: "cascade" }),
    groupId: uuid()
      .notNull()
      .references(() => accessGroup.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.inviteId, t.groupId] })],
)

export type AccessGroupRow = typeof accessGroup.$inferSelect
