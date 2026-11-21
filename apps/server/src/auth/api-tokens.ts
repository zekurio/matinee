import { API_TOKEN_PREFIX, type ApiToken } from "@matinee/contracts"
import { apiToken, user } from "@matinee/db"
import { and, desc, eq } from "drizzle-orm"

import { arg, db } from "../db"
import { randomToken, sha256 } from "./tokens"

/*
 * API tokens: credentials an account makes for a service that calls the
 * API as it, unattended. Unlike a session, one never expires. Only the
 * SHA-256 is stored: the secret is 32 random bytes, so a slow hash would
 * add nothing a guess could beat. They come only in the Authorization
 * header, never from the cookie; see `readSession`.
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

/** The token and its account, or undefined when it was revoked or never was. */
export async function findApiToken(token: string) {
  const [row] = await tokenByHash.execute({ hash: sha256(token) })
  if (!row) return undefined
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
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  }
}

/** Make a token for the user. The secret is in the answer and nowhere else. */
export async function createApiToken(
  userId: string,
  name: string,
): Promise<{ token: string; apiToken: ApiToken }> {
  const token = `${API_TOKEN_PREFIX}${randomToken()}`
  const [row] = await db
    .insert(apiToken)
    .values({ tokenHash: sha256(token), userId, name })
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

/** Revoke one of the user's tokens. False when they have no such token. */
export async function revokeApiToken(
  userId: string,
  id: string,
): Promise<boolean> {
  const revoked = await db
    .delete(apiToken)
    .where(and(eq(apiToken.id, id), eq(apiToken.userId, userId)))
    .returning({ id: apiToken.id })
  return revoked.length > 0
}

/** Revoke every token the user made. Returns how many. */
export async function revokeUserApiTokens(userId: string): Promise<number> {
  const revoked = await db
    .delete(apiToken)
    .where(eq(apiToken.userId, userId))
    .returning({ id: apiToken.id })
  return revoked.length
}
