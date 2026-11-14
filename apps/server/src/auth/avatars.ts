import { randomBytes } from "node:crypto"
import { createReadStream } from "node:fs"
import { access, mkdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"
import { setTimeout as sleep } from "node:timers/promises"

import type { AvatarSource } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { oidcAccount, user, type UserRow } from "@matinee/db"
import { and, eq, isNotNull } from "drizzle-orm"
import { Hono } from "hono"

import { db } from "../db"
import { env } from "../env"
import { defineQueue } from "../jobs/queue"
import { log } from "../log"
import { fetchImage, sniffImage } from "../media/artwork"
import { processFailureKind, run } from "../media/process"
import {
  ANY_PUBLIC_HOST,
  ruleForAddress,
  type HostRule,
} from "../net/guarded-fetch"
import { activeOidc } from "./oidc-settings"
import { readSession } from "./session"

const SIZE = 256
// How long a sign-in waits for the provider's picture before going on
// without it. The download keeps going and lands on a later page load.
const SIGN_IN_WAIT_MS = 2000

const dir = join(env.dataDir, "avatars")

type Format = "jpg" | "png"

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
} satisfies Record<Format, string>

/** A failure the user can act on, such as a file that isn't an image. */
export class AvatarError extends Error {}

/**
 * The `picture` claim as a URL the server may fetch. The ID token is signed
 * by the provider the admin set up, and userinfo comes from it over TLS, so
 * this is the provider's URL, not one a client sent. Only http and https,
 * written out with `://`.
 */
export const PictureUrl = t
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => /^https?:\/\//i.test(value) && URL.canParse(value),
    "Invalid URL",
  )
  // The URL parser skips tabs and newlines, so the value does too.
  .transform((value) => value.replaceAll(/[\t\n\r]/g, ""))

function filePath(id: string, format: Format): string {
  return join(dir, `${id}.${format}`)
}

async function findFile(
  id: string,
): Promise<{ path: string; format: Format } | null> {
  for (const format of ["jpg", "png"] as const) {
    const path = filePath(id, format)
    const found = await access(path).then(
      () => true,
      () => false,
    )
    if (found) return { path, format }
  }
  return null
}

async function deleteFile(id: string | null): Promise<void> {
  if (!id) return
  await Promise.all(
    (["jpg", "png"] as const).map((format) =>
      rm(filePath(id, format), { force: true }),
    ),
  ).catch((cause: unknown) => {
    log.warn(`Couldn't delete avatar ${id}`, cause)
  })
}

/**
 * Crop the image to a centred square, scale it to 256px, and store it under
 * a new id. Re-encoding drops EXIF and other metadata. JPEGs stay JPEG; the
 * rest become PNG, which keeps transparency.
 */
async function encode(bytes: Uint8Array): Promise<string> {
  const format = sniffImage(bytes)
  if (!format) throw new AvatarError("Pick a JPEG, PNG, or WebP image.")
  const id = randomBytes(16).toString("hex")
  const out = format === "jpg" ? "jpg" : "png"
  await mkdir(dir, { recursive: true })
  const input = join(dir, `${id}.${process.pid}.in.${format}`)
  const tmp = join(dir, `${id}.${process.pid}.tmp.${out}`)
  try {
    await writeFile(input, bytes)
    await run(env.MATINEE_FFMPEG_PATH, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      input,
      "-frames:v",
      "1",
      "-map_metadata",
      "-1",
      "-vf",
      `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=increase,crop=${SIZE}:${SIZE}`,
      ...(out === "jpg" ? ["-q:v", "3"] : []),
      "-y",
      tmp,
    ])
    await rename(tmp, filePath(id, out))
    return id
  } catch (cause) {
    await rm(tmp, { force: true })
    // ffmpeg exiting with an error means it couldn't decode the file.
    if (processFailureKind(cause) === "exit") {
      throw new AvatarError("Couldn't read that image. Try another file.")
    }
    throw cause
  } finally {
    await rm(input, { force: true })
  }
}

type AvatarState = {
  avatarId: string | null
  avatarSource: AvatarSource
  avatarUrl: string | null
}

/**
 * Point the user at a new avatar and delete the old file. With `expect`, the
 * change only applies while the user's avatar is still the provider's
 * picture `expect` names, so a slow download can't replace an upload made
 * meanwhile. Returns null when the user is gone or `expect` didn't hold.
 */
async function setAvatar(
  userId: string,
  next: AvatarState,
  expect?: { avatarId: string | null },
): Promise<UserRow | null> {
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .for("update")
    if (!row) return null
    if (
      expect &&
      (row.avatarSource !== "provider" || row.avatarId !== expect.avatarId)
    ) {
      return null
    }
    const [updated] = await tx
      .update(user)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning()
    return updated ? { updated, old: row.avatarId } : null
  })
  if (!result) {
    if (next.avatarId !== expect?.avatarId) await deleteFile(next.avatarId)
    return null
  }
  if (result.old !== next.avatarId) await deleteFile(result.old)
  return result.updated
}

/**
 * An avatar to make: an uploaded image, the provider's picture at `url`,
 * or the sync of a user who follows the provider's picture.
 */
type AvatarJob =
  | { kind: "upload"; key: string; bytes: Uint8Array }
  | { kind: "fetch"; key: string; url: string }
  | { kind: "sync"; key: string; userId: string; url: string }

/**
 * Where a provider's picture may come from: any public https host, and the
 * sign-in provider an admin set up, which often sits on the local network
 * or a tailnet and serves its own pictures.
 */
async function pictureHosts(): Promise<HostRule[]> {
  const provider = await activeOidc()
  const issuer = provider && ruleForAddress(provider.settings.issuerUrl)
  return issuer ? [issuer, ANY_PUBLIC_HOST] : [ANY_PUBLIC_HOST]
}

/** Take the provider's picture if the user follows it and it changed. */
async function sync(userId: string, url: string): Promise<void> {
  const [row] = await db
    .select({
      avatarId: user.avatarId,
      avatarSource: user.avatarSource,
      avatarUrl: user.avatarUrl,
    })
    .from(user)
    .where(eq(user.id, userId))
  if (!row || row.avatarSource !== "provider") return
  if (row.avatarId && row.avatarUrl === url) return
  const id = await encode((await fetchImage(url, await pictureHosts())).bytes)
  await setAvatar(
    userId,
    { avatarId: id, avatarSource: "provider", avatarUrl: url },
    { avatarId: row.avatarId },
  )
}

/** Profile pictures, scaled and re-encoded a couple at a time. */
const avatars = defineQueue<AvatarJob, string | null>({
  id: "avatars",
  name: "Profile pictures",
  description:
    "Crop and scale uploads and the pictures sign-in providers send.",
  concurrency: 2,
  key: (job) => job.key,
  label: (job) => (job.kind === "upload" ? "an upload" : job.url),
  run: async (job) => {
    switch (job.kind) {
      case "upload":
        return encode(job.bytes)
      case "fetch":
        return encode((await fetchImage(job.url, await pictureHosts())).bytes)
      case "sync":
        await sync(job.userId, job.url)
        return null
    }
  },
})

async function providerAvatar(url: string): Promise<string> {
  const id = await avatars.run({ kind: "fetch", key: `fetch-${url}`, url })
  // Only a sync answers null.
  if (!id) throw new AvatarError("Couldn't read that image. Try another file.")
  return id
}

/** The user's sync with the provider's picture. One per user at a time. */
async function syncProviderAvatar(userId: string, url: string): Promise<void> {
  await avatars.run({ kind: "sync", key: `sync-${userId}`, userId, url })
}

/**
 * Remember the picture a provider sent at sign-in and, for users who follow
 * it, use it. `picture` is undefined when the provider couldn't say, which
 * keeps what was stored. Waits briefly for the download, never fails.
 */
export async function recordProviderPicture(account: {
  issuer: string
  subject: string
  userId: string
  picture: string | null | undefined
}): Promise<void> {
  const { picture } = account
  if (picture === undefined) return
  try {
    await db
      .update(oidcAccount)
      .set({ picture })
      .where(
        and(
          eq(oidcAccount.issuer, account.issuer),
          eq(oidcAccount.subject, account.subject),
        ),
      )
    if (!picture) return
    const sync = syncProviderAvatar(account.userId, picture).catch(
      (cause: unknown) => {
        log.warn(`Couldn't load the OIDC picture ${picture}`, cause)
      },
    )
    await Promise.race([sync, sleep(SIGN_IN_WAIT_MS)])
  } catch (cause) {
    log.warn("Couldn't record the OIDC picture", cause)
  }
}

/** Store an uploaded picture as the user's avatar. */
export async function uploadAvatar(
  userId: string,
  bytes: Uint8Array,
): Promise<UserRow | null> {
  const id = await avatars.run(
    { kind: "upload", key: randomBytes(16).toString("hex"), bytes },
    { priority: "high" },
  )
  if (!id) return null
  return setAvatar(userId, {
    avatarId: id,
    avatarSource: "upload",
    avatarUrl: null,
  })
}

/** Switch to the picture of the user's linked account, if it sent one. */
export async function followProviderAvatar(
  userId: string,
): Promise<UserRow | null> {
  const [account] = await db
    .select({ picture: oidcAccount.picture })
    .from(oidcAccount)
    .where(and(eq(oidcAccount.userId, userId), isNotNull(oidcAccount.picture)))
  const url = account?.picture
  if (!url) {
    throw new AvatarError(
      "Your provider hasn't sent a picture. Sign in with it once to fetch it.",
    )
  }
  const [current] = await db.select().from(user).where(eq(user.id, userId))
  if (!current) return null
  // Only the provider's picture keeps its URL, so this is it already.
  if (current.avatarId && current.avatarUrl === url) return current
  const id = await providerAvatar(url).catch((cause: unknown) => {
    if (cause instanceof AvatarError) throw cause
    log.warn(`Couldn't load the OIDC picture ${url}`, cause)
    throw new AvatarError(
      "Couldn't load the picture from your provider. Try again later.",
    )
  })
  return setAvatar(userId, {
    avatarId: id,
    avatarSource: "provider",
    avatarUrl: url,
  })
}

/** Show the initial and stop following the provider's picture. */
export function removeAvatar(userId: string): Promise<UserRow | null> {
  return setAvatar(userId, {
    avatarId: null,
    avatarSource: "none",
    avatarUrl: null,
  })
}

/** For deleted accounts, whose row is already gone. */
export function deleteAvatarFile(id: string | null): Promise<void> {
  return deleteFile(id)
}

export const avatarRoutes = new Hono()

avatarRoutes.get("/:id", async (c) => {
  if (!(await readSession(c))) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f]{32}$/.test(id)) return c.body(null, 404)
  const file = await findFile(id)
  if (!file) return c.body(null, 404)
  const info = await stat(file.path)
  return c.body(
    // SAFETY: A file read stream without an encoding yields Buffers, which
    // are Uint8Arrays.
    Readable.toWeb(createReadStream(file.path)) as ReadableStream<Uint8Array>,
    200,
    {
      "Content-Type": CONTENT_TYPES[file.format],
      "Content-Length": String(info.size),
      // A new picture gets a new id, so the file behind one never changes.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  )
})
