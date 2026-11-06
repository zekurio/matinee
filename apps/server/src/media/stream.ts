import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { Readable } from "node:stream"

import { mediaItem } from "@matinee/db"
import { eq } from "drizzle-orm"
import { Hono } from "hono"

import { readSession } from "../auth/session"
import { db } from "../db"
import { ifNoneMatchSatisfied } from "./http-conditional"
import { mimeType } from "./mime"
import { openSubtitle } from "./subtitles"
import { thumbnailFor } from "./thumbnails"

const RANGE = /^bytes=(\d*)-(\d*)$/

type ByteRange = { start: number; end: number }

/** Parse a single-range header. Null means unsatisfiable. */
function parseRange(header: string, size: number): ByteRange | null {
  const match = RANGE.exec(header.trim())
  if (!match) return null
  const [, rawStart = "", rawEnd = ""] = match
  if (rawStart === "" && rawEnd === "") return null
  if (rawStart === "") {
    const suffix = Number(rawEnd)
    if (suffix === 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(rawStart)
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1)
  if (start >= size || start > end) return null
  return { start, end }
}

/**
 * Direct play: the file goes to the client as-is, with range support so
 * players can seek. Transcoding will sit beside this route.
 */
export const streamRoutes = new Hono()

streamRoutes.get("/:id/thumbnail", async (c) => {
  if (!(await readSession(c))) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.body(null, 404)
  const size = c.req.query("size") === "large" ? "large" : "small"

  const [item] = await db.select().from(mediaItem).where(eq(mediaItem.id, id))
  if (!item) return c.body(null, 404)
  const file = await thumbnailFor(item, size)
  if (!file) return c.body(null, 404)
  const info = await stat(file)
  return c.body(
    // SAFETY: A file read stream without an encoding yields Buffers, which
    // are Uint8Arrays.
    Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
    200,
    {
      "Content-Type": "image/jpeg",
      "Content-Length": String(info.size),
      // The URL doesn't change when the file does, so don't cache forever.
      "Cache-Control": "private, max-age=86400",
    },
  )
})

streamRoutes.get("/:id/subtitles/:trackId", async (c) => {
  if (!(await readSession(c))) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.body(null, 404)

  const [item] = await db.select().from(mediaItem).where(eq(mediaItem.id, id))
  if (!item) return c.body(null, 404)
  const track = await openSubtitle(item, c.req.param("trackId"))
  if (!track) return c.body(null, 404)
  // The URL stays the same when the file changes, so check every time.
  const headers = {
    "Cache-Control": "private, no-cache",
    ETag: track.etag,
  }
  if (ifNoneMatchSatisfied(c.req.header("if-none-match"), track.etag)) {
    return c.body(null, 304, headers)
  }
  const text = await track.read()
  if (text === null) return c.body(null, 404)
  return c.body(text, 200, {
    ...headers,
    "Content-Type": "text/vtt; charset=utf-8",
  })
})

streamRoutes.on(["GET", "HEAD"], "/:id/stream", async (c) => {
  if (!(await readSession(c))) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.body(null, 404)

  const [item] = await db
    .select({ path: mediaItem.path, container: mediaItem.container })
    .from(mediaItem)
    .where(eq(mediaItem.id, id))
    .limit(1)
  if (!item) return c.body(null, 404)

  const info = await stat(item.path).catch(() => null)
  if (!info?.isFile()) return c.body(null, 404)

  const size = info.size
  const lastModified = info.mtime.toUTCString()
  const etag = `"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`

  const rangeHeader = c.req.header("range")
  const ifRange = c.req.header("if-range")
  const useRange =
    rangeHeader !== undefined &&
    (ifRange === undefined || ifRange === etag || ifRange === lastModified)

  let range: ByteRange | null = null
  if (useRange) {
    range = parseRange(rangeHeader, size)
    if (!range) {
      return c.body(null, 416, { "Content-Range": `bytes */${size}` })
    }
  }
  const span = range ?? { start: 0, end: size - 1 }
  const status = range ? 206 : 200
  const whole = {
    "Accept-Ranges": "bytes",
    "Content-Type": mimeType(item.container),
    "Cache-Control": "private, max-age=0, must-revalidate",
    "Last-Modified": lastModified,
    ETag: etag,
    "Content-Length": String(size === 0 ? 0 : span.end - span.start + 1),
  }
  const headers = range
    ? { ...whole, "Content-Range": `bytes ${range.start}-${range.end}/${size}` }
    : whole

  if (c.req.method === "HEAD" || size === 0) {
    return c.body(null, status, headers)
  }
  const stream = createReadStream(item.path, {
    start: span.start,
    end: span.end,
    highWaterMark: 256 * 1024,
  })
  return c.body(
    // SAFETY: A file read stream without an encoding yields Buffers, which
    // are Uint8Arrays.
    Readable.toWeb(stream) as ReadableStream<Uint8Array>,
    status,
    headers,
  )
})
