import {
  type CreatedInvite,
  type Invite,
  type InviteInput,
  invitePagePath,
} from "@matinee/contracts"
import { accessGroup, invite, inviteGroup, user } from "@matinee/db"
import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm"

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

export async function createInvite(
  createdBy: string,
  input: InviteInput,
): Promise<CreatedInvite | null> {
  const token = randomToken()
  const row = await db.transaction(async (tx) => {
    // Serialize with demotion: a request that passed middleware before its
    // creator lost the role must not leave a new link behind afterwards.
    await lockUsers(tx)
    const [creator] = await tx
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, createdBy))
    if (creator?.role !== "admin") return null
    await tx.delete(invite).where(lte(invite.expiresAt, new Date()))
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

/** Check without using the link up or exposing its hash. */
export async function findInvite(token: string) {
  const [row] = await db
    .select({ id: invite.id, expiresAt: invite.expiresAt })
    .from(invite)
    .where(
      and(
        eq(invite.tokenHash, sha256(token)),
        gt(invite.expiresAt, new Date()),
      ),
    )
  return row ?? null
}

/** Call under lockUsers, in the transaction that creates the account. */
export async function consumeInvite(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx
    .delete(invite)
    .where(and(eq(invite.id, id), gt(invite.expiresAt, sql`now()`)))
    .returning({ id: invite.id })
  return rows.length > 0
}
