import type { User } from "@matinee/contracts"
import { session, user, type UserRow } from "@matinee/db"
import { and, eq, gt, lt } from "drizzle-orm"
import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

import { db } from "../db"
import { env } from "../env"
import { randomToken, sha256 } from "./tokens"

export const SESSION_COOKIE = "matinee_session"
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Moving the idle deadline costs a write, so do it at most this often.
const SESSION_TOUCH_MS = 60 * 60 * 1000

export type SessionUser = UserRow & { sessionId: string }

export function publicUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
  }
}

function requestToken(c: Context): string | undefined {
  const header = c.req.header("authorization")
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length)
  return getCookie(c, SESSION_COOKIE)
}

/** The signed-in user, or null. Cached on the request. */
export async function readSession(c: Context): Promise<SessionUser | null> {
  const cached = c.get("sessionUser")
  if (cached !== undefined) return cached
  const token = requestToken(c)
  let result: SessionUser | null = null
  if (token) {
    const now = new Date()
    const [row] = await db
      .select({ session, user })
      .from(session)
      .innerJoin(user, eq(user.id, session.userId))
      .where(
        and(eq(session.tokenHash, sha256(token)), gt(session.expiresAt, now)),
      )
      .limit(1)
    if (row) {
      result = { ...row.user, sessionId: row.session.id }
      if (now.getTime() - row.session.lastSeenAt.getTime() > SESSION_TOUCH_MS) {
        await db
          .update(session)
          .set({
            lastSeenAt: now,
            expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
          })
          .where(eq(session.id, row.session.id))
      }
    }
  }
  c.set("sessionUser", result)
  return result
}

/** Start a session for the user and hand the browser its cookie. */
export async function signIn(c: Context, userId: string): Promise<string> {
  const token = randomToken()
  await db.insert(session).values({
    tokenHash: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    userAgent: c.req.header("user-agent")?.slice(0, 512) ?? null,
  })
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  })
  c.set("sessionUser", undefined)
  return token
}

export async function signOut(c: Context): Promise<void> {
  const current = await readSession(c)
  if (current) await db.delete(session).where(eq(session.id, current.sessionId))
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: env.secureCookies })
  c.set("sessionUser", null)
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(session).where(lt(session.expiresAt, new Date()))
}

declare module "hono" {
  interface ContextVariableMap {
    sessionUser: SessionUser | null | undefined
  }
}
