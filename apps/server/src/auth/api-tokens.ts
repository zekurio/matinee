import {
  API_TOKEN_PREFIX,
  type ApiToken,
  type Permission,
  PERMISSIONS,
} from "@matinee/contracts"
import { apiToken, user } from "@matinee/db"
import { and, desc, eq } from "drizzle-orm"

import { arg, db } from "../db"
import { randomToken, sha256 } from "./tokens"
import type { Tx } from "./users"

/*
 * API tokens: credentials an account makes for a service that calls the
 * API as it, unattended. Unlike a session, one never expires, and it does
 * only what its permissions cover, of what its account may do: `authed`
 * in rpc/base.ts, `can` in access/viewer.ts, and `readSession` hold it to
 * them. Only the SHA-256 is stored: the secret is 32 random
 * bytes, so a slow hash would add nothing a guess could beat. They come
 * only in the Authorization header, never from the cookie; see
 * `readCaller`.
 */

// 32 random bytes in base64url, as `randomToken` writes them.
const SECRET_LENGTH = 43
const TOKEN_LENGTH = API_TOKEN_PREFIX.length + SECRET_LENGTH

// Moving the last use costs a write, so do it at most this often.
const TOKEN_TOUCH_MS = 60 * 1000

/**
 * Whether a bearer token is an API token's. A session token is exactly 43
 * characters, so this one's length never belongs to a session.
 */
export function isApiToken(token: string): boolean {
  return token.length === TOKEN_LENGTH && token.startsWith(API_TOKEN_PREFIX)
}

// Every request with one asks it, so it's prepared once.
const tokenByHash = db
  .select({ apiToken, user })
  .from(apiToken)
  .innerJoin(user, eq(user.id, apiToken.userId))
  .where(eq(apiToken.tokenHash, arg("hash")))
  .limit(1)
  .prepare("api_token_by_hash")

/** The permissions this server knows, each once, in the contract's order. */
function known(permissions: readonly string[]): Permission[] {
  return PERMISSIONS.filter((permission) => permissions.includes(permission))
}

/** The token and its account, or undefined when it was revoked or never was. */
export async function findApiToken(token: string) {
  const [found] = await tokenByHash.execute({ hash: sha256(token) })
  if (!found) return undefined
  const row = {
    user: found.user,
    apiToken: {
      ...found.apiToken,
      permissions: known(found.apiToken.permissions),
    },
  }
  const now = new Date()
  const last = row.apiToken.lastUsedAt
  if (!last || now.getTime() - last.getTime() > TOKEN_TOUCH_MS) {
    await db
      .update(apiToken)
      .set({ lastUsedAt: now })
      .where(eq(apiToken.id, row.apiToken.id))
  }
  return row
}

function publicApiToken(row: typeof apiToken.$inferSelect): ApiToken {
  return {
    id: row.id,
    name: row.name,
    permissions: known(row.permissions),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  }
}

function newSecret(): string {
  return `${API_TOKEN_PREFIX}${randomToken()}`
}

const ownedBy = (userId: string, id: string) =>
  and(eq(apiToken.id, id), eq(apiToken.userId, userId))

/** Make a token for the user. The secret is in the answer and nowhere else. */
export async function createApiToken(
  userId: string,
  name: string,
  permissions: readonly Permission[],
): Promise<{ token: string; apiToken: ApiToken }> {
  const token = newSecret()
  const [row] = await db
    .insert(apiToken)
    .values({
      tokenHash: sha256(token),
      userId,
      name,
      permissions: known(permissions),
    })
    .returning()
  if (!row) throw new Error("Could not store the API token.")
  return { token, apiToken: publicApiToken(row) }
}

/** The user's tokens, newest first. */
export async function listApiTokens(userId: string): Promise<ApiToken[]> {
  const rows = await db
    .select()
    .from(apiToken)
    .where(eq(apiToken.userId, userId))
    .orderBy(desc(apiToken.createdAt))
  return rows.map(publicApiToken)
}

/** One of the user's tokens, or null when they have no such token. */
export async function getApiToken(
  userId: string,
  id: string,
): Promise<ApiToken | null> {
  const [row] = await db.select().from(apiToken).where(ownedBy(userId, id))
  return row ? publicApiToken(row) : null
}

/**
 * Rename one of the user's tokens or change what it may do. Null when
 * they have no such token.
 */
export async function updateApiToken(
  userId: string,
  id: string,
  change: { name?: string; permissions?: readonly Permission[] },
): Promise<ApiToken | null> {
  // An update that sets nothing is an error to Drizzle.
  if (change.name === undefined && change.permissions === undefined) {
    return getApiToken(userId, id)
  }
  const [row] = await db
    .update(apiToken)
    // Drizzle leaves out keys that are undefined.
    .set({
      name: change.name,
      permissions: change.permissions && known(change.permissions),
    })
    .where(ownedBy(userId, id))
    .returning()
  return row ? publicApiToken(row) : null
}

/**
 * Give one of the user's tokens a new secret. The old one stops working
 * at once. `allow` sees what the token holds with its row locked and
 * throws to refuse, so the secret never goes out for a token that was
 * given more in the meantime. Null when they have no such token.
 */
export async function rotateApiToken(
  userId: string,
  id: string,
  allow: (permissions: Permission[]) => void,
): Promise<{ token: string; apiToken: ApiToken } | null> {
  const token = newSecret()
  const row = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ permissions: apiToken.permissions })
      .from(apiToken)
      .where(ownedBy(userId, id))
      .for("update")
    if (!current) return undefined
    allow(known(current.permissions))
    const [rotated] = await tx
      .update(apiToken)
      .set({ tokenHash: sha256(token) })
      .where(ownedBy(userId, id))
      .returning()
    return rotated
  })
  return row ? { token, apiToken: publicApiToken(row) } : null
}

/** Revoke one of the user's tokens. False when they have no such token. */
export async function revokeApiToken(
  userId: string,
  id: string,
): Promise<boolean> {
  const revoked = await db
    .delete(apiToken)
    .where(ownedBy(userId, id))
    .returning({ id: apiToken.id })
  return revoked.length > 0
}

/** Revoke every token the user made. Returns how many. */
export async function revokeUserApiTokens(
  userId: string,
  tx: Tx | typeof db = db,
): Promise<number> {
  const revoked = await tx
    .delete(apiToken)
    .where(eq(apiToken.userId, userId))
    .returning({ id: apiToken.id })
  return revoked.length
}
