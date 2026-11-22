import {
  type CreatedInvite,
  holdsPermission,
  type Invite,
  type InviteInput,
  invitePagePath,
  type Permission,
} from "@matinee/contracts"
import {
  accessGroup,
  invite,
  inviteGroup,
  user,
  type UserRow,
} from "@matinee/db"
import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm"

import {
  accessIn,
  accessOf,
  groupPermissions,
  groupPermissionsIn,
  inviteGroupIds,
  readAccess,
} from "../access/groups"
import type { Access } from "../access/policy"
import { db } from "../db"
import { env } from "../env"
import { randomToken, sha256 } from "./tokens"
import { lockUsers, type Tx } from "./users"

export const INVITE_GONE =
  "This invite link doesn't work. It may have expired, or been used already."

const publicColumns = {
  id: invite.id,
  label: invite.label,
  createdAt: invite.createdAt,
  expiresAt: invite.expiresAt,
}

/**
 * Whether a link still works for its maker: they may invite, and they
 * hold everything its groups grant now. A group can gain a permission
 * after the link was made, and the link must not hand on what its maker
 * never held. Account permissions only, as nobody's token is involved.
 */
function makerMayGrant(maker: Access, granted: readonly Permission[]): boolean {
  return (
    holdsPermission(maker.permissions, "invite.create") &&
    granted.every((permission) =>
      holdsPermission(maker.permissions, permission),
    )
  )
}

async function mayInvite(creator: UserRow, inviteId: string): Promise<boolean> {
  const groupIds = await inviteGroupIds(db, inviteId)
  return makerMayGrant(
    await accessOf(creator),
    await groupPermissions(groupIds),
  )
}

/**
 * Make an invite. `allow` sees the maker's access and what the chosen
 * groups grant as the transaction reads them, under `lockUsers`, and
 * throws to refuse. Null when the maker may no longer invite.
 */
export async function createInvite(
  createdBy: string,
  input: InviteInput,
  allow: (maker: Access, granted: Permission[]) => void,
): Promise<CreatedInvite | null> {
  const token = randomToken()
  const row = await db.transaction(async (tx) => {
    // Serialize with demotion: a request that passed middleware before its
    // creator lost the permission must not leave a new link behind
    // afterwards.
    await lockUsers(tx)
    const [creator] = await tx.select().from(user).where(eq(user.id, createdBy))
    if (!creator) return null
    // Through the transaction: see `readAccess`.
    const state = await readAccess(tx)
    const maker = accessIn(state, creator)
    if (!holdsPermission(maker.permissions, "invite.create")) return null
    await tx.delete(invite).where(lte(invite.expiresAt, new Date()))
    // Groups deleted since the form loaded, and the built-in one, drop out.
    const groups =
      input.groupIds.length > 0
        ? await tx
            .select({ id: accessGroup.id, name: accessGroup.name })
            .from(accessGroup)
            .where(
              and(
                inArray(accessGroup.id, input.groupIds),
                eq(accessGroup.everyone, false),
              ),
            )
            .orderBy(asc(accessGroup.name))
        : []
    // The link puts whoever uses it in these groups, with what they grant.
    allow(
      maker,
      groupPermissionsIn(
        state,
        groups.map((group) => group.id),
      ),
    )
    const [created] = await tx
      .insert(invite)
      .values({
        tokenHash: sha256(token),
        label: input.label?.trim() || null,
        createdBy,
        expiresAt: new Date(Date.now() + input.expiresInDays * 86400000),
      })
      .returning(publicColumns)
    if (!created) throw new Error("Could not store the invite.")
    if (groups.length > 0) {
      await tx
        .insert(inviteGroup)
        .values(
          groups.map((group) => ({ inviteId: created.id, groupId: group.id })),
        )
    }
    return { ...created, groups }
  })
  return row
    ? { ...row, url: `${env.PUBLIC_URL}${invitePagePath(token)}` }
    : null
}

export async function listInvites(): Promise<Invite[]> {
  const rows = await db
    .select(publicColumns)
    .from(invite)
    .where(gt(invite.expiresAt, new Date()))
    .orderBy(desc(invite.createdAt))
  if (rows.length === 0) return []
  const groups = await db
    .select({
      inviteId: inviteGroup.inviteId,
      id: accessGroup.id,
      name: accessGroup.name,
    })
    .from(inviteGroup)
    .innerJoin(accessGroup, eq(accessGroup.id, inviteGroup.groupId))
    .where(
      inArray(
        inviteGroup.inviteId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(accessGroup.name))
  return rows.map((row) => ({
    ...row,
    groups: groups
      .filter((group) => group.inviteId === row.id)
      .map(({ id, name }) => ({ id, name })),
  }))
}

export async function revokeInvite(id: string): Promise<boolean> {
  const rows = await db
    .delete(invite)
    .where(eq(invite.id, id))
    .returning({ id: invite.id })
  return rows.length > 0
}

/**
 * Check without using the link up or exposing its hash. A link whose
 * maker may no longer invite, or no longer holds what its groups grant,
 * doesn't work, as if it had been revoked.
 */
export async function findInvite(token: string) {
  const [row] = await db
    .select({ id: invite.id, expiresAt: invite.expiresAt, creator: user })
    .from(invite)
    .innerJoin(user, eq(user.id, invite.createdBy))
    .where(
      and(
        eq(invite.tokenHash, sha256(token)),
        gt(invite.expiresAt, new Date()),
      ),
    )
  if (!row || !(await mayInvite(row.creator, row.id))) return null
  return { id: row.id, expiresAt: row.expiresAt }
}

/**
 * Call under lockUsers, in the transaction that creates the account.
 * False too when its maker lost the right to invite, or a permission its
 * groups grant, since the sign-up began.
 */
export async function consumeInvite(tx: Tx, id: string): Promise<boolean> {
  const [made] = await tx
    .select({ creator: user })
    .from(invite)
    .innerJoin(user, eq(user.id, invite.createdBy))
    .where(eq(invite.id, id))
  if (!made) return false
  // Through the transaction: see `readAccess`.
  const state = await readAccess(tx)
  const granted = groupPermissionsIn(state, await inviteGroupIds(tx, id))
  if (!makerMayGrant(accessIn(state, made.creator), granted)) return false
  const rows = await tx
    .delete(invite)
    .where(and(eq(invite.id, id), gt(invite.expiresAt, sql`now()`)))
    .returning({ id: invite.id })
  return rows.length > 0
}
