import type { UserRole } from "@matinee/contracts"
import { oidcAccount, user, type UserRow } from "@matinee/db"
import { and, eq } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { recordProviderPicture } from "./avatars"
import { sameIssuer } from "./oidc-settings"
import {
  availableUsername,
  insertUser,
  lockUsers,
  otherAdminCanSignIn,
} from "./users"

/** A failure the person can act on. Its message is shown as is. */
export class OidcError extends Error {}

export const NO_LINKED_ACCOUNT =
  "No account is linked to this sign-in. Sign in with a passkey, then link it in settings."

/** Who the provider says signed in, from the ID token and userinfo. */
export type OidcIdentity = {
  issuer: string
  subject: string
  /**
   * The username claim, else `preferred_username`. Names a new account,
   * finds a matching one, and labels the linked account.
   */
  label: string | null
  /** The `name` claim, for a new account's display name. */
  name: string | null
  /** The `picture` claim. Undefined when the provider may not have sent it. */
  picture: string | null | undefined
  /** What the role claim names. Undefined leaves the account's role alone. */
  role: UserRole | undefined
}

/** The account the identity is linked to, if any. */
export async function linkedUserId(
  identity: OidcIdentity,
): Promise<string | null> {
  const [row] = await db
    .select({ userId: oidcAccount.userId })
    .from(oidcAccount)
    .where(
      and(
        eq(oidcAccount.issuer, identity.issuer),
        eq(oidcAccount.subject, identity.subject),
      ),
    )
    .limit(1)
  return row?.userId ?? null
}

/** Store the provider's picture for the account, and follow it if asked. */
export function takePicture(userId: string, identity: OidcIdentity) {
  return recordProviderPicture({
    issuer: identity.issuer,
    subject: identity.subject,
    userId,
    picture: identity.picture,
  })
}

/**
 * Link the identity to the account, its only one. Fails if another account
 * has the identity, or this account has another at the same provider. One
 * at another issuer can't sign in anymore, so the new link replaces it.
 */
export async function linkOidcAccount(
  userId: string,
  identity: OidcIdentity,
): Promise<void> {
  const linked = await linkedUserId(identity)
  if (linked && linked !== userId) {
    throw new OidcError("This sign-in is already linked to another account.")
  }
  if (!linked) {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: oidcAccount.id, issuer: oidcAccount.issuer })
        .from(oidcAccount)
        .where(eq(oidcAccount.userId, userId))
      if (current && sameIssuer(current.issuer, identity.issuer)) {
        throw new OidcError(
          "Your account is already linked to another sign-in at this provider. Unlink it in settings first.",
        )
      }
      if (current) {
        await tx.delete(oidcAccount).where(eq(oidcAccount.id, current.id))
      }
      await tx.insert(oidcAccount).values({
        userId,
        issuer: identity.issuer,
        subject: identity.subject,
        label: identity.label,
      })
    })
  }
  await takePicture(userId, identity)
}

/**
 * Give the account the role the provider's claim names, as on every
 * sign-in. Demoting the last admin who can sign in is skipped, so Matinee
 * always keeps one.
 */
export async function syncRole(
  userId: string,
  identity: OidcIdentity,
): Promise<void> {
  const { role } = identity
  if (!role) return
  const [before] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
  if (!before || before.role === role) return
  const result = await db.transaction(async (tx) => {
    await lockUsers(tx)
    const [current] = await tx
      .select({ role: user.role, username: user.username })
      .from(user)
      .where(eq(user.id, userId))
    if (!current || current.role === role) return null
    if (current.role === "admin" && !(await otherAdminCanSignIn(tx, userId))) {
      return { username: current.username, changed: false }
    }
    await tx
      .update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, userId))
    return { username: current.username, changed: true }
  })
  if (!result) return
  if (result.changed) {
    log.info(`The OIDC role claim made ${result.username} ${role}`)
  } else {
    log.warn(
      `The OIDC role claim would demote ${result.username}, the only admin who can sign in. Kept the admin role.`,
    )
  }
}

/**
 * Create an account for an identity no account is linked to. During setup
 * it becomes the admin, which the caller checked the role claim allows;
 * otherwise setup must have made the admin first, and the claim gives the
 * role.
 */
export async function createOidcUser(
  identity: OidcIdentity,
  setup: boolean,
): Promise<UserRow> {
  const created = await db.transaction(async (tx) => {
    const { empty } = await lockUsers(tx)
    if (setup && !empty) {
      throw new OidcError("Setup is already done. Sign in instead.")
    }
    if (!setup && empty) {
      throw new OidcError("Create the admin account on the setup page first.")
    }
    const username = await availableUsername(identity.label ?? "user", tx)
    const row = await insertUser(tx, {
      username,
      role: setup ? "admin" : (identity.role ?? "user"),
      displayName: identity.name?.slice(0, 64) ?? null,
    })
    await tx.insert(oidcAccount).values({
      userId: row.id,
      issuer: identity.issuer,
      subject: identity.subject,
      label: identity.label,
    })
    return row
  })
  await takePicture(created.id, identity)
  return created
}
