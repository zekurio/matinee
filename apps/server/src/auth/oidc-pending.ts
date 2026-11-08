import { OIDC_LINK_QUERY_KEY, UserRole } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import type { ChallengePayload } from "@matinee/db"
import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

import { env } from "../env"
import { consumeChallenge, createChallenge, findChallenge } from "./challenges"
import type { OidcIdentity } from "./oidc-accounts"

/*
 * An OIDC sign-in whose username claim named an existing account. The
 * callback keeps the identity it verified, so the person can sign in to
 * that account and link it, or create a new account, without asking the
 * provider again. The HttpOnly cookie holding its id ties it to the browser
 * that went through the callback: whoever controls a matching claim at the
 * provider can't hand their identity to someone else's session.
 */

const COOKIE = "matinee_oidc_pending"
/** The RPC and REST routes that read it. */
const COOKIE_PATH = "/api"
const TTL_MS = 10 * 60 * 1000

const PendingPayload = t.object({
  issuer: t.string(),
  subject: t.string(),
  label: t.string().nullable(),
  name: t.string().nullable(),
  picture: t.string().nullable().optional(),
  role: UserRole.optional(),
  /** Where the sign-in started, already checked to be a local path. */
  redirect: t.string(),
})

export type PendingLink = {
  identity: OidcIdentity
  redirect: string
}

/** The login page that asks to sign in and link, returning to `redirect`. */
export function linkPagePath(redirect: string): string {
  const params = new URLSearchParams({ [OIDC_LINK_QUERY_KEY]: "1" })
  if (redirect !== "/") params.set("redirect", redirect)
  return `/login?${params}`
}

/** Keep the sign-in for this browser. */
export async function savePendingLink(
  c: Context,
  { identity, redirect }: PendingLink,
): Promise<void> {
  const id = await createChallenge({
    purpose: "oidc-pending-link",
    // The cookie's id is the secret; there is no ceremony to answer.
    challenge: "",
    payload: {
      issuer: identity.issuer,
      subject: identity.subject,
      label: identity.label,
      name: identity.name,
      ...(identity.picture !== undefined && { picture: identity.picture }),
      ...(identity.role && { role: identity.role }),
      redirect,
    },
    ttlMs: TTL_MS,
  })
  setCookie(c, COOKIE, id, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "Lax",
    path: COOKIE_PATH,
    maxAge: TTL_MS / 1000,
  })
}

function clearCookie(c: Context): void {
  deleteCookie(c, COOKIE, { path: COOKIE_PATH, secure: env.secureCookies })
}

function cookieId(c: Context): string | null {
  return t.uuid().safeParse(getCookie(c, COOKIE)).data ?? null
}

function fromPayload(payload: ChallengePayload): PendingLink | null {
  const parsed = PendingPayload.safeParse(payload)
  if (!parsed.success) return null
  const { redirect, picture, role, ...rest } = parsed.data
  return { identity: { ...rest, picture, role }, redirect }
}

/** The sign-in this browser holds, left in place. */
export async function readPendingLink(c: Context): Promise<PendingLink | null> {
  const id = cookieId(c)
  const row = id ? await findChallenge(id, "oidc-pending-link") : null
  const link = row ? fromPayload(row.payload) : null
  if (!link && getCookie(c, COOKIE)) clearCookie(c)
  return link
}

/** Use the sign-in up, so it links or signs up once. */
export async function takePendingLink(c: Context): Promise<PendingLink | null> {
  const id = cookieId(c)
  clearCookie(c)
  const row = id ? await consumeChallenge(id, "oidc-pending-link") : null
  return row ? fromPayload(row.payload) : null
}
