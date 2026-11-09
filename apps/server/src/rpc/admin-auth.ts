import {
  type AdminAuthSettings,
  OIDC_CALLBACK_PATH,
  type PasskeySettings,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { oidcAccount, passkey, user } from "@matinee/db"
import { and, count, countDistinct, eq, notExists } from "drizzle-orm"
import * as client from "openid-client"

import { discover, WrongIssuerError } from "../auth/oidc"
import {
  isActive,
  issuerKey,
  type OidcState,
  oidcDefaults,
  oidcState,
  previewOidc,
  sameIssuer,
  saveOidc,
} from "../auth/oidc-settings"
import { passkeySettings, savePasskeys } from "../auth/passkey-settings"
import { atIssuer } from "../auth/users"
import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { admin, badRequest } from "./base"

/** Accounts that can only sign in through the provider. */
async function ssoOnlyUsers(): Promise<number> {
  const [row] = await db
    .select({ n: countDistinct(oidcAccount.userId) })
    .from(oidcAccount)
    .where(
      notExists(
        db
          .select({ id: passkey.id })
          .from(passkey)
          .where(eq(passkey.userId, oidcAccount.userId)),
      ),
    )
  return row?.n ?? 0
}

async function hasPasskey(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: passkey.id })
    .from(passkey)
    .where(eq(passkey.userId, userId))
    .limit(1)
  return row !== undefined
}

async function linkedAt(userId: string, issuerUrl: string): Promise<boolean> {
  const [row] = await db
    .select({ id: oidcAccount.id })
    .from(oidcAccount)
    .where(and(eq(oidcAccount.userId, userId), atIssuer(issuerUrl)))
    .limit(1)
  return row !== undefined
}

/** Accounts that can't sign in while passkeys are off. */
async function unlinkedUsers(state: OidcState): Promise<number> {
  if (!isActive(state.settings)) return 0
  const [row] = await db
    .select({ n: count() })
    .from(user)
    .where(
      notExists(
        db
          .select({ id: oidcAccount.id })
          .from(oidcAccount)
          .where(
            and(
              eq(oidcAccount.userId, user.id),
              atIssuer(state.settings.issuerUrl),
            ),
          ),
      ),
    )
  return row?.n ?? 0
}

async function describe(
  state: OidcState,
  passkeys: PasskeySettings,
): Promise<AdminAuthSettings> {
  return {
    passkeys,
    oidc: state.settings,
    defaults: oidcDefaults(),
    clientSecret: {
      source: state.secretSource,
      environment: Boolean(env.MATINEE_OIDC_CLIENT_SECRET),
    },
    callbackUrl: `${env.PUBLIC_URL}${OIDC_CALLBACK_PATH}`,
    active: isActive(state.settings),
    ssoOnlyUsers: await ssoOnlyUsers(),
    unlinkedUsers: await unlinkedUsers(state),
  }
}

/** What openid-client attaches when the discovered issuer doesn't match. */
const IssuerMismatch = t.object({ body: t.object({ issuer: t.string() }) })
/** Node's network errors carry a code such as ECONNREFUSED. */
const SystemError = t.object({ code: t.string().min(1) })

/** Turns a failed discovery into something the admin can act on. */
function discoveryError(issuerUrl: string, cause: unknown): string {
  if (cause instanceof WrongIssuerError) {
    return `The provider calls itself ${cause.issuer}. Use exactly that as the issuer URL.`
  }
  const where = `${issuerKey(issuerUrl)}/.well-known/openid-configuration`
  const code = cause instanceof client.ClientError ? cause.code : undefined
  switch (code) {
    case "OAUTH_TIMEOUT":
      return `${where} didn't answer within 10 seconds.`
    case "OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED": {
      // The cause holds { expected, body, attribute }.
      const mismatch = IssuerMismatch.safeParse(
        cause instanceof Error ? cause.cause : undefined,
      )
      return mismatch.success
        ? `The provider calls itself ${mismatch.data.body.issuer}. Use exactly that as the issuer URL.`
        : "The provider's discovery document names a different issuer. Copy it exactly, including any trailing slash."
    }
    case "OAUTH_RESPONSE_IS_NOT_CONFORM":
    case "OAUTH_RESPONSE_IS_NOT_JSON":
      return `${where} isn't a discovery document. Check the issuer URL.`
  }
  // Network failures arrive as "fetch failed" with the reason underneath;
  // a host with several addresses gives an AggregateError with only a code.
  const inner = cause instanceof Error ? cause.cause : undefined
  const reason =
    inner instanceof Error
      ? inner.message || SystemError.safeParse(inner).data?.code || "no answer"
      : cause instanceof Error
        ? cause.message
        : String(cause)
  return `Couldn't load ${where}: ${reason}`
}

/**
 * Why a save would lock the admin making it out: it switches off, or moves
 * to another issuer, the only way they sign in.
 */
function lockoutMessage(change: {
  passkeysBefore: boolean
  passkeysLost: boolean
  /** Single sign-on stays on at the issuer it uses now. */
  oidcKept: boolean
  oidcOn: boolean
}): string {
  if (change.passkeysLost) {
    return change.oidcKept
      ? "Link your account to single sign-on under Settings → Account before turning passkeys off."
      : "Save single sign-on first and link your account to it under Settings → Account. Then turn passkeys off."
  }
  if (change.passkeysBefore) {
    return change.oidcOn
      ? "You sign in only through single sign-on. Add a passkey before changing the issuer."
      : "You sign in only through single sign-on. Add a passkey before turning it off."
  }
  return change.oidcOn
    ? "You sign in only through single sign-on. Turn passkeys on and add one before changing the issuer."
    : "You sign in only through single sign-on. Turn passkeys on and add one before turning it off."
}

export const adminAuth = {
  get: admin.admin.auth.get.handler(async () =>
    describe(await oidcState(), await passkeySettings()),
  ),

  update: admin.admin.auth.update.handler(async ({ context, input }) => {
    const before = await oidcState()
    const passkeysBefore = (await passkeySettings()).enabled
    const next = await previewOidc(input.oidc)
    const { settings } = next
    const passkeysAfter = input.passkeys.enabled

    if (settings.enabled && !settings.issuerUrl) {
      throw badRequest("Enter an issuer URL to turn on single sign-on.")
    }
    if (settings.enabled && !settings.clientId) {
      throw badRequest("Enter a client ID to turn on single sign-on.")
    }

    const wasActive = isActive(before.settings)
    const willBeActive = isActive(settings)
    if (!passkeysAfter && !willBeActive) {
      throw badRequest(
        "Keep passkeys or single sign-on on. Without either, nobody can sign in.",
      )
    }

    // Linked accounts match on the issuer, so switching sign-in off or to
    // another issuer locks out anyone who has no passkey, and switching
    // passkeys off anyone who isn't linked. Never yourself.
    const issuerChanged = !sameIssuer(
      before.settings.issuerUrl,
      settings.issuerUrl,
    )
    const oidcLost = wasActive && (!willBeActive || issuerChanged)
    const passkeysLost = passkeysBefore && !passkeysAfter
    if (oidcLost || passkeysLost) {
      const keepsWayIn =
        (passkeysAfter && (await hasPasskey(context.user.id))) ||
        (willBeActive && (await linkedAt(context.user.id, settings.issuerUrl)))
      if (!keepsWayIn) {
        throw badRequest(
          lockoutMessage({
            passkeysBefore,
            passkeysLost,
            oidcKept: wasActive && willBeActive && !issuerChanged,
            oidcOn: willBeActive,
          }),
        )
      }
    }

    // Catch a mistyped issuer now rather than at someone's next sign-in.
    const connectionChanged =
      !wasActive ||
      issuerChanged ||
      before.settings.clientId !== settings.clientId ||
      before.secret !== next.secret
    if (willBeActive && connectionChanged) {
      try {
        await discover(next)
      } catch (cause) {
        throw badRequest(discoveryError(settings.issuerUrl, cause))
      }
    }

    const saved = await saveOidc(input.oidc)
    const passkeys = await savePasskeys(input.passkeys)
    log.info(
      `Sign-in settings saved by ${context.user.username}${passkeysLost ? ", with passkeys turned off" : ""}`,
    )
    return describe(saved, passkeys)
  }),
}
