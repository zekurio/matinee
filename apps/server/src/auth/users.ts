import { Username, type UserRole } from "@matinee/contracts"
import { user, type UserRow } from "@matinee/db"
import { sql } from "drizzle-orm"

import { db } from "../db"

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function usernameTaken(
  username: string,
  tx: Tx | typeof db = db,
): Promise<boolean> {
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.username}) = lower(${username})`)
    .limit(1)
  return rows.length > 0
}

/** Turn a provider's claim into a free username, adding a number if needed. */
export async function availableUsername(raw: string, tx: Tx): Promise<string> {
  const cleaned =
    raw
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "")
      .replace(/^[._-]+/, "")
      .slice(0, 28) || "user"
  const base = Username.safeParse(cleaned).success ? cleaned : `user${cleaned}`
  for (let n = 0; n < 100; n++) {
    const candidate = n === 0 ? base : `${base}${n + 1}`
    if (!(await usernameTaken(candidate, tx))) return candidate
  }
  throw new Error("Could not find a free username.")
}

export async function insertUser(
  tx: Tx,
  values: { id?: string; username: string; role: UserRole },
): Promise<UserRow> {
  const [row] = await tx.insert(user).values(values).returning()
  if (!row) throw new Error("Could not create the account.")
  return row
}

/**
 * Serialize account creation so two setup attempts can't both create an
 * admin. Returns whether the table was empty when the lock was taken.
 */
export async function lockUsers(tx: Tx): Promise<{ empty: boolean }> {
  await tx.execute(sql`lock table ${user} in share row exclusive mode`)
  const rows = await tx.select({ id: user.id }).from(user).limit(1)
  return { empty: rows.length === 0 }
}
