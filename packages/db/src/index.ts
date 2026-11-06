import { fileURLToPath } from "node:url"

import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"

import * as schema from "./schema"

export * from "./schema"

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 })
  const db = drizzle({ client: pool, schema, casing: "snake_case" })
  return { db, pool }
}

export type Db = ReturnType<typeof createDb>["db"]

const defaultMigrationsFolder = fileURLToPath(
  new URL("../drizzle", import.meta.url),
)

export async function migrateDb(
  db: Db,
  migrationsFolder = defaultMigrationsFolder,
): Promise<void> {
  await migrate(db, { migrationsFolder })
}
