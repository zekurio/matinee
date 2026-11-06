import type { AdminUser, InviteLink } from "@matinee/contracts"
import {
  invite,
  type InviteRow,
  oidcAccount,
  passkey,
  session,
  user,
  type UserRow,
} from "@matinee/db"
import { and, asc, count, desc, eq, gt, inArray, max, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { inviteUrl, issueInvite } from "../auth/invites"
import { deleteUserSessions, publicUser, signOut } from "../auth/session"
import {
  insertUser,
  lockUsers,
  otherAdminCanSignIn,
  type Tx,
  usernameTaken,
} from "../auth/users"
import { db } from "../db"
import { log } from "../log"
import { admin, badRequest, forbidden, notFound } from "./base"

const USER_GONE = "That user no longer exists. Reload the list."

const creator = alias(user, "creator")

function publicLink(row: InviteRow, createdBy: string | null): InviteLink {
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    createdBy,
  }
}

async function toAdminUsers(rows: UserRow[]): Promise<AdminUser[]> {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const [passkeys, accounts, sessions, links] = await Promise.all([
    db
      .select({ userId: passkey.userId, n: count() })
      .from(passkey)
      .where(inArray(passkey.userId, ids))
      .groupBy(passkey.userId),
    db
      .select({ userId: oidcAccount.userId, n: count() })
      .from(oidcAccount)
      .where(inArray(oidcAccount.userId, ids))
      .groupBy(oidcAccount.userId),
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
      .select({ invite, createdBy: creator.username })
      .from(invite)
      .leftJoin(creator, eq(creator.id, invite.createdBy))
      .where(and(inArray(invite.userId, ids), gt(invite.expiresAt, new Date())))
      .orderBy(desc(invite.createdAt)),
  ])
  const passkeyCount = new Map(passkeys.map((row) => [row.userId, row.n]))
  const accountCount = new Map(accounts.map((row) => [row.userId, row.n]))
  const activity = new Map(sessions.map((row) => [row.userId, row]))
  return rows.map((row) => ({
    ...publicUser(row),
    createdAt: row.createdAt,
    lastSeenAt: activity.get(row.id)?.lastSeenAt ?? null,
    passkeys: passkeyCount.get(row.id) ?? 0,
    oidcAccounts: accountCount.get(row.id) ?? 0,
    sessions: activity.get(row.id)?.live ?? 0,
    links: links
      .filter((link) => link.invite.userId === row.id)
      .map((link) => publicLink(link.invite, link.createdBy)),
  }))
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

/** A passkey or linked account, whether or not single sign-on is on. */
async function hasSignInMethod(tx: Tx, userId: string): Promise<boolean> {
  const [key] = await tx
    .select({ id: passkey.id })
    .from(passkey)
    .where(eq(passkey.userId, userId))
    .limit(1)
  if (key) return true
  const [account] = await tx
    .select({ id: oidcAccount.id })
    .from(oidcAccount)
    .where(eq(oidcAccount.userId, userId))
    .limit(1)
  return account !== undefined
}

export const adminUsers = {
  list: admin.admin.users.list.handler(async () =>
    toAdminUsers(await db.select().from(user).orderBy(asc(user.createdAt))),
  ),

  create: admin.admin.users.create.handler(async ({ context, input }) => {
    const { row, issued } = await db.transaction(async (tx) => {
      await lockAsAdmin(tx, context.user.id)
      if (await usernameTaken(input.username, tx)) {
        throw badRequest("That username is taken. Pick another.")
      }
      const created = await insertUser(tx, {
        username: input.username,
        role: input.role,
      })
      const link = await issueInvite(tx, {
        userId: created.id,
        kind: "invite",
        createdBy: context.user.id,
      })
      return { row: created, issued: link }
    })
    log.info(
      `${context.user.username} created ${row.role} ${row.username} with an invite link`,
    )
    return {
      user: await toAdminUser(row),
      link: publicLink(issued.row, context.user.username),
      url: inviteUrl(issued.token),
    }
  }),

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

  remove: admin.admin.users.remove.handler(async ({ context, input }) => {
    // Sessions, passkeys, linked accounts, links, and watch progress go with
    // the user through their foreign keys.
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
    log.info(`${context.user.username} deleted ${removed.username}`)
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

  links: {
    create: admin.admin.users.links.create.handler(
      async ({ context, input }) => {
        const { target, issued } = await db.transaction(async (tx) => {
          // Holds off a delete of the user until the link is stored, and a
          // second link request until this one has replaced the old links.
          const [row] = await tx
            .select()
            .from(user)
            .where(eq(user.id, input.userId))
            .for("no key update")
          if (!row) throw notFound(USER_GONE)
          const kind = (await hasSignInMethod(tx, row.id))
            ? "recovery"
            : "invite"
          const link = await issueInvite(tx, {
            userId: row.id,
            kind,
            createdBy: context.user.id,
          })
          return { target: row, issued: link }
        })
        log.info(
          `${context.user.username} made a ${issued.row.kind} link for ${target.username}`,
        )
        return {
          link: publicLink(issued.row, context.user.username),
          url: inviteUrl(issued.token),
        }
      },
    ),

    revoke: admin.admin.users.links.revoke.handler(async ({ input }) => {
      const deleted = await db
        .delete(invite)
        .where(eq(invite.id, input.id))
        .returning({ id: invite.id })
      if (deleted.length === 0) {
        throw notFound("That link was already used or revoked.")
      }
    }),
  },
}
