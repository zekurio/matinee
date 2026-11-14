import { oidcAccount, passkey, pluginIdentity, user } from "@matinee/db"
import { and, countDistinct, eq, exists, not, notExists, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "../db"
import { runningAuth } from "../plugins"
import { activeOidc } from "./oidc-settings"
import { passkeysEnabled } from "./passkey-settings"
import { atIssuer } from "./users"

/** How many of the locked-out accounts are named. */
const NAMED = 5

/**
 * How many accounts sign in through a plugin, and how many of them have
 * no other way in, with the first few of those by name. The other ways count as they do where people are kept
 * from removing their last one: a passkey while passkeys are on, a link
 * at the single sign-on provider in use, or a link at another plugin's
 * provider that is on.
 */
export async function pluginSignInImpact(pluginId: string): Promise<{
  linkedAccounts: number
  lockedOut: number
  lockedOutNames: string[]
}> {
  const [passkeys, provider] = await Promise.all([
    passkeysEnabled(),
    activeOidc(),
  ])
  const here = eq(pluginIdentity.pluginId, pluginId)
  const [linked] = await db
    .select({ n: countDistinct(pluginIdentity.userId) })
    .from(pluginIdentity)
    .where(here)

  const other = alias(pluginIdentity, "other")
  const others = runningAuth().filter((entry) => entry.pluginId !== pluginId)
  const elsewhere =
    others.length > 0
      ? exists(
          db
            .select({ id: other.id })
            .from(other)
            .where(
              and(
                eq(other.userId, pluginIdentity.userId),
                or(
                  ...others.map((entry) =>
                    and(
                      eq(other.pluginId, entry.pluginId),
                      eq(other.providerId, entry.contribution.id),
                    ),
                  ),
                ),
              ),
            ),
        )
      : undefined
  const stranded = and(
    here,
    passkeys
      ? notExists(
          db
            .select({ id: passkey.id })
            .from(passkey)
            .where(eq(passkey.userId, pluginIdentity.userId)),
        )
      : undefined,
    provider
      ? notExists(
          db
            .select({ id: oidcAccount.id })
            .from(oidcAccount)
            .where(
              and(
                eq(oidcAccount.userId, pluginIdentity.userId),
                atIssuer(provider.settings.issuerUrl),
              ),
            ),
        )
      : undefined,
    elsewhere ? not(elsewhere) : undefined,
  )
  const [locked] = await db
    .select({ n: countDistinct(pluginIdentity.userId) })
    .from(pluginIdentity)
    .where(stranded)
  const names = await db
    .selectDistinct({ username: user.username })
    .from(pluginIdentity)
    .innerJoin(user, eq(user.id, pluginIdentity.userId))
    .where(stranded)
    .orderBy(user.username)
    .limit(NAMED)
  return {
    linkedAccounts: linked?.n ?? 0,
    lockedOut: locked?.n ?? 0,
    lockedOutNames: names.map((row) => row.username),
  }
}
