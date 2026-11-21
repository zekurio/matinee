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
import { findApiToken, isApiToken } from "./api-tokens"
import { randomToken, sha256 } from "./tokens"
import type { Tx } from "./users"

export const SESSION_COOKIE = "matinee_session"
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Moving the idle deadline costs a write, so do it at most this often.
const SESSION_TOUCH_MS = 60 * 60 * 1000

/**
 * What a request signed in with: a session from a sign-in, or an API token
 * the account made. Both carry the row's id.
 */
export type Credential = { kind: "session" | "apiToken"; id: string }

export type SessionUser = UserRow & {
  credential: Credential
  /**
   * What the session's client called itself, through
   * `account.sessions.identify`. Playback sessions take it from here, so
   * a stream request, which a media element can't add a header to, names
   * its client too. An API token's is its name.
   */
  clientName: string | null
}

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

/**
 * The token a request carries, and where from. The header wins, so a
 * request that sends one never signs in with the cookie too.
 */
function requestToken(
  c: Context,
): { token: string; from: "header" | "cookie" } | undefined {
  const header = c.req.header("authorization")
  if (header?.startsWith("Bearer ")) {
    return { token: header.slice("Bearer ".length), from: "header" }
  }
  const cookie = getCookie(c, SESSION_COOKIE)
  return cookie ? { token: cookie, from: "cookie" } : undefined
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

/**
 * The signed-in user, or null. Cached on the request. An API token counts
 * only from the Authorization header: a browser sends the cookie on
 * requests other sites start, and the CSRF reasoning in app.ts rests on
 * a bearer token never coming that way.
 */
export async function readSession(c: Context): Promise<SessionUser | null> {
  const cached = c.get("sessionUser")
  if (cached !== undefined) return cached
  const sent = requestToken(c)
  let result: SessionUser | null = null
  if (sent && isApiToken(sent.token)) {
    const row =
      sent.from === "header" ? await findApiToken(sent.token) : undefined
    if (row) {
      result = {
        ...row.user,
        credential: { kind: "apiToken", id: row.apiToken.id },
        clientName: row.apiToken.name,
      }
    }
  } else if (sent) {
    const { token } = sent
    const now = new Date()
    const [row] = await sessionByToken.execute({
      hash: sha256(token),
      now,
    })
    if (row) {
      result = {
        ...row.user,
        credential: { kind: "session", id: row.session.id },
        clientName: row.session.clientName,
      }
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
  userId: string,
  device?: AppDevice,
): Promise<string> {
  const token = randomToken()
  await db.insert(session).values({
    tokenHash: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
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
  const token = await createSession(userId)
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

/**
 * End the request's session and drop the cookie. A request made with an
 * API token has no session to end, and signing out doesn't revoke the
 * token: only a session can.
 */
export async function signOut(c: Context): Promise<void> {
  const current = await readSession(c)
  if (current?.credential.kind === "session") {
    await db.delete(session).where(eq(session.id, current.credential.id))
  }
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
    browser: row.client === "web" ? row.clientName : null,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
  }))
}

/**
 * Keep what the current session's client calls itself, as
 * `cleanDeviceName` leaves it. Only the session's own token can name it,
 * and it is only ever shown.
 */
export async function identifySession(
  current: SessionUser,
  name: string,
): Promise<void> {
  // An API token goes by the name its owner gave it.
  if (current.credential.kind !== "session") return
  if (name === current.clientName) return
  await db
    .update(session)
    .set({ clientName: name })
    .where(eq(session.id, current.credential.id))
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
