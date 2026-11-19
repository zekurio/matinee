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
 *
 * A client secret belongs to one client at one provider, so it's bound to
 * the issuer and client ID it was given for and only goes out with them.
 * A saved secret remembers both; MATINEE_OIDC_CLIENT_SECRET belongs to
 * MATINEE_OIDC_ISSUER_URL and MATINEE_OIDC_CLIENT_ID. Pointing the
 * settings elsewhere leaves a secret out rather than sending it to the
 * wrong provider, and the admin form asks for the new one.
 */

const OIDC_KEY = "oidc"
const SECRET_KEY = "oidc_client_secret"

const TEXT_FIELDS = [
  "displayName",
  "issuerUrl",
  "clientId",
  "scopes",
  "usernameClaim",
  "nameClaim",
  "roleClaim",
  "groupsClaim",
  "policyClaim",
] as const

/** The fields a MATINEE_OIDC_* variable gives a default for. */
const VARIABLES = new Map<keyof OidcSettings, string>([
  ["displayName", "MATINEE_OIDC_DISPLAY_NAME"],
  ["issuerUrl", "MATINEE_OIDC_ISSUER_URL"],
  ["clientId", "MATINEE_OIDC_CLIENT_ID"],
  ["scopes", "MATINEE_OIDC_SCOPES"],
  ["usernameClaim", "MATINEE_OIDC_USERNAME_CLAIM"],
  ["nameClaim", "MATINEE_OIDC_NAME_CLAIM"],
  ["roleClaim", "MATINEE_OIDC_ROLE_CLAIM"],
  ["groupsClaim", "MATINEE_OIDC_GROUPS_CLAIM"],
  ["policyClaim", "MATINEE_OIDC_POLICY_CLAIM"],
  ["allowSignUp", "MATINEE_OIDC_ALLOW_SIGN_UP"],
  ["signOutRefused", "MATINEE_OIDC_SIGN_OUT_REFUSED"],
])

const SavedOidc = OidcSettings.partial()
/** Rows from before secrets were bound have only the value. */
const SavedSecret = t.object({
  value: t.string().min(1),
  issuerUrl: t.string().optional(),
  clientId: t.string().optional(),
})

/** A client secret and the client it was given for. */
type BoundSecret = { value: string; issuerUrl: string; clientId: string }

type Saved = { oidc: Partial<OidcSettings>; secret: BoundSecret | null }

export type OidcState = {
  settings: OidcSettings
  /**
   * The client secret in use, only ever one given for this issuer and
   * client ID; undefined for a public client.
   */
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
    nameClaim: env.MATINEE_OIDC_NAME_CLAIM,
    roleClaim: env.MATINEE_OIDC_ROLE_CLAIM,
    groupsClaim: env.MATINEE_OIDC_GROUPS_CLAIM,
    policyClaim: env.MATINEE_OIDC_POLICY_CLAIM,
    allowSignUp: env.MATINEE_OIDC_ALLOW_SIGN_UP,
    signOutRefused: env.MATINEE_OIDC_SIGN_OUT_REFUSED,
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
  const overrides = oidc.success ? oidc.data : {}
  const unbound =
    secret.success &&
    (secret.data.issuerUrl === undefined || secret.data.clientId === undefined)
  if (unbound) {
    // An older row doesn't say which environment-backed issuer and client
    // were active when the secret was saved. Binding it to today's settings
    // could send it to a provider the operator changed to since then.
    log.warn(
      "The client secret saved by an older Matinee release wasn't bound to an issuer and client ID, so it was removed. Enter it again in Settings → Authentication.",
    )
  }
  const stored: Saved = {
    oidc: overrides,
    secret:
      secret.success && !unbound
        ? {
            value: secret.data.value,
            // `unbound` proves both are present in this branch.
            issuerUrl: secret.data.issuerUrl ?? "",
            clientId: secret.data.clientId ?? "",
          }
        : null,
  }
  // Older servers saved both switches every time, and a default may have
  // changed to a saved value since. Neither is an override. An old unbound
  // secret is deleted rather than guessed at.
  const next = trimmed(stored)
  if (unbound || !isDeepStrictEqual(next, stored)) await write(next)
  logOverridden(next.oidc, VARIABLES)
  const current = { ...oidcDefaults(), ...next.oidc }
  if (next.secret && !secretFits(next.secret, current)) {
    log.warn(
      "The client secret saved in the admin settings is for another issuer or client ID, so sign-in doesn't send it. Enter the client's secret in Settings → Authentication.",
    )
  } else if (next.secret && variableSet("MATINEE_OIDC_CLIENT_SECRET")) {
    log.info(
      "MATINEE_OIDC_CLIENT_SECRET is set, but a secret saved in the admin settings overrides it.",
    )
  }
  saved = next
  return saved
}

/** Whether a secret was given for the client these settings name. */
function secretFits(
  secret: Pick<BoundSecret, "issuerUrl" | "clientId">,
  settings: Pick<OidcSettings, "issuerUrl" | "clientId">,
): boolean {
  return (
    sameIssuer(secret.issuerUrl, settings.issuerUrl) &&
    secret.clientId === settings.clientId
  )
}

/** MATINEE_OIDC_CLIENT_SECRET, bound to the client the environment names. */
function environmentSecret(): BoundSecret | null {
  const value = env.MATINEE_OIDC_CLIENT_SECRET
  if (!value) return null
  return {
    value,
    issuerUrl: env.MATINEE_OIDC_ISSUER_URL ?? "",
    clientId: env.MATINEE_OIDC_CLIENT_ID ?? "",
  }
}

/**
 * Whether MATINEE_OIDC_CLIENT_SECRET applies to the client these settings
 * name, so it's what's left once the saved secret goes.
 */
export function environmentSecretFits(
  settings: Pick<OidcSettings, "issuerUrl" | "clientId">,
): boolean {
  const secret = environmentSecret()
  return secret !== null && secretFits(secret, settings)
}

/** Only what differs from the environment. */
function trimmed(next: Saved): Saved {
  const fallback = environmentSecret()
  const same =
    next.secret !== null &&
    fallback !== null &&
    next.secret.value === fallback.value &&
    secretFits(next.secret, fallback)
  return {
    oidc: overridesOf(next.oidc, oidcDefaults()),
    secret: same ? null : next.secret,
  }
}

function resolve(current: Saved): OidcState {
  const settings = { ...oidcDefaults(), ...current.oidc }
  const saved =
    current.secret && secretFits(current.secret, settings)
      ? current.secret.value
      : undefined
  const fallback = environmentSecretFits(settings)
    ? env.MATINEE_OIDC_CLIENT_SECRET
    : undefined
  return {
    settings,
    secret: saved ?? fallback,
    secretSource: saved ? "saved" : fallback ? "environment" : null,
    version,
  }
}

/** Whether sign-in can use these settings. */
export function isActive(settings: OidcSettings): boolean {
  return settings.enabled && Boolean(settings.issuerUrl && settings.clientId)
}

const DISCOVERY_PATH = /\/\.well-known\/openid-configuration\/?$/

/**
 * The issuer a configured URL names, in the form linked accounts compare
 * by. Providers often show the discovery document's address instead of the
 * issuer, and an ID token's `iss` can differ from the configured URL by a
 * trailing slash, so both come off.
 */
export function issuerKey(url: string): string {
  return url.trim().replace(DISCOVERY_PATH, "").replace(/\/+$/, "")
}

/** Whether two issuers, or issuer URLs, are the same provider. */
export function sameIssuer(a: string, b: string): boolean {
  return issuerKey(a) === issuerKey(b)
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
 * saved value, so the environment's applies. A new secret is bound to the
 * issuer and client ID saved with it; an omitted one keeps its binding, so
 * it stays out of requests to any other client.
 */
function nextSaved(current: Saved, input: OidcSettingsInput): Saved {
  const oidc: Partial<OidcSettings> = {
    enabled: input.enabled,
    allowSignUp: input.allowSignUp,
    signOutRefused: input.signOutRefused,
  }
  for (const key of TEXT_FIELDS) {
    if (input[key]) oidc[key] = input[key]
  }
  const settings = { ...oidcDefaults(), ...oidc }
  return trimmed({
    oidc,
    secret:
      input.clientSecret === undefined
        ? current.secret
        : input.clientSecret === null
          ? null
          : {
              value: input.clientSecret,
              issuerUrl: settings.issuerUrl,
              clientId: settings.clientId,
            },
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
      const value = next.secret
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
