import type {
  PluginSource,
  PluginGrant,
  PluginManifest,
  PluginConfigValues,
} from "@matinee/contracts"
import {
  bigint,
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
import { user } from "./users"

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export const plugin = pgTable("plugin", {
  id: text().primaryKey(),
  source: jsonb().$type<PluginSource>().notNull(),
  manifest: jsonb().$type<PluginManifest>(),
  enabled: boolean().notNull().default(false),
  grant: jsonb().$type<PluginGrant>(),
  integrity: text(),
  config: jsonb().$type<PluginConfigValues>().notNull().default({}),
  secrets: jsonb().$type<Record<string, string>>().notNull().default({}),
  options: jsonb().$type<Record<string, Json>>().notNull().default({}),
  update: jsonb().$type<{ version: string; checkedAt: string }>(),
  installedAt: createdAt(),
  updatedAt: createdAt(),
})
export const pluginStorage = pgTable(
  "plugin_storage",
  {
    pluginId: text()
      .notNull()
      .references(() => plugin.id, { onDelete: "cascade" }),
    key: text().notNull(),
    value: jsonb().$type<Json>().notNull(),
    updatedAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.pluginId, table.key] })],
)
export const pluginIdentity = pgTable(
  "plugin_identity",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pluginId: text()
      .notNull()
      .references(() => plugin.id, { onDelete: "cascade" }),
    providerId: text().notNull(),
    subject: text().notNull(),
    label: text(),
    createdAt: createdAt(),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("plugin_identity_subject").on(
      table.pluginId,
      table.providerId,
      table.subject,
    ),
    uniqueIndex("plugin_identity_user_provider").on(
      table.userId,
      table.pluginId,
      table.providerId,
    ),
  ],
)
export const pluginEvent = pgTable(
  "plugin_event",
  {
    id: bigint({ mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
    pluginId: text()
      .notNull()
      .references(() => plugin.id, { onDelete: "cascade" }),
    name: text().notNull(),
    lane: text().notNull(),
    payload: jsonb().$type<Json>().notNull(),
    createdAt: createdAt(),
    attempts: integer().notNull().default(0),
    retryAt: timestamp({ withTimezone: true }),
    error: text(),
  },
  (table) => [
    index("plugin_event_plugin_id_idx").on(table.pluginId, table.id),
    index("plugin_event_lane_idx").on(table.pluginId, table.lane, table.id),
  ],
)
export type PluginEventRow = typeof pluginEvent.$inferSelect
export type PluginRow = typeof plugin.$inferSelect
export type PluginStorageRow = typeof pluginStorage.$inferSelect
export type PluginIdentityRow = typeof pluginIdentity.$inferSelect
