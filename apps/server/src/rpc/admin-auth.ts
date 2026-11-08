import { type AdminAuthSettings, OIDC_CALLBACK_PATH } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { oidcAccount, passkey } from "@matinee/db"
import { countDistinct, eq, notExists } from "drizzle-orm"
import * as client from "openid-client"

import { discover } from "../auth/oidc"
import {
  isActive,
  type OidcState,
  oidcDefaults,
  oidcState,
  previewOidc,
  sameIssuer,
  saveOidc,
} from "../auth/oidc-settings"
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

async function describe(state: OidcState): Promise<AdminAuthSettings> {
  return {
    oidc: state.settings,
    defaults: oidcDefaults(),
    clientSecret: {
      source: state.secretSource,
      environment: Boolean(env.MATINEE_OIDC_CLIENT_SECRET),
    },
    callbackUrl: `${env.PUBLIC_URL}${OIDC_CALLBACK_PATH}`,
    active: isActive(state.settings),
    ssoOnlyUsers: await ssoOnlyUsers(),
  }
}

/** What openid-client attaches when the discovered issuer doesn't match. */
const IssuerMismatch = t.object({ body: t.object({ issuer: t.string() }) })
/** Node's network errors carry a code such as ECONNREFUSED. */
const SystemError = t.object({ code: t.string().min(1) })

/** Turns a failed discovery into something the admin can act on. */
function discoveryError(issuerUrl: string, cause: unknown): string {
  const where = `${issuerUrl.replace(/\/+$/, "")}/.well-known/openid-configuration`
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

export const adminAuth = {
  get: admin.admin.auth.get.handler(async () => describe(await oidcState())),

  updateOidc: admin.admin.auth.updateOidc.handler(
    async ({ context, input }) => {
      const before = await oidcState()
      const next = await previewOidc(input)
      const { settings } = next

      if (settings.enabled && !settings.issuerUrl) {
        throw badRequest("Enter an issuer URL to turn on single sign-on.")
      }
      if (settings.enabled && !settings.clientId) {
        throw badRequest("Enter a client ID to turn on single sign-on.")
      }

      // Linked accounts match on the issuer, so switching sign-in off or to
      // another issuer locks out anyone who has no passkey. Never yourself.
      const wasActive = isActive(before.settings)
      const willBeActive = isActive(settings)
      const issuerChanged = !sameIssuer(
        before.settings.issuerUrl,
        settings.issuerUrl,
      )
      if (
        wasActive &&
        (!willBeActive || issuerChanged) &&
        !(await hasPasskey(context.user.id))
      ) {
        throw badRequest(
          willBeActive
            ? "You sign in only through single sign-on. Add a passkey before changing the issuer."
            : "You sign in only through single sign-on. Add a passkey before turning it off.",
        )
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

      const saved = await saveOidc(input)
      log.info(`OIDC settings saved by ${context.user.username}`)
      return describe(saved)
    },
  ),
}
