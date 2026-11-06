import { type InviteKind, invitePagePath } from "@matinee/contracts"
import { invite, type InviteRow, user } from "@matinee/db"
import { and, eq, gt, lt, or } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { randomToken, sha256 } from "./tokens"
import type { Tx } from "./users"

/*
 * Invite and recovery links. The token is the only proof the link carries,
 * so it gets the treatment of a session token: 32 random bytes, only its
 * SHA-256 in the database, and the plain token shown to the admin once.
 * Opening the page reads the link without using it, so a chat app that
 * fetches the URL for a preview can't burn it. Only a finished passkey
 * ceremony or OIDC round trip uses it up.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const INVITE_GONE =
  "This link expired or was already used. Ask your admin for a new one."

/** The URL to hand over. Built from PUBLIC_URL, never the request. */
export function inviteUrl(token: string): string {
  return `${env.PUBLIC_URL}${invitePagePath(token)}`
}

/**
 * Make a link for the user. It replaces the user's earlier links, so only
 * the newest one works. Returns the token, which nothing stores.
 */
export async function issueInvite(
  tx: Tx,
  input: { userId: string; kind: InviteKind; createdBy: string },
): Promise<{ row: InviteRow; token: string }> {
  // Opportunistic cleanup, as for challenges.
  await tx
    .delete(invite)
    .where(
      or(eq(invite.userId, input.userId), lt(invite.expiresAt, new Date())),
    )
  const token = randomToken()
  const [row] = await tx
    .insert(invite)
    .values({
      tokenHash: sha256(token),
      userId: input.userId,
      kind: input.kind,
      createdBy: input.createdBy,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning()
  if (!row) throw new Error("Could not store the link.")
  return { row, token }
}

/** The unexpired link a token belongs to, with its account. */
export async function findInvite(token: string) {
  const [row] = await db
    .select({ invite, user })
    .from(invite)
    .innerJoin(user, eq(user.id, invite.userId))
    .where(
      and(
        eq(invite.tokenHash, sha256(token)),
        gt(invite.expiresAt, new Date()),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * Delete and return an unexpired link. Call it in the transaction that adds
 * the sign-in method, so a failure leaves the link working and two tabs
 * can't both use it.
 */
export async function consumeInvite(
  tx: Tx,
  id: string,
): Promise<InviteRow | null> {
  const [row] = await tx
    .delete(invite)
    .where(and(eq(invite.id, id), gt(invite.expiresAt, new Date())))
    .returning()
  return row ?? null
}
