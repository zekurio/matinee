import { authChallenge, type ChallengePayload } from "@matinee/db"
import { and, eq, gt, lt } from "drizzle-orm"

import { db } from "../db"

export type ChallengePurpose =
  | "passkey-sign-in"
  | "passkey-sign-up"
  | "passkey-register"
  | "oidc"

export async function createChallenge(input: {
  purpose: ChallengePurpose
  challenge: string
  payload: ChallengePayload
  ttlMs: number
}): Promise<string> {
  // Opportunistic cleanup keeps the table small without a worker.
  await db.delete(authChallenge).where(lt(authChallenge.expiresAt, new Date()))
  const [row] = await db
    .insert(authChallenge)
    .values({
      purpose: input.purpose,
      challenge: input.challenge,
      payload: input.payload,
      expiresAt: new Date(Date.now() + input.ttlMs),
    })
    .returning({ id: authChallenge.id })
  if (!row) throw new Error("Could not store the challenge.")
  return row.id
}

/** Delete and return an unexpired challenge. Each one works once. */
export async function consumeChallenge(id: string, purpose: ChallengePurpose) {
  const [row] = await db
    .delete(authChallenge)
    .where(
      and(
        eq(authChallenge.id, id),
        eq(authChallenge.purpose, purpose),
        gt(authChallenge.expiresAt, new Date()),
      ),
    )
    .returning()
  return row ?? null
}
