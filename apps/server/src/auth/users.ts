import { Username, type UserRole } from "@matinee/contracts"
import { oidcAccount, passkey, user, type UserRow } from "@matinee/db"
import { and, eq, inArray, ne, sql } from "drizzle-orm"

import { db } from "../db"
import { activeOidc } from "./oidc-settings"

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

/** A provider's claim with what a username can't hold dropped. */
function cleanUsername(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "")
    .replace(/^[._-]+/, "")
    .slice(0, 28)
}

/** Turn a provider's claim into a free username, adding a number if needed. */
export async function availableUsername(raw: string, tx: Tx): Promise<string> {
  const cleaned = cleanUsername(raw) || "user"
  const base = Username.safeParse(cleaned).success ? cleaned : `user${cleaned}`
  for (let n = 0; n < 100; n++) {
    const candidate = n === 0 ? base : `${base}${n + 1}`
    if (!(await usernameTaken(candidate, tx))) return candidate
  }
  throw new Error("Could not find a free username.")
}

/**
 * The account whose username matches a provider's username claim, as given
 * or as `availableUsername` would clean it. OIDC sign-in asks that account's
 * owner to sign in and link, instead of making a numbered duplicate.
 */
export async function findUserByUsernameHint(
  hint: string | null,
): Promise<string | null> {
  const exact = hint?.trim().toLowerCase()
  if (!hint || !exact) return null
  const candidates = new Set([exact])
  const cleaned = cleanUsername(hint)
  if (Username.safeParse(cleaned).success) {
    candidates.add(cleaned.toLowerCase())
  }
  const rows = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(inArray(sql`lower(${user.username})`, [...candidates]))
    .limit(candidates.size)
  // `a.b` and `ab` can both be taken. The exact name wins, so every attempt
  // points at the same account.
  const row =
    rows.find((candidate) => candidate.username.toLowerCase() === exact) ??
    rows[0]
  return row?.id ?? null
}

export async function insertUser(
  tx: Tx,
  values: {
    id?: string
    username: string
    role: UserRole
    displayName?: string | null
  },
): Promise<UserRow> {
  const [row] = await tx.insert(user).values(values).returning()
  if (!row) throw new Error("Could not create the account.")
  return row
}

/**
 * Serialize changes to who has an account and who is an admin: setup, sign-up,
 * and the admin's user management. Two setup attempts can't both create an
 * admin, and two admins can't demote each other at once. Returns whether the
 * table was empty when the lock was taken.
 */
export async function lockUsers(tx: Tx): Promise<{ empty: boolean }> {
  await tx.execute(sql`lock table ${user} in share row exclusive mode`)
  const rows = await tx.select({ id: user.id }).from(user).limit(1)
  return { empty: rows.length === 0 }
}

/**
 * Whether an admin other than `userId` can sign in: one with a passkey, or an
 * account linked at the provider single sign-on uses now. Call it under
 * `lockUsers` before demoting or deleting an admin, so Matinee always keeps
 * one.
 */
export async function otherAdminCanSignIn(
  tx: Tx,
  userId: string,
): Promise<boolean> {
  const others = and(eq(user.role, "admin"), ne(user.id, userId))
  const [withPasskey] = await tx
    .select({ id: user.id })
    .from(user)
    .innerJoin(passkey, eq(passkey.userId, user.id))
    .where(others)
    .limit(1)
  if (withPasskey) return true
  const provider = await activeOidc()
  if (!provider) return false
  // Accounts store the ID token's `iss`, which can differ from the issuer
  // URL by a trailing slash.
  const issuer = provider.settings.issuerUrl.replace(/\/+$/, "")
  const [withAccount] = await tx
    .select({ id: user.id })
    .from(user)
    .innerJoin(oidcAccount, eq(oidcAccount.userId, user.id))
    .where(and(others, sql`rtrim(${oidcAccount.issuer}, '/') = ${issuer}`))
    .limit(1)
  return withAccount !== undefined
}
