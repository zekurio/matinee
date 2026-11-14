import type { PluginAuthContribution } from "@matinee/contracts"
import { pluginIdentity, user, type UserRow } from "@matinee/db"
import { and, eq } from "drizzle-orm"

import { db } from "../db"
import { recordPluginEvent, type Running } from "../plugins"
import {
  availableUsername,
  findUserByUsernameHint,
  insertUser,
  lockUsers,
  type Tx,
} from "./users"

export type AuthProvider = Running<PluginAuthContribution>
export type Identity = {
  subject: string
  username?: string | null
  name?: string | null
}

/** Only these host-authored failures, and guest ProviderErrors, reach the client. */
export class PluginAuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | "BAD_REQUEST"
      | "NOT_FOUND"
      | "UNAUTHORIZED"
      | "TOO_MANY_REQUESTS" = "BAD_REQUEST",
  ) {
    super(message)
  }
}

export const PLUGIN_SETUP_FIRST =
  "Finish setup with a passkey or single sign-on before using plugin sign-in."

function atProvider(provider: AuthProvider) {
  return and(
    eq(pluginIdentity.pluginId, provider.pluginId),
    eq(pluginIdentity.providerId, provider.contribution.id),
  )
}

function atIdentity(provider: AuthProvider, identity: Identity) {
  return and(atProvider(provider), eq(pluginIdentity.subject, identity.subject))
}

/**
 * The account an identity is linked to, by its exact subject. A username
 * never selects the account to sign in to. One statement finds the link
 * and notes its use, so an unlink at the same moment either comes first
 * and no account is found, or second and this sign-in was the last.
 */
export async function pluginIdentityUser(
  provider: AuthProvider,
  identity: Identity,
): Promise<UserRow | null> {
  const [link] = await db
    .update(pluginIdentity)
    .set({ lastUsedAt: new Date() })
    .where(atIdentity(provider, identity))
    .returning({ userId: pluginIdentity.userId })
  if (!link) return null
  const [row] = await db.select().from(user).where(eq(user.id, link.userId))
  return row ?? null
}

export function listPluginIdentities(userId: string) {
  return db
    .select()
    .from(pluginIdentity)
    .where(eq(pluginIdentity.userId, userId))
}

async function insertLink(
  tx: Tx,
  userId: string,
  provider: AuthProvider,
  identity: Identity,
  usedNow: boolean,
): Promise<void> {
  await tx.insert(pluginIdentity).values({
    userId,
    pluginId: provider.pluginId,
    providerId: provider.contribution.id,
    subject: identity.subject,
    label: identity.username ?? null,
    lastUsedAt: usedNow ? new Date() : null,
  })
}

export async function linkPluginIdentity(
  userId: string,
  provider: AuthProvider,
  identity: Identity,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockUsers(tx)
    const [linked] = await tx
      .select()
      .from(pluginIdentity)
      .where(atIdentity(provider, identity))
    if (linked) {
      if (linked.userId !== userId) {
        throw new PluginAuthError(
          "This sign-in is already linked to another account.",
        )
      }
      return
    }
    const [current] = await tx
      .select({ id: pluginIdentity.id })
      .from(pluginIdentity)
      .where(and(atProvider(provider), eq(pluginIdentity.userId, userId)))
    if (current) {
      throw new PluginAuthError(
        "Your account is already linked to another sign-in at this provider. Unlink it in settings first.",
      )
    }
    await insertLink(tx, userId, provider, identity, false)
  })
}

export async function unlinkPluginIdentity(
  userId: string,
  provider: AuthProvider,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockUsers(tx)
    const rows = await tx
      .delete(pluginIdentity)
      .where(and(atProvider(provider), eq(pluginIdentity.userId, userId)))
      .returning({ id: pluginIdentity.id })
    return rows.length > 0
  })
}

/** Create and link together. Refuse name collisions even under concurrent sign-ups. */
export async function createPluginUser(
  provider: AuthProvider,
  identity: Identity,
): Promise<UserRow> {
  const created = await db.transaction(async (tx) => {
    const { empty } = await lockUsers(tx)
    if (empty) throw new PluginAuthError(PLUGIN_SETUP_FIRST)
    // Another request might have linked this subject while authenticate was running.
    const [linked] = await tx
      .select({ id: pluginIdentity.id })
      .from(pluginIdentity)
      .where(atIdentity(provider, identity))
    if (linked) {
      throw new PluginAuthError(
        "This sign-in is already linked to another account.",
      )
    }
    const match = await findUserByUsernameHint(identity.username ?? null, tx)
    if (match) {
      const [existing] = await tx.select().from(user).where(eq(user.id, match))
      if (existing) {
        throw new PluginAuthError(
          `An account named ${existing.username} already exists. Sign in to it, then link ${provider.contribution.name} under Settings → Account.`,
        )
      }
    }
    const username = await availableUsername(identity.username ?? "user", tx)
    const row = await insertUser(tx, {
      username,
      role: "user",
      displayName: identity.name?.slice(0, 64) ?? null,
    })
    await insertLink(tx, row.id, provider, identity, true)
    await recordPluginEvent(tx, "user.created", { userId: row.id })
    return row
  })
  return created
}
