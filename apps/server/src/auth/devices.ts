import { randomInt } from "node:crypto"

import {
  type AppDevice,
  DEVICE_LINK_PAGE_PATH,
  type DeviceCode,
  type DeviceRequest,
  deviceLinkPagePath,
  formatUserCode,
  USER_CODE_LETTERS,
} from "@matinee/contracts"
import { deviceAuthorization } from "@matinee/db"
import { and, eq, gt, isNotNull, isNull, lt } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { cleanDeviceName } from "./session"
import { randomToken, sha256 } from "./tokens"

/*
 * Sign-in for apps without a browser, as in the OAuth device grant
 * (RFC 8628). The app shows a short user code; someone signed in enters it
 * at `/link` and approves; the app, polling with the secret device code,
 * then gets a session of its own.
 */

const CODE_TTL_MS = 10 * 60 * 1000
const POLL_INTERVAL_S = 5
const USER_CODE_LENGTH = 8

function randomUserCode(): string {
  let letters = ""
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    letters += USER_CODE_LETTERS.charAt(randomInt(USER_CODE_LETTERS.length))
  }
  return formatUserCode(letters)
}

export async function startDeviceSignIn(
  device: AppDevice,
): Promise<DeviceCode> {
  const now = new Date()
  // Opportunistic cleanup keeps the table small without a worker.
  await db
    .delete(deviceAuthorization)
    .where(lt(deviceAuthorization.expiresAt, now))
  const deviceCode = randomToken()
  // 20^8 codes make a clash with a live one rare. Pick again if it happens.
  for (let attempt = 0; attempt < 5; attempt++) {
    const userCode = randomUserCode()
    const [row] = await db
      .insert(deviceAuthorization)
      .values({
        deviceCodeHash: sha256(deviceCode),
        userCode,
        deviceName: cleanDeviceName(device.name),
        platform: device.platform,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      })
      .onConflictDoNothing({ target: deviceAuthorization.userCode })
      .returning({ id: deviceAuthorization.id })
    if (row) {
      return {
        deviceCode,
        userCode,
        verificationUri: `${env.PUBLIC_URL}${DEVICE_LINK_PAGE_PATH}`,
        verificationUriComplete: `${env.PUBLIC_URL}${deviceLinkPagePath(userCode)}`,
        expiresIn: CODE_TTL_MS / 1000,
        interval: POLL_INTERVAL_S,
      }
    }
  }
  throw new Error("Couldn't find a free user code.")
}

/** A code that is waiting for someone to approve it. */
function waiting(userCode: string) {
  return and(
    eq(deviceAuthorization.userCode, formatUserCode(userCode)),
    isNull(deviceAuthorization.userId),
    gt(deviceAuthorization.expiresAt, new Date()),
  )
}

export async function findDeviceRequest(
  userCode: string,
): Promise<DeviceRequest | null> {
  const [row] = await db
    .select()
    .from(deviceAuthorization)
    .where(waiting(userCode))
    .limit(1)
  if (!row) return null
  return {
    userCode: row.userCode,
    deviceName: row.deviceName,
    platform: row.platform,
    expiresAt: row.expiresAt,
  }
}

/** Sign the device in as `userId`. False when the code isn't waiting. */
export async function approveDeviceRequest(
  userCode: string,
  userId: string,
): Promise<boolean> {
  const approved = await db
    .update(deviceAuthorization)
    .set({ userId })
    .where(waiting(userCode))
    .returning({ id: deviceAuthorization.id })
  return approved.length > 0
}

/**
 * Who approved the device, once someone has, which uses the code up.
 * `pending` until then, and null for a code that expired or never was.
 */
export async function pollDeviceSignIn(
  deviceCode: string,
): Promise<{ userId: string; device: AppDevice } | "pending" | null> {
  const hash = sha256(deviceCode)
  const now = new Date()
  const [approved] = await db
    .delete(deviceAuthorization)
    .where(
      and(
        eq(deviceAuthorization.deviceCodeHash, hash),
        isNotNull(deviceAuthorization.userId),
        gt(deviceAuthorization.expiresAt, now),
      ),
    )
    .returning()
  if (approved?.userId) {
    return {
      userId: approved.userId,
      device: {
        name: approved.deviceName ?? undefined,
        platform: approved.platform,
      },
    }
  }
  const [pending] = await db
    .select({ id: deviceAuthorization.id })
    .from(deviceAuthorization)
    .where(
      and(
        eq(deviceAuthorization.deviceCodeHash, hash),
        gt(deviceAuthorization.expiresAt, now),
      ),
    )
    .limit(1)
  return pending ? "pending" : null
}
