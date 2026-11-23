import { randomBytes } from "node:crypto"
import { createReadStream } from "node:fs"
import {
  access,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"

import type { AvatarSource } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { oidcAccount, user, type UserRow } from "@matinee/db"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { Hono } from "hono"

import { db } from "../db"
import { env } from "../env"
import { ShownError } from "../errors"
import { defineQueue } from "../jobs/queue"
import { log } from "../log"
import { sniffImage } from "../media/artwork"
import { processFailureKind, run } from "../media/process"
import { readSession } from "./session"

const SIZE = 256

const dir = join(env.dataDir, "avatars")

type Format = "jpg" | "png"

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
} satisfies Record<Format, string>

/** A failure the user can act on, such as a file that isn't an image. */
export class AvatarError extends ShownError {}

/**
 * The `picture` claim as a URL clients may load. The ID token is signed by
 * the provider the admin set up, and userinfo comes from it over TLS, so
 * this is the provider's URL, not one a client sent. The server never
 * fetches it. Only http and https, written out with `://`.
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
 * Point the user at a new avatar and delete the old upload. `avatarId` names
 * an upload and `avatarUrl` a provider's picture; at most one is set.
 * Returns null when the user is gone.
 */
async function setAvatar(
  userId: string,
  next: AvatarState,
): Promise<UserRow | null> {
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .for("update")
    if (!row) return null
    const [updated] = await tx
      .update(user)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning()
    return updated ? { updated, old: row.avatarId } : null
  })
  if (!result) {
    await deleteFile(next.avatarId)
    return null
  }
  if (result.old !== next.avatarId) await deleteFile(result.old)
  return result.updated
}

/** Uploaded profile pictures, scaled and re-encoded a couple at a time. */
const avatars = defineQueue<{ key: string; bytes: Uint8Array }, string>({
  id: "avatars",
  name: "Profile pictures",
  description: "Crop and scale the pictures people upload.",
  concurrency: 2,
  key: (job) => job.key,
  label: () => "an upload",
  run: (job) => encode(job.bytes),
})

/**
 * Remember the picture a provider sent at sign-in and, for users who follow
 * it, show it. `picture` is undefined when the provider couldn't say, which
 * keeps what was stored, and null when it has none. Never fails.
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
    await db.transaction(async (tx) => {
      await tx
        .update(oidcAccount)
        .set({ picture })
        .where(
          and(
            eq(oidcAccount.issuer, account.issuer),
            eq(oidcAccount.subject, account.subject),
          ),
        )
      await tx
        .update(user)
        .set({ avatarUrl: picture, updatedAt: new Date() })
        .where(
          and(
            eq(user.id, account.userId),
            eq(user.avatarSource, "provider"),
            sql`${user.avatarUrl} IS DISTINCT FROM ${picture}`,
          ),
        )
    })
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
    { key: randomBytes(16).toString("hex"), bytes },
    { priority: "high" },
  )
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
  return setAvatar(userId, {
    avatarId: null,
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

/**
 * Delete the files no user points at: copies of provider pictures from
 * before clients loaded those themselves, and an upload's leftovers from a
 * crash. Only at startup, before any upload can be under way.
 */
export async function sweepAvatars(): Promise<void> {
  try {
    const names = await readdir(dir).catch(() => [])
    if (!names.length) return
    const rows = await db
      .select({ avatarId: user.avatarId })
      .from(user)
      .where(isNotNull(user.avatarId))
    const kept = new Set(rows.map((row) => row.avatarId))
    const stale = names.filter((name) => {
      const match = /^([0-9a-f]{32})\.(jpg|png)$/.exec(name)
      return !match || !kept.has(match[1] ?? "")
    })
    await Promise.all(stale.map((name) => rm(join(dir, name), { force: true })))
    if (stale.length) log.info(`Deleted ${stale.length} unused avatar files`)
  } catch (cause) {
    log.warn("Couldn't clean up the avatar files", cause)
  }
}

/** For deleted accounts, whose row is already gone. */
export function deleteAvatarFile(id: string | null): Promise<void> {
  return deleteFile(id)
}

export const avatarRoutes = new Hono()

avatarRoutes.get("/:id", async (c) => {
  if (!(await readSession(c, "profile.read"))) return c.body(null, 401)
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
