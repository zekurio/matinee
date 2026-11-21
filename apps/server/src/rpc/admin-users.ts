import { type AdminUser, type Permission } from "@matinee/contracts"
import {
  apiToken,
  invite,
  oidcAccount,
  passkey,
  session,
  user,
  type UserRow,
} from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { asc, count, eq, inArray, max, sql } from "drizzle-orm"

import {
  accessIn,
  type AccessState,
  describeAccess,
  forgetGroups,
  groupPermissionsIn,
  manualGroupIdsIn,
  overrideOf,
  readAccess,
  setMemberships,
} from "../access/groups"
import { can, type Viewer } from "../access/viewer"
import { revokeUserApiTokens } from "../auth/api-tokens"
import { deleteAvatarFile } from "../auth/avatars"
import {
  deleteUserSessions,
  publicUser,
  sessionIdOf,
  signOut,
} from "../auth/session"
import { lockUsers, otherAdminCanSignIn, type Tx } from "../auth/users"
import { db } from "../db"
import { log } from "../log"
import { authed, badRequest, forbidden, notFound, requireOwn } from "./base"

const USER_GONE = "That user no longer exists. Reload the list."

async function toAdminUsers(rows: UserRow[]): Promise<AdminUser[]> {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const [passkeys, accounts, sessions, tokens, access] = await Promise.all([
    db
      .select({ userId: passkey.userId, n: count() })
      .from(passkey)
      .where(inArray(passkey.userId, ids))
      .groupBy(passkey.userId),
    db
      .select({ userId: oidcAccount.userId, syncedAt: oidcAccount.syncedAt })
      .from(oidcAccount)
      .where(inArray(oidcAccount.userId, ids)),
    db
      .select({
        userId: session.userId,
        lastSeenAt: max(session.lastSeenAt),
        live: sql<number>`count(*) filter (where ${session.expiresAt} > now())`.mapWith(
          Number,
        ),
      })
      .from(session)
      .where(inArray(session.userId, ids))
      .groupBy(session.userId),
    db
      .select({ userId: apiToken.userId, n: count() })
      .from(apiToken)
      .where(inArray(apiToken.userId, ids))
      .groupBy(apiToken.userId),
    describeAccess(rows),
  ])
  const passkeyCount = new Map(passkeys.map((row) => [row.userId, row.n]))
  const linked = new Map(accounts.map((row) => [row.userId, row]))
  const activity = new Map(sessions.map((row) => [row.userId, row]))
  const tokenCount = new Map(tokens.map((row) => [row.userId, row.n]))
  return rows.flatMap((row) => {
    const described = access.get(row.id)
    if (!described) return []
    return [
      {
        ...publicUser(row, described.effective.permissions),
        createdAt: row.createdAt,
        lastSeenAt: activity.get(row.id)?.lastSeenAt ?? null,
        passkeys: passkeyCount.get(row.id) ?? 0,
        oidcLinked: linked.has(row.id),
        sessions: activity.get(row.id)?.live ?? 0,
        apiTokens: tokenCount.get(row.id) ?? 0,
        claimsSyncedAt: linked.get(row.id)?.syncedAt ?? null,
        access: described,
      },
    ]
  })
}

async function toAdminUser(row: UserRow): Promise<AdminUser> {
  const [entry] = await toAdminUsers([row])
  if (!entry) throw new Error("Could not load the user.")
  return entry
}

/**
 * Lock the users table, then read the caller again: a demotion, or a
 * change to its groups, may have committed while this request waited for
 * the lock. The viewer it returns is the caller as the transaction sees
 * it, with the request's credential, so a token's narrowing still holds.
 * Every check inside the transaction judges with it, not `context.user`.
 */
async function lockAsHolder(
  tx: Tx,
  caller: Viewer,
  permission: Permission,
): Promise<{ actor: Viewer; state: AccessState }> {
  await lockUsers(tx)
  const [row] = await tx.select().from(user).where(eq(user.id, caller.id))
  // Through the transaction: see `readAccess`.
  const state = await readAccess(tx)
  if (!row) throw forbidden(permission)
  const actor: Viewer = {
    ...row,
    credential: caller.credential,
    clientName: caller.clientName,
    access: accessIn(state, row),
  }
  if (!can(actor, permission)) throw forbidden(permission)
  return { actor, state }
}

/**
 * The user, locked against other changes for the rest of the transaction,
 * with the caller and the groups as the transaction sees them.
 */
async function lockedUser(
  tx: Tx,
  id: string,
  caller: Viewer,
  permission: Permission,
): Promise<{ target: UserRow; actor: Viewer; state: AccessState }> {
  const { actor, state } = await lockAsHolder(tx, caller, permission)
  const [target] = await tx.select().from(user).where(eq(user.id, id))
  if (!target) throw notFound(USER_GONE)
  return { target, actor, state }
}

/**
 * Refuse a change to an admin's account by anyone who isn't one, so
 * nobody a group let manage accounts signs out, strips, or deletes an
 * admin. Only the role holds `all`, so the role says who is one. Among
 * everyone else `requireOwn` is the limit: an account's permissions move
 * only by the hand of someone who holds them. Their own account is
 * theirs.
 */
function requirePeer(actor: Viewer, target: UserRow): void {
  if (target.id === actor.id || can(actor, "all")) return
  if (target.role !== "admin") return
  throw new ORPCError("FORBIDDEN", {
    message: `${target.username} is an admin, and only an admin changes an admin's account.`,
  })
}

/** What is in one list and not the other. */
function changed<T>(before: readonly T[], after: readonly T[]): T[] {
  return [
    ...before.filter((entry) => !after.includes(entry)),
    ...after.filter((entry) => !before.includes(entry)),
  ]
}

/** Why the admin can't demote or delete `target`, the last admin left. */
function lastAdminMessage(
  target: UserRow,
  actorId: string,
  action: "demote" | "delete",
): string {
  const fix = "Make someone who can sign in an admin"
  if (target.id !== actorId) {
    return `${target.username} is the only admin who can sign in. ${fix} first.`
  }
  return action === "demote"
    ? `You're the only admin who can sign in. ${fix} before you step down.`
    : `You're the only admin who can sign in. ${fix} before you delete your account.`
}

export const adminUsers = {
  list: authed.admin.users.list.handler(async () =>
    toAdminUsers(await db.select().from(user).orderBy(asc(user.createdAt))),
  ),

  setRole: authed.admin.users.setRole.handler(async ({ context, input }) => {
    const row = await db.transaction(async (tx) => {
      const { target } = await lockedUser(tx, input.id, context.user, "all")
      if (target.role === input.role) return target
      if (
        target.role === "admin" &&
        !(await otherAdminCanSignIn(tx, target.id))
      ) {
        throw badRequest(lastAdminMessage(target, context.user.id, "demote"))
      }
      if (target.role === "admin") {
        await tx.delete(invite).where(eq(invite.createdBy, target.id))
      }
      // Sessions stay. Every request reads the role again, so the change
      // applies to the user's next one.
      const [updated] = await tx
        .update(user)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(user.id, target.id))
        .returning()
      if (!updated) throw notFound(USER_GONE)
      return updated
    })
    log.info(
      `${context.user.username} set ${row.username}'s role to ${row.role}`,
    )
    return toAdminUser(row)
  }),

  setAccess: authed.admin.users.setAccess.handler(
    async ({ context, input }) => {
      // The fields the form left out drop out of the stored override too.
      const override = overrideOf({ accessOverride: input.override })
      const row = await db.transaction(async (tx) => {
        const { target, actor, state } = await lockedUser(
          tx,
          input.id,
          context.user,
          "adminUser.update",
        )
        requirePeer(actor, target)
        // Moving the account between groups moves what they grant, and so
        // does what the override allows and denies.
        const before = overrideOf(target)
        requireOwn(actor, [
          ...groupPermissionsIn(
            state,
            changed(manualGroupIdsIn(state, target.id), input.groupIds),
          ),
          ...changed(before.allow ?? [], override.allow ?? []),
          ...changed(before.deny ?? [], override.deny ?? []),
        ])
        await setMemberships(tx, target.id, "manual", input.groupIds)
        const [updated] = await tx
          .update(user)
          .set({
            accessOverride: Object.keys(override).length > 0 ? override : null,
            accessOverrideSource: "manual",
            updatedAt: new Date(),
          })
          .where(eq(user.id, target.id))
          .returning()
        if (!updated) throw notFound(USER_GONE)
        return updated
      })
      forgetGroups()
      log.info(`${context.user.username} changed ${row.username}'s access`)
      return toAdminUser(row)
    },
  ),

  remove: authed.admin.users.remove.handler(async ({ context, input }) => {
    // Sessions, passkeys, linked accounts, and watch progress go with the
    // user through their foreign keys.
    const removed = await db.transaction(async (tx) => {
      const { target, actor } = await lockedUser(
        tx,
        input.id,
        context.user,
        "adminUser.delete",
      )
      requirePeer(actor, target)
      if (
        target.role === "admin" &&
        !(await otherAdminCanSignIn(tx, target.id))
      ) {
        throw badRequest(lastAdminMessage(target, context.user.id, "delete"))
      }
      await tx.delete(user).where(eq(user.id, target.id))
      return target
    })
    // Its memberships went with it.
    forgetGroups()
    log.info(`${context.user.username} deleted ${removed.username}`)
    await deleteAvatarFile(removed.avatarId)
    if (removed.id === context.user.id) await signOut(context.hono)
  }),

  signOut: authed.admin.users.signOut.handler(async ({ context, input }) => {
    const { target, ended } = await db.transaction(async (tx) => {
      const locked = await lockedUser(
        tx,
        input.id,
        context.user,
        "adminSession.delete",
      )
      requirePeer(locked.actor, locked.target)
      const self = locked.target.id === context.user.id
      return {
        target: locked.target,
        ended: await deleteUserSessions(
          locked.target.id,
          // An API token has no session to keep.
          self ? sessionIdOf(context.user) : undefined,
          tx,
        ),
      }
    })
    log.info(
      `${context.user.username} signed ${target.username} out of ${ended} sessions`,
    )
    return { ended }
  }),

  revokeApiTokens: authed.admin.users.revokeApiTokens.handler(
    async ({ context, input }) => {
      const { target, revoked } = await db.transaction(async (tx) => {
        const locked = await lockedUser(
          tx,
          input.id,
          context.user,
          "adminApiToken.delete",
        )
        requirePeer(locked.actor, locked.target)
        return {
          target: locked.target,
          revoked: await revokeUserApiTokens(locked.target.id, tx),
        }
      })
      log.info(
        `${context.user.username} revoked ${revoked} API tokens of ${target.username}`,
      )
      return { revoked }
    },
  ),
}
