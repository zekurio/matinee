import { randomBytes } from "node:crypto"

import { user } from "@matinee/db"
import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { safeEqual } from "./tokens"

const SETUP_COOKIE = "matinee_setup"
const SETUP_COOKIE_TTL_S = 60 * 60

let hasUsers = false
let setupToken: string | null = null

/** True until the first account exists. */
export async function setupRequired(): Promise<boolean> {
  if (hasUsers) return false
  const [row] = await db.select({ id: user.id }).from(user).limit(1)
  hasUsers = row !== undefined
  return !hasUsers
}

export function markSetupDone(): void {
  hasUsers = true
  setupToken = null
}

/**
 * Pick the token that guards first-run setup. Whoever reaches a fresh server
 * first would otherwise claim the admin account. A loopback PUBLIC_URL skips
 * the token unless one is configured.
 */
export async function initSetupToken(): Promise<void> {
  if (!(await setupRequired())) return
  setupToken =
    env.MATINEE_SETUP_TOKEN ??
    (env.isLoopback ? null : randomBytes(24).toString("hex"))
  if (setupToken && !env.MATINEE_SETUP_TOKEN) {
    log.info(`No account exists yet. Setup token: ${setupToken}`)
  }
  log.info(`Open ${env.PUBLIC_URL}/setup to create the admin account.`)
}

export function setupTokenRequired(): boolean {
  return setupToken !== null
}

export function unlockSetup(c: Context, token: string): boolean {
  if (setupToken === null) return true
  if (!safeEqual(token, setupToken)) return false
  setCookie(c, SETUP_COOKIE, token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "Lax",
    path: "/api",
    maxAge: SETUP_COOKIE_TTL_S,
  })
  return true
}

export function hasSetupAccess(c: Context): boolean {
  if (setupToken === null) return true
  const cookie = getCookie(c, SETUP_COOKIE)
  return cookie !== undefined && safeEqual(cookie, setupToken)
}

export function endSetupAccess(c: Context): void {
  deleteCookie(c, SETUP_COOKIE, { path: "/api", secure: env.secureCookies })
}
