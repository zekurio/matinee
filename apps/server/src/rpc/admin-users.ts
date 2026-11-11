import { type AdminUser, AccessOverride } from "@matinee/contracts"
import {
  invite,
  oidcAccount,
  passkey,
  session,
  user,
  type UserRow,
} from "@matinee/db"
import { asc, count, eq, inArray, max, sql } from "drizzle-orm"

import { describeAccess, forgetGroups, setMemberships } from "../access/groups"
import { deleteAvatarFile } from "../auth/avatars"
import { deleteUserSessions, publicUser, signOut } from "../auth/session"
import { lockUsers, otherAdminCanSignIn, type Tx } from "../auth/users"
import { db } from "../db"
import { log } from "../log"
import { admin, badRequest, forbidden, notFound } from "./base"

const USER_GONE = "That user no longer exists. Reload the list."

async function toAdminUsers(rows: UserRow[]): Promise<AdminUser[]> {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const [passkeys, accounts, sessions, access] = await Promise.all([
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
    describeAccess(rows),
  ])
  const passkeyCount = new Map(passkeys.map((row) => [row.userId, row.n]))
  const linked = new Map(accounts.map((row) => [row.userId, row]))
  const activity = new Map(sessions.map((row) => [row.userId, row]))
  return rows.flatMap((row) => {
    const described = access.get(row.id)
    if (!described) return []
    return [
      {
        ...publicUser(row),
        createdAt: row.createdAt,
        lastSeenAt: activity.get(row.id)?.lastSeenAt ?? null,
        passkeys: passkeyCount.get(row.id) ?? 0,
        oidcLinked: linked.has(row.id),
        sessions: activity.get(row.id)?.live ?? 0,
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
 * Lock the users table, then check the caller is still an admin: a demotion
 * may have committed while this request waited for the lock.
 */
async function lockAsAdmin(tx: Tx, actorId: string): Promise<void> {
  await lockUsers(tx)
  const [actor] = await tx
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, actorId))
  if (actor?.role !== "admin") throw forbidden()
}

/** The user, locked against other changes for the rest of the transaction. */
async function lockedUser(
  tx: Tx,
  id: string,
  actorId: string,
): Promise<UserRow> {
  await lockAsAdmin(tx, actorId)
  const [row] = await tx.select().from(user).where(eq(user.id, id))
  if (!row) throw notFound(USER_GONE)
  return row
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
  list: admin.admin.users.list.handler(async () =>
    toAdminUsers(await db.select().from(user).orderBy(asc(user.createdAt))),
  ),

  setRole: admin.admin.users.setRole.handler(async ({ context, input }) => {
    const row = await db.transaction(async (tx) => {
      const target = await lockedUser(tx, input.id, context.user.id)
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

  setAccess: admin.admin.users.setAccess.handler(async ({ context, input }) => {
    // The fields the form left out drop out of the stored override too.
    const override = AccessOverride.parse(input.override)
    const row = await db.transaction(async (tx) => {
      const target = await lockedUser(tx, input.id, context.user.id)
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
  }),

  remove: admin.admin.users.remove.handler(async ({ context, input }) => {
    // Sessions, passkeys, linked accounts, and watch progress go with the
    // user through their foreign keys.
    const removed = await db.transaction(async (tx) => {
      const target = await lockedUser(tx, input.id, context.user.id)
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

  signOut: admin.admin.users.signOut.handler(async ({ context, input }) => {
    const [target] = await db
      .select({ id: user.id, username: user.username })
      .from(user)
      .where(eq(user.id, input.id))
    if (!target) throw notFound(USER_GONE)
    const self = target.id === context.user.id
    const ended = await deleteUserSessions(
      target.id,
      self ? context.user.sessionId : undefined,
    )
    log.info(
      `${context.user.username} signed ${target.username} out of ${ended} sessions`,
    )
    return { ended }
  }),
}
