import type { Passkey } from "@matinee/contracts"
import { passkey, type PasskeyRow } from "@matinee/db"
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { consumeChallenge, createChallenge } from "./challenges"
import type { Tx } from "./users"

const RP_NAME = "Matinee"
const RP_ID = new URL(env.PUBLIC_URL).hostname
const ORIGIN = env.PUBLIC_URL
const REGISTRATION_TTL_MS = 10 * 60 * 1000
const AUTHENTICATION_TTL_MS = 5 * 60 * 1000

const KNOWN_TRANSPORTS = new Set<string>([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
])

export class PasskeyError extends Error {}

export function publicPasskey(row: PasskeyRow): Passkey {
  return {
    id: row.id,
    name: row.name,
    backedUp: row.backedUp,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  }
}

async function registrationOptions(input: {
  userId: string
  username: string
  exclude: PasskeyRow[]
}) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(input.userId),
    userName: input.username,
    attestationType: "none",
    excludeCredentials: input.exclude.map((row) => ({
      id: row.credentialId,
      transports: row.transports ?? [],
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  })
}

/** Start creating an account whose first sign-in method is a passkey. */
export async function beginSignUp(input: { username: string; setup: boolean }) {
  const userId = crypto.randomUUID()
  const options = await registrationOptions({
    userId,
    username: input.username,
    exclude: [],
  })
  const challengeId = await createChallenge({
    purpose: "passkey-sign-up",
    challenge: options.challenge,
    payload: { userId, username: input.username, setup: input.setup },
    ttlMs: REGISTRATION_TTL_MS,
  })
  return { challengeId, options }
}

/**
 * Start adding a passkey to an existing account. `inviteId` marks a ceremony
 * an admin's link allows rather than a session, and only finishes as one.
 */
export async function beginRegister(input: {
  userId: string
  username: string
  inviteId?: string
}) {
  const exclude = await db
    .select()
    .from(passkey)
    .where(eq(passkey.userId, input.userId))
  const options = await registrationOptions({ ...input, exclude })
  const challengeId = await createChallenge({
    purpose: input.inviteId ? "passkey-invite" : "passkey-register",
    challenge: options.challenge,
    payload: { userId: input.userId, inviteId: input.inviteId ?? null },
    ttlMs: REGISTRATION_TTL_MS,
  })
  return { challengeId, options }
}

export type VerifiedRegistration = Awaited<
  ReturnType<typeof finishRegistration>
>

export async function finishRegistration(
  purpose: "passkey-sign-up" | "passkey-register" | "passkey-invite",
  challengeId: string,
  response: RegistrationResponseJSON,
) {
  const challenge = await consumeChallenge(challengeId, purpose)
  if (!challenge) {
    throw new PasskeyError("The passkey request expired. Try again.")
  }
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
  }).catch((cause: unknown) => {
    throw new PasskeyError(
      cause instanceof Error ? cause.message : "Passkey check failed.",
    )
  })
  if (!verification.verified) {
    throw new PasskeyError("The passkey could not be verified.")
  }
  return {
    payload: challenge.payload,
    info: verification.registrationInfo,
    transports: (response.response.transports ?? []).filter((t) =>
      KNOWN_TRANSPORTS.has(t),
    ),
  }
}

export async function storePasskey(
  tx: Tx | typeof db,
  input: {
    userId: string
    verified: VerifiedRegistration
    name?: string | null
    /** The passkey also signed the user in, as at sign-up. */
    usedNow?: boolean
  },
): Promise<PasskeyRow> {
  const { credential, credentialDeviceType, credentialBackedUp } =
    input.verified.info
  const [row] = await tx
    .insert(passkey)
    .values({
      userId: input.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: input.verified.transports,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: input.name ?? null,
      lastUsedAt: input.usedNow ? new Date() : null,
    })
    .returning()
  if (!row) throw new Error("Could not store the passkey.")
  return row
}

export async function beginSignIn() {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "required",
  })
  const challengeId = await createChallenge({
    purpose: "passkey-sign-in",
    challenge: options.challenge,
    payload: {},
    ttlMs: AUTHENTICATION_TTL_MS,
  })
  return { challengeId, options }
}

/** Verify a discoverable-credential sign-in. Returns the account's id. */
export async function finishSignIn(
  challengeId: string,
  response: AuthenticationResponseJSON,
): Promise<string> {
  const challenge = await consumeChallenge(challengeId, "passkey-sign-in")
  if (!challenge) {
    throw new PasskeyError("The sign-in request expired. Try again.")
  }
  const [row] = await db
    .select()
    .from(passkey)
    .where(eq(passkey.credentialId, response.id))
    .limit(1)
  if (!row) {
    throw new PasskeyError("This passkey isn't registered with Matinee.")
  }
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: row.credentialId,
      publicKey: new Uint8Array(Buffer.from(row.publicKey, "base64url")),
      counter: row.counter,
      transports: row.transports ?? [],
    },
    requireUserVerification: true,
  }).catch((cause: unknown) => {
    throw new PasskeyError(
      cause instanceof Error ? cause.message : "Passkey check failed.",
    )
  })
  if (!verification.verified) {
    throw new PasskeyError("The passkey could not be verified.")
  }
  await db
    .update(passkey)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(passkey.id, row.id))
  return row.userId
}
