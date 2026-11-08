import { isDeepStrictEqual } from "node:util"

import {
  OidcSettings,
  type OidcSettingsInput,
  type SecretSource,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { setting } from "@matinee/db"
import { eq, inArray } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { logOverridden, overridesOf, variableSet } from "../overrides"

/*
 * The OIDC provider an admin set up in the app, over the MATINEE_OIDC_*
 * variables. The environment gives the defaults. Only fields that differ
 * from them are saved, and an empty field in the form falls back to the
 * environment again. Settings load once and change only through `saveOidc`,
 * so reads are cheap.
 */

const OIDC_KEY = "oidc"
const SECRET_KEY = "oidc_client_secret"

const TEXT_FIELDS = [
  "displayName",
  "issuerUrl",
  "clientId",
  "scopes",
  "usernameClaim",
  "roleClaim",
] as const

/** The fields a MATINEE_OIDC_* variable gives a default for. */
const VARIABLES = new Map<keyof OidcSettings, string>([
  ["displayName", "MATINEE_OIDC_DISPLAY_NAME"],
  ["issuerUrl", "MATINEE_OIDC_ISSUER_URL"],
  ["clientId", "MATINEE_OIDC_CLIENT_ID"],
  ["scopes", "MATINEE_OIDC_SCOPES"],
  ["usernameClaim", "MATINEE_OIDC_USERNAME_CLAIM"],
  ["roleClaim", "MATINEE_OIDC_ROLE_CLAIM"],
  ["allowSignUp", "MATINEE_OIDC_ALLOW_SIGN_UP"],
])

const SavedOidc = OidcSettings.partial()
const SavedSecret = t.object({ value: t.string().min(1) })

type Saved = { oidc: Partial<OidcSettings>; secret: string | null }

export type OidcState = {
  settings: OidcSettings
  /** The client secret in use; undefined for a public client. */
  secret: string | undefined
  secretSource: SecretSource
  /** Changes on every save, so anything built from older settings can tell. */
  version: number
}

let saved: Saved | null = null
let loading: Promise<Saved> | null = null
let version = 0

/** What the environment sets, and what an empty field in the form means. */
export function oidcDefaults(): OidcSettings {
  return {
    enabled: Boolean(env.MATINEE_OIDC_ISSUER_URL && env.MATINEE_OIDC_CLIENT_ID),
    displayName: env.MATINEE_OIDC_DISPLAY_NAME,
    issuerUrl: env.MATINEE_OIDC_ISSUER_URL ?? "",
    clientId: env.MATINEE_OIDC_CLIENT_ID ?? "",
    scopes: env.MATINEE_OIDC_SCOPES,
    usernameClaim: env.MATINEE_OIDC_USERNAME_CLAIM,
    roleClaim: env.MATINEE_OIDC_ROLE_CLAIM,
    allowSignUp: env.MATINEE_OIDC_ALLOW_SIGN_UP,
  }
}

async function load(): Promise<Saved> {
  if (saved) return saved
  loading ??= readSaved().finally(() => {
    loading = null
  })
  return loading
}

async function readSaved(): Promise<Saved> {
  const rows = await db
    .select()
    .from(setting)
    .where(inArray(setting.key, [OIDC_KEY, SECRET_KEY]))
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  const oidc = SavedOidc.safeParse(byKey.get(OIDC_KEY) ?? {})
  if (!oidc.success) {
    log.warn("Ignoring saved OIDC settings that no longer validate", oidc.error)
  }
  const secret = SavedSecret.safeParse(byKey.get(SECRET_KEY))
  const stored: Saved = {
    oidc: oidc.success ? oidc.data : {},
    secret: secret.success ? secret.data.value : null,
  }
  // Older servers saved both switches every time, and a default may have
  // changed to a saved value since. Neither is an override.
  const next = trimmed(stored)
  if (!isDeepStrictEqual(next, stored)) await write(next)
  logOverridden(next.oidc, VARIABLES)
  if (next.secret && variableSet("MATINEE_OIDC_CLIENT_SECRET")) {
    log.info(
      "MATINEE_OIDC_CLIENT_SECRET is set, but a secret saved in the admin settings overrides it.",
    )
  }
  saved = next
  return saved
}

/** Only what differs from the environment. */
function trimmed(next: Saved): Saved {
  return {
    oidc: overridesOf(next.oidc, oidcDefaults()),
    secret: next.secret === env.MATINEE_OIDC_CLIENT_SECRET ? null : next.secret,
  }
}

function resolve(current: Saved): OidcState {
  const settings = { ...oidcDefaults(), ...current.oidc }
  const secret = current.secret ?? env.MATINEE_OIDC_CLIENT_SECRET
  return {
    settings,
    secret,
    secretSource: current.secret
      ? "saved"
      : env.MATINEE_OIDC_CLIENT_SECRET
        ? "environment"
        : null,
    version,
  }
}

/** Whether sign-in can use these settings. */
export function isActive(settings: OidcSettings): boolean {
  return settings.enabled && Boolean(settings.issuerUrl && settings.clientId)
}

/**
 * Whether two issuers are the same provider. An ID token's `iss` can differ
 * from the configured issuer URL by a trailing slash.
 */
export function sameIssuer(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "")
}

export async function oidcState(): Promise<OidcState> {
  return resolve(await load())
}

/** The provider, or null while sign-in through it is off or incomplete. */
export async function activeOidc(): Promise<OidcState | null> {
  const state = await oidcState()
  return isActive(state.settings) ? state : null
}

/**
 * What differs from the environment saves. An empty text field drops the
 * saved value, so the environment's applies.
 */
function nextSaved(current: Saved, input: OidcSettingsInput): Saved {
  const oidc: Partial<OidcSettings> = {
    enabled: input.enabled,
    allowSignUp: input.allowSignUp,
  }
  for (const key of TEXT_FIELDS) {
    if (input[key]) oidc[key] = input[key]
  }
  return trimmed({
    oidc,
    secret:
      input.clientSecret === undefined ? current.secret : input.clientSecret,
  })
}

/** The settings a save would produce, to check before writing them. */
export async function previewOidc(
  input: OidcSettingsInput,
): Promise<OidcState> {
  return resolve(nextSaved(await load(), input))
}

/** Store the overrides; a part with none has no row. */
async function write(next: Saved): Promise<void> {
  await db.transaction(async (tx) => {
    if (Object.keys(next.oidc).length > 0) {
      await tx
        .insert(setting)
        .values({ key: OIDC_KEY, value: next.oidc })
        .onConflictDoUpdate({
          target: setting.key,
          set: { value: next.oidc, updatedAt: new Date() },
        })
    } else {
      await tx.delete(setting).where(eq(setting.key, OIDC_KEY))
    }
    if (next.secret) {
      const value = { value: next.secret }
      await tx
        .insert(setting)
        .values({ key: SECRET_KEY, value })
        .onConflictDoUpdate({
          target: setting.key,
          set: { value, updatedAt: new Date() },
        })
    } else {
      await tx.delete(setting).where(eq(setting.key, SECRET_KEY))
    }
  })
}

export async function saveOidc(input: OidcSettingsInput): Promise<OidcState> {
  const next = nextSaved(await load(), input)
  await write(next)
  saved = next
  version += 1
  return resolve(next)
}
