import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { access, mkdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"

import {
  type Artwork,
  ARTWORK_SIZES,
  ARTWORK_WIDTHS,
  type ArtworkSize,
  type ImagePlaceholder,
} from "@matinee/contracts"
import { artwork, credit, episode, season, title } from "@matinee/db"
import { and, eq, isNotNull, isNull, or } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import { Hono } from "hono"

import { readSession } from "../auth/session"
import { anyOf, arg, db } from "../db"
import { env } from "../env"
import { defineQueue, perCpu, type Priority } from "../jobs/queue"
import { log } from "../log"
import { readPlaceholder } from "./blurhash"
import { run } from "./process"

const MAX_BYTES = 25 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 30_000
// A URL that failed is left alone for this long before trying again.
const RETRY_AFTER_MS = 10 * 60 * 1000

const dir = join(env.dataDir, "artwork")

export type ImageFormat = "jpg" | "png" | "webp"
type Format = ImageFormat
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

export type Placeholders = Map<string, ImagePlaceholder>

// Prepared once; nearly every list of titles or files asks it.
const placeholderRows = db
  .select({
    id: artwork.id,
    blurhash: artwork.blurhash,
    aspectRatio: artwork.aspectRatio,
  })
  .from(artwork)
  .where(
    and(anyOf(artwork.id, arg("ids"), "text"), isNotNull(artwork.blurhash)),
  )
  .prepare("artwork_placeholders")

/** The placeholders the server has read for `ids`, by id. */
export async function placeholders(
  ids: Iterable<string | null>,
): Promise<Placeholders> {
  const found: Placeholders = new Map()
  const wanted = [...new Set(ids)].filter((id): id is string => id !== null)
  if (wanted.length === 0) return found
  const rows = await placeholderRows.execute({ ids: wanted })
  for (const { id, blurhash, aspectRatio } of rows) {
    if (blurhash && aspectRatio) found.set(id, { blurhash, aspectRatio })
  }
  return found
}

/** An artwork id the way clients get it, with its placeholder if read. */
export function toArtwork(
  id: string | null,
  found: Placeholders,
): Artwork | null {
  return id ? { id, placeholder: found.get(id) ?? null } : null
}

/** What the image bytes are, or null for anything but JPEG, PNG, and WebP. */
export function sniffImage(bytes: Uint8Array): Format | null {
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

/**
 * Download an image a provider named, at most 25 MB. Throws for anything but
 * a JPEG, PNG, or WebP image.
 */
export async function fetchImage(
  url: string,
): Promise<{ bytes: Uint8Array; format: Format }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { "user-agent": "Matinee" },
  })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  const length = Number(response.headers.get("content-length") ?? 0)
  if (length > MAX_BYTES) throw new Error(`${url} is too large`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) throw new Error(`${url} is too large`)
  const format = sniffImage(bytes)
  if (!format) throw new Error(`${url} isn't a JPEG, PNG, or WebP image`)
  return { bytes, format }
}

async function download(id: string, url: string): Promise<Cached> {
  const { bytes, format } = await fetchImage(url)
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${id}.${format}`)
  // Unique, since a job for the other size may download the same image.
  const tmp = `${path}.${randomUUID()}.tmp`
  await writeFile(tmp, bytes)
  await rename(tmp, path)
  return { path, format }
}

/**
 * A copy at most as wide as `size` allows, as WebP, which is about a third
 * smaller than JPEG at the same look and keeps a logo's transparency. With
 * an ffmpeg built without libwebp, JPEG, and PNG for transparent images.
 */
async function resize(
  id: string,
  original: Cached,
  size: ArtworkSize,
): Promise<Cached> {
  if (webp) {
    const made = await scale(id, original, size, "webp")
    if (made) {
      // Copies an older server made in another format are no longer read.
      await Promise.all(
        (["jpg", "png"] as const).map((format) =>
          rm(join(dir, `${id}-${size}.${format}`), { force: true }),
        ),
      )
      return made
    }
    webp = false
    log.warn("ffmpeg can't write WebP; artwork stays JPEG and PNG")
  }
  const format = original.format === "png" ? "png" : "jpg"
  const made = await scale(id, original, size, format)
  if (made) return made
  // Without ffmpeg the original still works, only heavier.
  log.warn(`Couldn't resize artwork ${id}, serving the original`)
  return original
}

// Cleared once ffmpeg fails to write WebP.
let webp = true

async function scale(
  id: string,
  original: Cached,
  size: ArtworkSize,
  format: Format,
): Promise<Cached | null> {
  const path = join(dir, `${id}-${size}.${format}`)
  if (await exists(path)) return { path, format }
  const tmp = `${path}.${process.pid}.tmp.${format}`
  const quality =
    format === "webp"
      ? ["-c:v", "libwebp", "-quality", "80"]
      : format === "jpg"
        ? ["-q:v", "3"]
        : []
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
      `scale='min(iw,${ARTWORK_WIDTHS[size]})':-2`,
      ...quality,
      "-y",
      tmp,
    ])
    await rename(tmp, path)
    return { path, format }
  } catch (cause) {
    await rm(tmp, { force: true })
    log.warn(`Couldn't scale artwork ${id} to ${format}`, cause)
    return null
  }
}

type ArtworkJob = { id: string; size: ArtworkSize }

function jobKey(job: ArtworkJob): string {
  return `${job.id}-${job.size}`
}

async function findResized(
  id: string,
  size: ArtworkSize,
): Promise<Cached | null> {
  // While WebP works, an older JPEG or PNG copy is made again as WebP.
  const formats = webp ? (["webp"] as const) : (["jpg", "png"] as const)
  for (const format of formats) {
    const path = join(dir, `${id}-${size}.${format}`)
    if (await exists(path)) return { path, format }
  }
  return null
}

/**
 * Read the image's placeholder and store it. Failing costs only the
 * placeholder, so the image is still served.
 */
async function savePlaceholder(id: string, file: Cached): Promise<void> {
  const placeholder = await readPlaceholder(file.path).catch(
    (cause: unknown) => {
      log.warn(`Couldn't read a placeholder for artwork ${id}`, cause)
      return null
    },
  )
  if (!placeholder) return
  await db.update(artwork).set(placeholder).where(eq(artwork.id, id))
}

/**
 * The copy for `size`, downloading the original first if need be, and the
 * placeholder the first time.
 */
async function load({ id, size }: ArtworkJob): Promise<Cached | null> {
  const [row] = await db
    .select({ url: artwork.url, blurhash: artwork.blurhash })
    .from(artwork)
    .where(eq(artwork.id, id))
  if (!row) return null
  let file = await findResized(id, size)
  if (!file) {
    // An upload has no URL to fetch again, so without its file it's gone.
    const original =
      (await findOriginal(id)) ?? (row.url ? await download(id, row.url) : null)
    if (!original) return null
    file = await resize(id, original, size)
    // Cards ask for `thumb` on screens that show them small, and `small`
    // on sharper ones, so both come from the one download.
    if (size === "small" && !(await findResized(id, "thumb"))) {
      await resize(id, original, "thumb")
    }
  }
  if (row.blurhash === null) await savePlaceholder(id, file)
  return file
}

/**
 * Provider artwork, fetched and scaled after a metadata fetch, or on first
 * view if that comes sooner. A URL that failed is left alone for a while
 * before trying again.
 */
const artworkJobs = defineQueue<ArtworkJob, Cached | null>({
  id: "artwork",
  name: "Artwork",
  description:
    "Download images from the metadata provider, scale them, and read their blurred placeholders.",
  concurrency: 4,
  tuning: {
    // A job downloads one image and has ffmpeg scale it, a short burst of
    // CPU, so allow one per CPU.
    max: perCpu(1, { min: 4, max: 16 }),
    note: "Provider images downloaded and resized at once. A library's first metadata fetch queues thousands.",
  },
  key: jobKey,
  label: (job) => `artwork ${job.id}`,
  retryAfterMs: RETRY_AFTER_MS,
  failure: (job) => `Couldn't download artwork ${job.id}`,
  run: (job) => load(job),
})

async function artworkFile(
  id: string,
  size: ArtworkSize,
): Promise<Cached | null> {
  // Most views find the file, and needn't wait for a worker.
  const resized = await findResized(id, size)
  if (resized) return resized
  return artworkJobs.run({ id, size }, { priority: "high" }).catch(() => null)
}

/** Where downloads ahead of a view go: behind views, and posters first. */
export type Prefetch = Extract<Priority, "normal" | "low">

/**
 * Download and scale an image now, ahead of anything queued, and read its
 * placeholder. Resolves once done, also when it failed, which the queue
 * logs.
 */
export async function prepareArtwork(id: string): Promise<void> {
  await artworkJobs
    .run({ id, size: "small" }, { priority: "high" })
    .catch(() => null)
}

/**
 * Store an image an admin uploaded and return its artwork id, named by its
 * bytes, so the same file is stored once. Null for anything but a JPEG,
 * PNG, or WebP image.
 */
export async function saveUpload(bytes: Uint8Array): Promise<string | null> {
  const format = sniffImage(bytes)
  if (!format) return null
  const id = createHash("sha256").update(bytes).digest("hex").slice(0, 32)
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${id}.${format}`)
  const tmp = `${path}.${randomUUID()}.tmp`
  await writeFile(tmp, bytes)
  await rename(tmp, path)
  await db.insert(artwork).values({ id, url: null }).onConflictDoNothing()
  await prepareArtwork(id)
  return id
}

/** Which of `ids` are uploads rather than provider images. */
export async function uploadedArtwork(
  ids: Iterable<string | null>,
): Promise<Set<string>> {
  const wanted = [...new Set(ids)].filter((id): id is string => id !== null)
  if (wanted.length === 0) return new Set()
  const rows = await db
    .select({ id: artwork.id })
    .from(artwork)
    .where(and(anyOf(artwork.id, wanted, "text"), isNull(artwork.url)))
  return new Set(rows.map((row) => row.id))
}

/** Whether a title, season, or episode still shows the image. */
async function inUse(id: string): Promise<boolean> {
  const [titles, seasons, episodes] = await Promise.all([
    db
      .select({ id: title.id })
      .from(title)
      .where(
        or(
          eq(title.posterId, id),
          eq(title.backdropId, id),
          eq(title.logoId, id),
        ),
      )
      .limit(1),
    db
      .select({ id: season.titleId })
      .from(season)
      .where(eq(season.posterId, id))
      .limit(1),
    db
      .select({ id: episode.titleId })
      .from(episode)
      .where(eq(episode.stillId, id))
      .limit(1),
  ])
  return titles.length + seasons.length + episodes.length > 0
}

/**
 * Delete the uploads among `ids` that nothing shows any more, rows and
 * files. Provider images stay, since they cost only a download to get
 * back.
 */
export async function dropUnusedUploads(
  ids: Iterable<string | null>,
): Promise<void> {
  for (const id of await uploadedArtwork(ids)) {
    if (await inUse(id)) continue
    await db.delete(artwork).where(eq(artwork.id, id))
    const formats = ["jpg", "png", "webp"] as const
    const names = formats.flatMap((format) => [
      `${id}.${format}`,
      ...ARTWORK_SIZES.map((size) => `${id}-${size}.${format}`),
    ])
    await Promise.all(
      names.map((name) => rm(join(dir, name), { force: true })),
    ).catch((cause: unknown) =>
      log.warn(`Couldn't delete the files of artwork ${id}`, cause),
    )
  }
}

/**
 * Download images ahead of their first view and read their placeholders.
 * Images that have one are skipped, so a fetch that changed nothing
 * queues nothing.
 */
export function queueArtwork(ids: (string | null)[], priority: Prefetch): void {
  const wanted = [...new Set(ids)].filter((id): id is string => id !== null)
  if (wanted.length === 0) return
  db.select({ id: artwork.id })
    .from(artwork)
    .where(and(anyOf(artwork.id, wanted, "text"), isNull(artwork.blurhash)))
    .then((rows) => {
      const due = new Set(rows.map((row) => row.id))
      // In the caller's order, which puts what people see most first.
      for (const id of wanted) {
        if (due.has(id)) artworkJobs.push({ id, size: "small" }, { priority })
      }
    })
    .catch((cause: unknown) =>
      log.error("Couldn't queue artwork downloads", cause),
    )
}

/** Artwork that `column` of `table` uses and that lacks a placeholder. */
function lackingPlaceholder(table: PgTable, column: PgColumn) {
  return db
    .selectDistinct({ id: artwork.id })
    .from(table)
    .innerJoin(artwork, eq(artwork.id, column))
    .where(isNull(artwork.blurhash))
}

/**
 * Download every image a title, season, episode, or credit uses that the
 * server has no placeholder for, as when a restart dropped the queued
 * downloads or one failed. Title posters and backdrops go first. Resolves
 * once those jobs are done.
 */
export async function prefetchArtwork(
  options: { signal?: AbortSignal; progress?: (fraction: number) => void } = {},
): Promise<void> {
  const [covers, rest] = await Promise.all([
    Promise.all([
      lackingPlaceholder(title, title.posterId),
      lackingPlaceholder(title, title.backdropId),
    ]),
    Promise.all([
      lackingPlaceholder(season, season.posterId),
      lackingPlaceholder(episode, episode.stillId),
      lackingPlaceholder(title, title.logoId),
      lackingPlaceholder(credit, credit.photoId),
    ]),
  ])
  const due = new Map<string, Prefetch>()
  for (const { id } of covers.flat()) due.set(id, "normal")
  for (const { id } of rest.flat()) if (!due.has(id)) due.set(id, "low")
  let done = 0
  const jobs = [...due].map(([id, priority]) =>
    artworkJobs
      .run({ id, size: "small" }, { priority })
      .catch(() => {
        // Logged by the queue.
      })
      .finally(() => options.progress?.(++done / due.size)),
  )
  options.signal?.addEventListener("abort", () => {
    for (const id of due.keys()) {
      artworkJobs.cancel(jobKey({ id, size: "small" }))
    }
  })
  await Promise.all(jobs)
}

export const artworkRoutes = new Hono()

artworkRoutes.get("/:id", async (c) => {
  if (!(await readSession(c))) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f]{32}$/.test(id)) return c.body(null, 404)
  const size =
    ARTWORK_SIZES.find((name) => name === c.req.query("size")) ?? "small"

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
