import { randomBytes } from "node:crypto"

import type { SetupMode } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { setting, user } from "@matinee/db"
import { eq } from "drizzle-orm"
import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { activeOidc } from "./oidc-settings"
import { passkeysEnabled } from "./passkey-settings"
import { safeEqual } from "./tokens"

const SETUP_COOKIE = "matinee_setup"
const SETUP_COOKIE_TTL_S = 60 * 60

/** Set once the admin finishes setup's steps. Seeded for older servers. */
const SETUP_KEY = "setup"
const SetupSetting = t.object({ complete: t.boolean() })

let hasUsers = false
let complete = false
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
 * How the admin account gets created. With single sign-on set up, only an
 * account the provider's role claim names an admin can, so no token
 * guards it. Null while passkeys are off too, when nothing can. Settings
 * can't change before an admin exists, so neither can the mode.
 */
export async function setupMode(): Promise<SetupMode | null> {
  if (await activeOidc()) return "oidc"
  return (await passkeysEnabled()) ? "passkey" : null
}

/** Whether the admin finished setting up transcoding and libraries. */
export async function setupComplete(): Promise<boolean> {
  if (complete) return true
  const [row] = await db
    .select({ value: setting.value })
    .from(setting)
    .where(eq(setting.key, SETUP_KEY))
  complete = SetupSetting.safeParse(row?.value).data?.complete ?? false
  return complete
}

export async function markSetupComplete(): Promise<void> {
  const value = { complete: true }
  await db
    .insert(setting)
    .values({ key: SETUP_KEY, value })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value, updatedAt: new Date() },
    })
  complete = true
}

/**
 * Pick the token that guards creating the admin with a passkey. Whoever
 * reaches a fresh server first would otherwise claim the admin account. A
 * loopback PUBLIC_URL skips the token unless one is configured.
 */
export async function initSetupToken(): Promise<void> {
  if (!(await setupRequired())) return
  const provider = await activeOidc()
  if (provider) {
    if (env.MATINEE_SETUP_TOKEN) {
      log.warn(
        "MATINEE_SETUP_TOKEN is set, but with single sign-on set up only an admin at the provider can create the admin account. The token is unused.",
      )
    }
    const { displayName, roleClaim } = provider.settings
    log.info(
      `No account exists yet. Open ${env.PUBLIC_URL}/setup and sign in with ${displayName}, as an account whose ${roleClaim} claim is admin.`,
    )
    return
  }
  if (!(await passkeysEnabled())) {
    log.warn(
      "No account exists yet, but passkeys are off and single sign-on isn't set up, so nothing can create the admin account. Set MATINEE_PASSKEYS_ENABLED=true or the MATINEE_OIDC_* variables, and restart.",
    )
    return
  }
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
