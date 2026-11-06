import {
  OidcSettings,
  type OidcSettingsInput,
  type SecretSource,
} from "@matinee/contracts"
import { setting } from "@matinee/db"
import { eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "../db"
import { env } from "../env"
import { log } from "../log"

/*
 * The OIDC provider an admin set up in the app, over the MATINEE_OIDC_*
 * variables. The environment gives the defaults; a saved field wins, and an
 * empty field in the form falls back to the environment again. Settings load
 * once and change only through `saveOidc`, so reads are cheap.
 */

const OIDC_KEY = "oidc"
const SECRET_KEY = "oidc_client_secret"

const TEXT_FIELDS = [
  "displayName",
  "issuerUrl",
  "clientId",
  "scopes",
  "usernameClaim",
] as const

const SavedOidc = OidcSettings.partial()
const SavedSecret = z.object({ value: z.string().min(1) })

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
  saved = {
    oidc: oidc.success ? oidc.data : {},
    secret: secret.success ? secret.data.value : null,
  }
  return saved
}

function resolve(current: Saved): OidcState {
  const settings = { ...oidcDefaults(), ...current.oidc }
  const secret = current.secret ?? env.oidcClientSecret
  return {
    settings,
    secret,
    secretSource: current.secret
      ? "saved"
      : env.oidcClientSecret
        ? "environment"
        : null,
    version,
  }
}

/** Whether sign-in can use these settings. */
export function isActive(settings: OidcSettings): boolean {
  return settings.enabled && Boolean(settings.issuerUrl && settings.clientId)
}

export async function oidcState(): Promise<OidcState> {
  return resolve(await load())
}

/** The provider, or null while sign-in through it is off or incomplete. */
export async function activeOidc(): Promise<OidcState | null> {
  const state = await oidcState()
  return isActive(state.settings) ? state : null
}

/** Switches always save; a text field saves only when filled in. */
function nextSaved(current: Saved, input: OidcSettingsInput): Saved {
  const oidc: Partial<OidcSettings> = {
    enabled: input.enabled,
    allowSignUp: input.allowSignUp,
  }
  for (const key of TEXT_FIELDS) {
    if (input[key]) oidc[key] = input[key]
  }
  return {
    oidc,
    secret:
      input.clientSecret === undefined ? current.secret : input.clientSecret,
  }
}

/** The settings a save would produce, to check before writing them. */
export async function previewOidc(
  input: OidcSettingsInput,
): Promise<OidcState> {
  return resolve(nextSaved(await load(), input))
}

export async function saveOidc(input: OidcSettingsInput): Promise<OidcState> {
  const next = nextSaved(await load(), input)
  await db.transaction(async (tx) => {
    await tx
      .insert(setting)
      .values({ key: OIDC_KEY, value: next.oidc })
      .onConflictDoUpdate({
        target: setting.key,
        set: { value: next.oidc, updatedAt: new Date() },
      })
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
  saved = next
  version += 1
  return resolve(next)
}
