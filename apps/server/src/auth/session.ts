import {
  type AppDevice,
  PlaybackPreferences,
  type ProfileUser,
  type Session,
  type User,
} from "@matinee/contracts"
import { session, user, type UserRow } from "@matinee/db"
import { and, desc, eq, gt, lt, ne } from "drizzle-orm"
import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

import { arg, db } from "../db"
import { env } from "../env"
import { clientName } from "../stats/sessions"
import { randomToken, sha256 } from "./tokens"
import type { Tx } from "./users"

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
    avatarId: row.avatarId,
    avatarSource: row.avatarSource,
    playback:
      PlaybackPreferences.safeParse(row.playbackPreferences).data ?? null,
    library: { showSpecials: row.showSpecials },
    sharing: { favorites: row.shareFavorites, stats: row.shareStats },
  }
}

/** The user as others on the server see them. */
export function profileUser(row: UserRow): ProfileUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    avatarId: row.avatarId,
    createdAt: row.createdAt,
  }
}

function requestToken(c: Context): string | undefined {
  const header = c.req.header("authorization")
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length)
  return getCookie(c, SESSION_COOKIE)
}

// Every request asks it, so it's prepared once.
const sessionByToken = db
  .select({ session, user })
  .from(session)
  .innerJoin(user, eq(user.id, session.userId))
  .where(
    and(eq(session.tokenHash, arg("hash")), gt(session.expiresAt, arg("now"))),
  )
  .limit(1)
  .prepare("session_by_token")

/** The signed-in user, or null. Cached on the request. */
export async function readSession(c: Context): Promise<SessionUser | null> {
  const cached = c.get("sessionUser")
  if (cached !== undefined) return cached
  const token = requestToken(c)
  let result: SessionUser | null = null
  if (token) {
    const now = new Date()
    const [row] = await sessionByToken.execute({
      hash: sha256(token),
      now,
    })
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

/**
 * Start a session for the user and return its token. Without `device` it is
 * a browser's, which `signIn` hands the cookie; with one, an app's.
 */
export async function createSession(
  c: Context,
  userId: string,
  device?: AppDevice,
): Promise<string> {
  const token = randomToken()
  await db.insert(session).values({
    tokenHash: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    userAgent: c.req.header("user-agent")?.slice(0, 512) ?? null,
    client: device ? "app" : "web",
    deviceName: device ? cleanDeviceName(device.name) : null,
    platform: device?.platform ?? null,
  })
  return token
}

/**
 * The name as an app sent it, without control characters, or null for
 * none. Apps often send the system's device name, and an odd one must not
 * stop the sign-in.
 */
export function cleanDeviceName(name: string | undefined): string | null {
  const cleaned = name
    ?.replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
  return cleaned || null
}

/** Start a session for the user and hand the browser its cookie. */
export async function signIn(c: Context, userId: string): Promise<string> {
  const token = await createSession(c, userId)
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

/** The user's live sessions: `current` first, then the most recently used. */
export async function listSessions(
  userId: string,
  current: string,
): Promise<Session[]> {
  const rows = await db
    .select()
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
    .orderBy(desc(eq(session.id, current)), desc(session.lastSeenAt))
  return rows.map((row) => ({
    id: row.id,
    current: row.id === current,
    client: row.client,
    deviceName: row.deviceName,
    platform: row.platform,
    browser:
      row.client === "web" ? clientName(row.userAgent ?? undefined) : null,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
  }))
}

/** End one of the user's sessions. False when they have no such session. */
export async function deleteSession(
  userId: string,
  id: string,
): Promise<boolean> {
  const ended = await db
    .delete(session)
    .where(and(eq(session.id, id), eq(session.userId, userId)))
    .returning({ id: session.id })
  return ended.length > 0
}

/**
 * Sign the user out everywhere, except the session `keep` if given. Returns
 * how many sessions ended.
 */
export async function deleteUserSessions(
  userId: string,
  keep?: string,
  tx: Tx | typeof db = db,
): Promise<number> {
  const ended = await tx
    .delete(session)
    .where(
      and(eq(session.userId, userId), keep ? ne(session.id, keep) : undefined),
    )
    .returning({ id: session.id })
  return ended.length
}

declare module "hono" {
  interface ContextVariableMap {
    sessionUser: SessionUser | null | undefined
  }
}
