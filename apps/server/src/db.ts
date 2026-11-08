import { createDb } from "@matinee/db"
import { type Placeholder, type SQL, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

import { env } from "./env"

export const { db, pool } = createDb(env.DATABASE_URL)

/**
 * `column = any($1)`, with the whole list as one array parameter, or a
 * placeholder for one in a prepared query. Drizzle builds each query from
 * its pieces on every call, and `inArray` adds a piece and a parameter per
 * value: for the hundred ids behind a row on Home, building the SQL cost
 * more CPU than running it.
 */
export function anyOf(
  column: PgColumn | SQL,
  values: readonly (string | number)[] | Placeholder,
  type: "uuid" | "text" | "int",
): SQL {
  const list = Array.isArray(values) ? sql.param(values) : values
  return sql`${column} = any(${list}::${sql.raw(type)}[])`
}

/** A named placeholder for a prepared query's parameter. */
export const arg = (name: string) => sql.placeholder(name)
