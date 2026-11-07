import { jsonb, pgTable, text } from "drizzle-orm/pg-core"

import { createdAt } from "./columns"

/** A value JSON can hold. `undefined` members drop out when it's stored. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined }
export type JsonObject = { [key: string]: JsonValue | undefined }

/**
 * Settings an admin saved in the app, one row per group. A missing row or key
 * falls back to the environment.
 */
export const setting = pgTable("setting", {
  key: text().primaryKey(),
  /** Readers parse this with the schema of their setting. */
  value: jsonb().$type<JsonObject>().notNull(),
  updatedAt: createdAt(),
})
