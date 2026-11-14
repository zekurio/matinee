import { isDeepStrictEqual } from "node:util"

import { AccessOverride, type UserRole } from "@matinee/contracts"
import {
  accessGroup,
  accessGroupMember,
  invite,
  oidcAccount,
  user,
  type UserRow,
} from "@matinee/db"
import { and, eq } from "drizzle-orm"

import { forgetGroups, groupsFollowing, setMemberships } from "../access/groups"
import { db } from "../db"
import { log } from "../log"
import { recordProviderPicture } from "./avatars"
import { sameIssuer } from "./oidc-settings"
import { passkeysEnabled } from "./passkey-settings"
import {
  availableUsername,
  insertUser,
  lockUsers,
  otherAdminCanSignIn,
  type Tx,
} from "./users"

/** A failure the person can act on. Its message is shown as is. */
export class OidcError extends Error {}

const NO_LINKED_ACCOUNT =
  "No account is linked to this sign-in. Sign in with a passkey, then link it in settings."

/** What a sign-in that matches no account hears, while sign-up is off. */
export async function noLinkedAccount(): Promise<string> {
  return (await passkeysEnabled())
    ? NO_LINKED_ACCOUNT
    : "No account is linked to this sign-in. Ask an admin for access."
}

/** Who the provider says signed in, from the ID token and userinfo. */
export type OidcIdentity = {
  issuer: string
  subject: string
  /**
   * The username claim, else `preferred_username`. Names a new account,
   * finds a matching one, and labels the linked account.
   */
  label: string | null
  /** The name claim, else `name`, for a new account's display name. */
  name: string | null
  /** The `picture` claim. Undefined when the provider may not have sent it. */
  picture: string | null | undefined
  /** What the role claim names. Undefined leaves the account's role alone. */
  role: UserRole | undefined
  /** Undefined leaves the provider's last groups and policy alone. */
  groups: string[] | undefined
  access: AccessOverride | null | undefined
  /** A new token replaces the stored token; an omitted one keeps it. */
  refreshToken: string | undefined
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
        await clearProviderAccess(tx, userId)
        await tx.delete(oidcAccount).where(eq(oidcAccount.id, current.id))
      }
      await tx.insert(oidcAccount).values({
        userId,
        issuer: identity.issuer,
        subject: identity.subject,
        label: identity.label,
      })
    })
    forgetGroups()
  }
  await syncRole(userId, identity)
  await syncAccess(userId, identity)
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
    if (current.role === "admin") {
      await tx.delete(invite).where(eq(invite.createdBy, userId))
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
  await syncAccess(created.id, identity)
  await takePicture(created.id, identity)
  return created
}

/** Remove what only the old provider vouched for, within the unlink transaction. */
export async function clearProviderAccess(
  tx: Tx,
  userId: string,
): Promise<void> {
  await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .for("update")
  await setMemberships(tx, userId, "provider", [])
  await tx
    .update(user)
    .set({
      accessOverride: null,
      accessOverrideSource: "manual",
      updatedAt: new Date(),
    })
    .where(and(eq(user.id, userId), eq(user.accessOverrideSource, "provider")))
}

/** Apply only claims the provider actually sent, preserving manual memberships. */
export async function syncAccess(
  userId: string,
  identity: OidcIdentity,
): Promise<void> {
  const groupIds =
    identity.groups === undefined
      ? undefined
      : await groupsFollowing(identity.groups)
  const changes = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .for("update")
    if (!current) return []
    const [account] = await tx
      .select()
      .from(oidcAccount)
      .where(
        and(
          eq(oidcAccount.userId, userId),
          eq(oidcAccount.issuer, identity.issuer),
          eq(oidcAccount.subject, identity.subject),
        ),
      )
      .for("update")
    // An unlink or replacement may have committed while the claims were being read.
    if (!account) return []
    const messages: string[] = []
    await tx
      .update(oidcAccount)
      .set({
        ...(identity.groups !== undefined && { groups: identity.groups }),
        ...(identity.refreshToken !== undefined && {
          refreshToken: identity.refreshToken,
        }),
        syncedAt: new Date(),
      })
      .where(eq(oidcAccount.id, account.id))
    if (groupIds !== undefined) {
      const before = await tx
        .select({ id: accessGroupMember.groupId })
        .from(accessGroupMember)
        .where(
          and(
            eq(accessGroupMember.userId, userId),
            eq(accessGroupMember.source, "provider"),
          ),
        )
      if (
        !isDeepStrictEqual(
          before.map((row) => row.id).sort(),
          [...groupIds].sort(),
        )
      ) {
        await setMemberships(tx, userId, "provider", groupIds)
        const groups = await tx
          .select({ id: accessGroup.id, name: accessGroup.name })
          .from(accessGroup)
        const names = groups
          .filter((group) => groupIds.includes(group.id))
          .map((group) => group.name)
          .sort()
        messages.push(
          names.length > 0
            ? `The OIDC groups claim put ${current.username} in ${names.join(", ")}`
            : `The OIDC groups claim removed ${current.username} from provider access groups`,
        )
      } else if (!isDeepStrictEqual(account.groups, identity.groups)) {
        messages.push(
          `The OIDC groups claim for ${current.username} now names ${identity.groups?.join(", ") || "no groups"}`,
        )
      }
    }
    if (identity.access !== undefined) {
      if (identity.access === null) {
        if (current.accessOverrideSource === "provider") {
          await tx
            .update(user)
            .set({
              accessOverride: null,
              accessOverrideSource: "manual",
              updatedAt: new Date(),
            })
            .where(eq(user.id, userId))
          messages.push(
            `The OIDC policy claim cleared the access override for ${current.username}`,
          )
        }
      } else if (
        current.accessOverrideSource !== "provider" ||
        !isDeepStrictEqual(
          AccessOverride.safeParse(current.accessOverride).data,
          identity.access,
        )
      ) {
        await tx
          .update(user)
          .set({
            accessOverride: identity.access,
            accessOverrideSource: "provider",
            updatedAt: new Date(),
          })
          .where(eq(user.id, userId))
        messages.push(
          `The OIDC policy claim set the access override for ${current.username}`,
        )
      }
    }
    return messages
  })
  forgetGroups()
  for (const message of changes) log.info(message)
}

/** Unlink and revoke provider access together. Manual access remains. */
export async function unlinkOidcAccount(userId: string): Promise<boolean> {
  const removed = await db.transaction(async (tx) => {
    await clearProviderAccess(tx, userId)
    const rows = await tx
      .delete(oidcAccount)
      .where(eq(oidcAccount.userId, userId))
      .returning({ id: oidcAccount.id })
    return rows.length > 0
  })
  forgetGroups()
  return removed
}
