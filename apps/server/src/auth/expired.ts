import { authChallenge, deviceAuthorization } from "@matinee/db"
import { inArray, lt } from "drizzle-orm"

import { db } from "../db"

/*
 * Challenges and device codes that anyone can create, and that expire in
 * minutes. Each one created clears a few that expired, which keeps the
 * tables small between the sweeps the `clean-sessions` task makes, without
 * one request paying for a flood of them.
 */

type Expiring = typeof authChallenge | typeof deviceAuthorization

/** Expired rows one creation clears at most. */
const BATCH = 100

/** Delete up to a batch of expired rows from `table`. */
export async function deleteSomeExpired(table: Expiring): Promise<void> {
  const expired = db
    .select({ id: table.id })
    .from(table)
    .where(lt(table.expiresAt, new Date()))
    .limit(BATCH)
  await db.delete(table).where(inArray(table.id, expired))
}

/** Delete every expired challenge and device code. */
export async function deleteAllExpired(): Promise<void> {
  const now = new Date()
  await db.delete(authChallenge).where(lt(authChallenge.expiresAt, now))
  await db
    .delete(deviceAuthorization)
    .where(lt(deviceAuthorization.expiresAt, now))
}
