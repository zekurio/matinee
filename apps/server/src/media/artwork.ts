import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { access, mkdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"

import type { ArtworkSize } from "@matinee/contracts"
import { artwork } from "@matinee/db"
import { eq } from "drizzle-orm"
import { Hono } from "hono"

import { readSession } from "../auth/session"
import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { limiter, run } from "./process"

const WIDTHS = { small: 480, large: 1920 } satisfies Record<ArtworkSize, number>
const MAX_BYTES = 25 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 30_000
// A URL that failed is left alone for this long before trying again.
const RETRY_AFTER_MS = 10 * 60 * 1000

const dir = join(env.dataDir, "artwork")
const withDownload = limiter(6)
const withResize = limiter(3)
const inflight = new Map<string, Promise<Cached | null>>()
const failedAt = new Map<string, number>()

type Format = "jpg" | "png" | "webp"
type Cached = { path: string; format: Format }

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} satisfies Record<Format, string>

export function artworkId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32)
}

type Executor = Pick<typeof db, "insert">

/**
 * Remember remote image URLs and return their artwork ids. The server only
 * ever downloads URLs stored here.
 */
export async function saveArtwork(
  urls: (string | null | undefined)[],
  executor: Executor = db,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const url of urls) if (url) ids.set(url, artworkId(url))
  if (ids.size === 0) return ids
  const rows = [...ids].map(([url, id]) => ({ id, url }))
  for (let i = 0; i < rows.length; i += 500) {
    await executor
      .insert(artwork)
      .values(rows.slice(i, i + 500))
      .onConflictDoNothing()
  }
  return ids
}

function sniff(bytes: Uint8Array): Format | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg"
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png"
  }
  const riff = new TextDecoder().decode(bytes.subarray(0, 12))
  if (riff.startsWith("RIFF") && riff.endsWith("WEBP")) return "webp"
  // SVG and anything else could carry scripts or surprises. Skip it.
  return null
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}

async function findOriginal(id: string): Promise<Cached | null> {
  for (const format of ["jpg", "png", "webp"] as const) {
    const path = join(dir, `${id}.${format}`)
    if (await exists(path)) return { path, format }
  }
  return null
}

async function download(id: string, url: string): Promise<Cached> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { "user-agent": "Matinee" },
  })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  const length = Number(response.headers.get("content-length") ?? 0)
  if (length > MAX_BYTES) throw new Error(`${url} is too large`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) throw new Error(`${url} is too large`)
  const format = sniff(bytes)
  if (!format) throw new Error(`${url} isn't a JPEG, PNG, or WebP image`)

  await mkdir(dir, { recursive: true })
  const path = join(dir, `${id}.${format}`)
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, bytes)
  await rename(tmp, path)
  return { path, format }
}

/** A copy at most `width` wide. Transparent PNGs stay PNG. */
async function resize(
  id: string,
  original: Cached,
  size: ArtworkSize,
): Promise<Cached> {
  const format = original.format === "png" ? "png" : "jpg"
  const path = join(dir, `${id}-${size}.${format}`)
  if (await exists(path)) return { path, format }
  const tmp = `${path}.${process.pid}.tmp.${format}`
  try {
    await run(env.MATINEE_FFMPEG_PATH, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      original.path,
      "-frames:v",
      "1",
      "-vf",
      `scale='min(iw,${WIDTHS[size]})':-2`,
      ...(format === "jpg" ? ["-q:v", "3"] : []),
      "-y",
      tmp,
    ])
    await rename(tmp, path)
    return { path, format }
  } catch (cause) {
    await rm(tmp, { force: true })
    // Without ffmpeg the original still works, only heavier.
    log.warn(`Couldn't resize artwork ${id}, serving the original`, cause)
    return original
  }
}

async function load(id: string, size: ArtworkSize): Promise<Cached | null> {
  for (const format of ["jpg", "png"] as const) {
    const path = join(dir, `${id}-${size}.${format}`)
    if (await exists(path)) return { path, format }
  }
  let original = await findOriginal(id)
  if (!original) {
    const failed = failedAt.get(id)
    if (failed && Date.now() - failed < RETRY_AFTER_MS) return null
    const [row] = await db
      .select({ url: artwork.url })
      .from(artwork)
      .where(eq(artwork.id, id))
    if (!row) return null
    try {
      original = await withDownload(() => download(id, row.url))
      failedAt.delete(id)
    } catch (cause) {
      failedAt.set(id, Date.now())
      log.warn(`Couldn't download artwork ${row.url}`, cause)
      return null
    }
  }
  const cached = original
  return withResize(() => resize(id, cached, size))
}

function artworkFile(id: string, size: ArtworkSize): Promise<Cached | null> {
  const key = `${id}-${size}`
  const pending = inflight.get(key)
  if (pending) return pending
  const job = load(id, size).finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}

export const artworkRoutes = new Hono()

artworkRoutes.get("/:id", async (c) => {
  if (!(await readSession(c))) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f]{32}$/.test(id)) return c.body(null, 404)
  const size = c.req.query("size") === "large" ? "large" : "small"

  const file = await artworkFile(id, size)
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
      // The id names one URL, so the image behind it never changes.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  )
})
