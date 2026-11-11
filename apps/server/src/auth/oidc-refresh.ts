import { oidcAccount, user } from "@matinee/db"
import { and, eq, isNotNull } from "drizzle-orm"
import * as client from "openid-client"

import { db } from "../db"
import { log } from "../log"
import { syncAccess, syncRole, takePicture } from "./oidc-accounts"
import { readOidcIdentity } from "./oidc-claims"
import { oidcConfig } from "./oidc-client"
import { activeOidc, sameIssuer } from "./oidc-settings"
import { deleteUserSessions } from "./session"

function rejectedToken(
  error: string | undefined,
  description: string | undefined,
): boolean {
  if (
    [
      "invalid_grant",
      "invalid_token",
      "invalid_client",
      "unauthorized_client",
    ].includes(error ?? "")
  )
    return true
  const problem = `${error ?? ""} ${description ?? ""}`.replaceAll("_", " ")
  return (
    /\b(?:invalid|expired|revoked|rejected|disabled|unauthorized) (?:refresh |access )?(?:token|client)\b/i.test(
      problem,
    ) ||
    /\b(?:token|client) (?:is |was |has been )?(?:invalid|expired|revoked|rejected|disabled|unauthorized)\b/i.test(
      problem,
    )
  )
}

/** Only a definite token or client rejection should end local sessions. */
export function refreshRefused(cause: unknown): boolean {
  if (cause instanceof client.ResponseBodyError) {
    return (
      cause.status >= 400 &&
      cause.status < 500 &&
      rejectedToken(cause.error, cause.error_description)
    )
  }
  if (cause instanceof client.WWWAuthenticateChallengeError) {
    return (
      cause.status >= 400 &&
      cause.status < 500 &&
      cause.cause.some((challenge) =>
        rejectedToken(
          challenge.parameters.error,
          challenge.parameters.error_description,
        ),
      )
    )
  }
  return false
}

/** Read provider changes even for accounts that only use sliding app sessions. */
export async function syncOidcAccounts({
  signal,
  progress,
}: {
  signal: AbortSignal
  progress: (fraction: number) => void
}): Promise<void> {
  const provider = await activeOidc()
  if (!provider) return
  const rows = await db
    .select({ account: oidcAccount, username: user.username })
    .from(oidcAccount)
    .innerJoin(user, eq(user.id, oidcAccount.userId))
    .where(isNotNull(oidcAccount.refreshToken))
  const accounts = rows.filter(({ account }) =>
    sameIssuer(account.issuer, provider.settings.issuerUrl),
  )
  if (accounts.length === 0) return
  const { state, config } = await oidcConfig()
  // A settings change while loading accounts should wait for the next run.
  if (state.version !== provider.version) return
  let done = 0
  for (const { account, username } of accounts) {
    signal.throwIfAborted()
    const refreshToken = account.refreshToken
    if (!refreshToken) continue
    const unchanged = and(
      eq(oidcAccount.id, account.id),
      eq(oidcAccount.refreshToken, refreshToken),
    )
    try {
      let tokens: Awaited<ReturnType<typeof client.refreshTokenGrant>>
      try {
        tokens = await client.refreshTokenGrant(config, refreshToken)
      } catch (cause) {
        if (!refreshRefused(cause)) throw cause
        const dropped = await db.transaction(async (tx) => {
          const removed = await tx
            .update(oidcAccount)
            .set({ refreshToken: null })
            .where(unchanged)
            .returning({ id: oidcAccount.id })
          if (removed.length === 0) return false
          if (state.settings.signOutRefused)
            await deleteUserSessions(account.userId, undefined, tx)
          return true
        })
        if (dropped) {
          log.info(
            state.settings.signOutRefused
              ? `The OIDC provider refused to refresh ${username}; ended all of the account's sessions`
              : `The OIDC provider refused to refresh ${username}; kept the account's sessions and last claims`,
          )
        }
        continue
      }
      // Save rotation before userinfo, which can fail after the old token was spent.
      const updated = await db
        .update(oidcAccount)
        .set({ refreshToken: tokens.refresh_token ?? refreshToken })
        .where(unchanged)
        .returning({ id: oidcAccount.id })
      if (updated.length === 0) continue
      const claims = tokens.claims()
      if (
        claims &&
        (!sameIssuer(claims.iss, account.issuer) ||
          claims.sub !== account.subject)
      ) {
        log.warn(
          `The OIDC refresh for ${username} returned a different identity; ignored its claims`,
        )
        continue
      }
      const { identity } = await readOidcIdentity(
        config,
        state.settings,
        tokens,
        claims ?? { iss: account.issuer, sub: account.subject },
        false,
      )
      // Rotation was already saved with a compare-and-swap above.
      identity.refreshToken = undefined
      await syncRole(account.userId, identity)
      await syncAccess(account.userId, identity)
      await takePicture(account.userId, identity)
    } catch (cause) {
      log.warn(
        `Couldn't refresh the OIDC account for ${username}; will try again on the next run`,
        cause,
      )
    } finally {
      progress(++done / accounts.length)
    }
  }
}
