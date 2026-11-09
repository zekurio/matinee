import { isDeepStrictEqual } from "node:util"

import { PasskeySettings } from "@matinee/contracts"
import { setting } from "@matinee/db"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { logOverridden, overridesOf } from "../overrides"
import { activeOidc } from "./oidc-settings"

/*
 * Whether passkeys sign in, over MATINEE_PASSKEYS_ENABLED, as alloy's
 * passkey switch. Off, single sign-on is the only way in, and a passkey no
 * longer counts as a way to sign in when the server checks that someone
 * keeps one. Passkeys stay stored, so turning them back on restores them.
 * Settings load once and change only through `savePasskeys`.
 */

const KEY = "passkeys"

const VARIABLES = new Map<keyof PasskeySettings, string>([
  ["enabled", "MATINEE_PASSKEYS_ENABLED"],
])

const SavedPasskeys = PasskeySettings.partial()
type Saved = Partial<PasskeySettings>

let saved: Saved | null = null
let loading: Promise<Saved> | null = null

function passkeyDefaults(): PasskeySettings {
  return { enabled: env.MATINEE_PASSKEYS_ENABLED }
}

async function load(): Promise<Saved> {
  if (saved) return saved
  loading ??= readSaved().finally(() => {
    loading = null
  })
  return loading
}

async function readSaved(): Promise<Saved> {
  const [row] = await db.select().from(setting).where(eq(setting.key, KEY))
  const parsed = SavedPasskeys.safeParse(row?.value ?? {})
  if (!parsed.success) {
    log.warn(
      "Ignoring saved passkey settings that no longer validate",
      parsed.error,
    )
  }
  const stored = parsed.success ? parsed.data : {}
  // The variable may have changed to the saved value since, which makes it
  // no override.
  const next = overridesOf(stored, passkeyDefaults())
  if (!isDeepStrictEqual(next, stored)) await write(next)
  logOverridden(next, VARIABLES)
  saved = next
  return saved
}

async function write(next: Saved): Promise<void> {
  if (Object.keys(next).length === 0) {
    await db.delete(setting).where(eq(setting.key, KEY))
    return
  }
  await db
    .insert(setting)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value: next, updatedAt: new Date() },
    })
}

/** The settings in use: saved values over the environment's. */
export async function passkeySettings(): Promise<PasskeySettings> {
  return { ...passkeyDefaults(), ...(await load()) }
}

export async function passkeysEnabled(): Promise<boolean> {
  return (await passkeySettings()).enabled
}

/** Store only what differs from the environment. */
export async function savePasskeys(
  input: PasskeySettings,
): Promise<PasskeySettings> {
  await load()
  const next = overridesOf(input, passkeyDefaults())
  await write(next)
  saved = next
  return { ...passkeyDefaults(), ...next }
}

/**
 * Say at start when nobody can sign in. Saving settings refuses to get
 * there, so the environment did: single sign-on came from variables that
 * changed, or passkeys are off by default.
 */
export async function warnWithoutSignIn(): Promise<void> {
  if ((await passkeysEnabled()) || (await activeOidc())) return
  const fix =
    (await load()).enabled === false
      ? "An admin turned passkeys off. Set up single sign-on again with the MATINEE_OIDC_* variables, or delete the passkeys row from the setting table, and restart."
      : "Set MATINEE_PASSKEYS_ENABLED=true or the MATINEE_OIDC_* variables, and restart."
  log.warn(
    `Passkeys are off and single sign-on isn't set up, so nobody can sign in. ${fix}`,
  )
}
