import { t } from "@matinee/contracts/schema"
import { Hono } from "hono"

import { readSession } from "../auth/session"
import {
  accessDownload,
  downloadInit,
  downloadSegment,
  downloadStream,
  fileBody,
} from "./downloads"

/*
 * The bytes of downloads that `downloads.start` set up: the whole
 * download as one stream, or its init segment and segments one at a time.
 * See `downloadFilePath()` and `downloadSegmentPath()`.
 */
export const downloadRoutes = new Hono()

// When a request that waited on the encode gave up, or the queue is full.
const RETRY_AFTER_S = "5"

const FileQuery = t.object({
  from: t.coerce.number().int().nonnegative().$default(0),
})

/** `attachment` with the name in both forms, for browsers old and new. */
function attachment(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_")
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

/** The download as one fragmented MP4; see `downloadFilePath`. */
downloadRoutes.get("/:id/file.mp4", async (c) => {
  const viewer = await readSession(c)
  if (!viewer) return c.body(null, 401)
  const query = FileQuery.safeParse(c.req.query())
  if (!query.success) return c.body(null, 400)
  const access = await accessDownload(c.req.param("id"), viewer.id)
  if (access.kind === "gone") return c.body(null, 404)
  if (access.kind === "changed") return c.body(null, 409)
  const { active } = access
  return c.body(
    downloadStream(active, query.data.from, c.req.raw.signal),
    200,
    {
      "Content-Type": "video/mp4",
      "Content-Disposition": attachment(active.record.fileName),
      "Cache-Control": "no-store",
      "X-Matinee-Duration": String(active.record.plan.durationSeconds),
    },
  )
})

/** A download's init segment; see `downloadInitPath`. */
downloadRoutes.get("/:id/init.mp4", async (c) => {
  const viewer = await readSession(c)
  if (!viewer) return c.body(null, 401)
  const access = await accessDownload(c.req.param("id"), viewer.id)
  if (access.kind === "gone") return c.body(null, 404)
  if (access.kind === "changed") return c.body(null, 409)
  const path = await downloadInit(access.active, c.req.raw.signal)
  if (!path) {
    return c.body(null, 503, { "Retry-After": RETRY_AFTER_S })
  }
  return c.body(fileBody(access.active, path), 200, {
    "Content-Type": "video/mp4",
    "Cache-Control": "no-store",
  })
})

const SEGMENT_NAME = /^(\d{1,6})\.m4s$/

/** One segment of a download; see `downloadSegmentPath`. */
downloadRoutes.get("/:id/:name", async (c) => {
  const viewer = await readSession(c)
  if (!viewer) return c.body(null, 401)
  const name = SEGMENT_NAME.exec(c.req.param("name"))
  if (!name) return c.body(null, 404)
  const access = await accessDownload(c.req.param("id"), viewer.id)
  if (access.kind === "gone") return c.body(null, 404)
  if (access.kind === "changed") return c.body(null, 409)
  const result = await downloadSegment(
    access.active,
    Number(name[1]),
    c.req.raw.signal,
  )
  switch (result.kind) {
    case "end":
      return c.body(null, 204, { "Cache-Control": "no-store" })
    case "busy":
    case "failed":
      return c.body(null, 503, { "Retry-After": RETRY_AFTER_S })
    case "skipped":
      return c.body(null, 416)
    case "changed":
      return c.body(null, 409)
    case "segment":
      if (result.last) c.header("X-Matinee-Last-Segment", "1")
      return c.body(fileBody(access.active, result.path, result.before), 200, {
        "Content-Type": "video/mp4",
        "Content-Length": String(result.size + (result.before?.length ?? 0)),
        "Cache-Control": "no-store",
        "X-Matinee-Segment-Start": result.times.start.toFixed(6),
        "X-Matinee-Segment-End": (
          result.times.start + result.times.duration
        ).toFixed(6),
      })
  }
})
