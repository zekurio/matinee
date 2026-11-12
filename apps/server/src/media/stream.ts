import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { Readable } from "node:stream"

import {
  DEFAULT_PLAYBACK_AUDIO_CODECS,
  PLAYBACK_QUALITY_IDS,
  PlaybackAudioCodec,
  PlaybackQuality,
  TranscodeVideoCodec,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { type MediaItemRow } from "@matinee/db"
import { Hono } from "hono"

import { encodeAllowed } from "../access/media"
import { readViewer } from "../access/viewer"
import { itemFor } from "../access/visible"
import { log } from "../log"
import {
  addEncodeSeconds,
  recordStream,
  type SessionOwner,
  trackStream,
} from "../stats/sessions"
import {
  hasSegment,
  initPath,
  knownJob,
  openJob,
  playlist,
  segmentPath,
  startWatching,
  type Watcher,
} from "./hls"
import { encodeSpec, type HlsRequest } from "./hls-encode"
import { ifNoneMatchSatisfied } from "./http-conditional"
import { mimeType } from "./mime"
import { mayStreamOriginal, openPlayback } from "./playback"
import { itemFonts } from "./subtitle-fonts"
import { burnInSource, openSubtitle } from "./subtitles"
import { thumbnailFor } from "./thumbnails"
import {
  trickplayPlaylist,
  trickplayStatus,
  trickplayTileFile,
} from "./trickplay"

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
  const viewer = await readViewer(c)
  if (!viewer) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.body(null, 404)
  const size = c.req.query("size") === "large" ? "large" : "small"

  const item = await itemFor(viewer, id)
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

const TILE_NAME = /^(\d{1,5})\.jpg$/

/** Trickplay images as an HLS image playlist; see `trickplayPlaylistPath`. */
streamRoutes.get("/:id/trickplay/tiles.m3u8", async (c) => {
  const viewer = await readViewer(c)
  if (!viewer) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.body(null, 404)
  const item = await itemFor(viewer, id)
  if (!item) return c.body(null, 404)
  // Queues the images when they're missing, as the status does.
  const status = await trickplayStatus(item)
  if (status.status !== "ready") return c.body(null, 404)
  return c.body(trickplayPlaylist(status.images), 200, {
    "Content-Type": "application/vnd.apple.mpegurl",
    // The images can be made again, with new tile URLs.
    "Cache-Control": "private, no-cache",
  })
})

/** A tile of trickplay images; see `trickplayTilePath`. */
streamRoutes.get("/:id/trickplay/:key/:name", async (c) => {
  const viewer = await readViewer(c)
  if (!viewer) return c.body(null, 401)
  const id = c.req.param("id")
  const key = c.req.param("key")
  const name = TILE_NAME.exec(c.req.param("name"))
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{32}$/.test(key) || !name) {
    return c.body(null, 404)
  }
  if (!(await itemFor(viewer, id))) return c.body(null, 404)
  const path = trickplayTileFile(id.toLowerCase(), key, Number(name[1]))
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return c.body(null, 404)
  return c.body(fileBody(path), 200, {
    "Content-Type": "image/jpeg",
    "Content-Length": String(info.size),
    // A key names one set of images for good.
    "Cache-Control": "private, max-age=31536000, immutable",
  })
})

/**
 * `opus,aac`, the player's codecs. Names the server doesn't know are skipped.
 * Left out, the codecs the server assumes.
 */
const AudioCodecList = t
  .string()
  .$default(DEFAULT_PLAYBACK_AUDIO_CODECS.join(","))
  .transform((value) =>
    value.split(",").flatMap((name) => {
      const codec = PlaybackAudioCodec.safeParse(name.trim())
      return codec.success ? [codec.data] : []
    }),
  )

/**
 * `hevc,h264`, the codecs the player takes an encode in, the one it wants
 * first. Names the server doesn't know are skipped. Left out, H.264.
 */
const VideoCodecList = t
  .string()
  .$default("h264")
  .transform((value) =>
    value.split(",").flatMap((name) => {
      const codec = TranscodeVideoCodec.safeParse(name.trim())
      return codec.success ? [codec.data] : []
    }),
  )

const PlayQuery = t.object({
  audio: t.coerce.number().int().nonnegative(),
  start: t.coerce.number().min(0).$default(0),
  quality: PlaybackQuality.$default("original"),
  audioCodecs: AudioCodecList,
  videoCodecs: VideoCodecList,
  /** The player's session id, for statistics. */
  session: t.uuid().optional(),
})

/** One audio track, the video copied or encoded; see `mediaPlaybackPath`. */
streamRoutes.get("/:id/play", async (c) => {
  const viewer = await readViewer(c)
  if (!viewer) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.body(null, 404)
  const query = PlayQuery.safeParse(c.req.query())
  if (!query.success) return c.body(null, 400)

  const item = await itemFor(viewer, id)
  if (!item) return c.body(null, 404)
  if (
    query.data.quality === "original"
      ? !(await mayStreamOriginal(viewer.access, item))
      : !encodeAllowed(viewer.access, query.data.quality)
  )
    return c.body(null, 403)
  const opened = await openPlayback(item, query.data, c.req.raw.signal)
  if (!opened) return c.body(null, 500)

  const sessionId = query.data.session ?? null
  const untrack = trackStream(sessionId)
  const owner: SessionOwner | null = sessionId
    ? {
        id: sessionId,
        userId: viewer.id,
        item,
        userAgent: c.req.header("user-agent"),
      }
    : null
  const { plan } = opened
  const encodes = plan.method === "transcode" || plan.audioConverted
  // Statistics never hold up or break playback.
  const keepGoing = (cause: unknown) =>
    log.warn("Couldn't record a stream in its session", cause)
  void opened.finished
    .then(async (seconds) => {
      untrack()
      if (owner && encodes) await addEncodeSeconds(owner, seconds)
    })
    .catch(keepGoing)
  if (owner) void recordStream(owner, plan).catch(keepGoing)
  return c.body(opened.stream, 200, {
    "Content-Type": "video/mp4",
    "Cache-Control": "no-store",
  })
})

const HlsQuery = PlayQuery.omit({ quality: true }).extend({
  quality: t.enum(
    PLAYBACK_QUALITY_IDS.filter(
      (id): id is Exclude<PlaybackQuality, "original"> => id !== "original",
    ),
  ),
  /** A picture subtitle track to burn in, by its id. */
  subtitle: t.string().min(1).max(64).optional(),
})

/** What the segment URLs repeat from the playlist's query. */
function encodeQuery(query: t.infer<typeof HlsQuery>): string {
  const params = new URLSearchParams({
    audio: String(query.audio),
    quality: query.quality,
    audioCodecs: query.audioCodecs.join(","),
    videoCodecs: query.videoCodecs.join(","),
  })
  if (query.subtitle) params.set("subtitle", query.subtitle)
  if (query.session) params.set("session", query.session)
  return params.toString()
}

/**
 * The encode a query asks for, with its subtitle looked up. `missing` when
 * the file has no such picture track.
 */
async function hlsRequest(
  item: MediaItemRow,
  query: t.infer<typeof HlsQuery>,
): Promise<HlsRequest | "missing"> {
  const subtitle = query.subtitle
    ? await burnInSource(item, query.subtitle)
    : null
  if (query.subtitle && !subtitle) return "missing"
  return { ...query, subtitle }
}

function watcherFor(
  viewer: { id: string },
  item: MediaItemRow,
  session: string | undefined,
  userAgent: string | undefined,
): Watcher {
  return {
    key: session ?? `user:${viewer.id}`,
    owner: session ? { id: session, userId: viewer.id, item, userAgent } : null,
  }
}

function fileBody(path: string): ReadableStream<Uint8Array> {
  // SAFETY: A file read stream without an encoding yields Buffers, which
  // are Uint8Arrays.
  return Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>
}

/** An encode as HLS; see `mediaHlsPath`. */
streamRoutes.get("/:id/hls/main.m3u8", async (c) => {
  const viewer = await readViewer(c)
  if (!viewer) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.body(null, 404)
  const query = HlsQuery.safeParse(c.req.query())
  if (!query.success) return c.body(null, 400)

  const item = await itemFor(viewer, id)
  if (!item) return c.body(null, 404)
  if (!encodeAllowed(viewer.access, query.data.quality))
    return c.body(null, 403)
  const request = await hlsRequest(item, query.data)
  if (request === "missing") return c.body(null, 404)
  const spec = await encodeSpec(item, request)
  if (!spec) return c.body(null, 500)
  const job = await openJob(spec)
  const watcher = watcherFor(
    viewer,
    item,
    query.data.session,
    c.req.header("user-agent"),
  )
  startWatching(job, query.data.start, watcher)
  if (watcher.owner) {
    void recordStream(watcher.owner, spec.plan).catch((cause: unknown) =>
      log.warn("Couldn't record a stream in its session", cause),
    )
  }
  return c.body(playlist(job, encodeQuery(query.data)), 200, {
    "Content-Type": "application/vnd.apple.mpegurl",
    "Cache-Control": "no-store",
  })
})

const SEGMENT_NAME = /^(?:init\.mp4|(\d{1,6})\.m4s)$/

/** One segment of an encode, or its init segment. */
streamRoutes.get("/:id/hls/:key/:name", async (c) => {
  const viewer = await readViewer(c)
  if (!viewer) return c.body(null, 401)
  const id = c.req.param("id")
  const key = c.req.param("key")
  const name = SEGMENT_NAME.exec(c.req.param("name"))
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{32}$/.test(key) || !name) {
    return c.body(null, 404)
  }
  const query = HlsQuery.safeParse(c.req.query())
  if (!query.success) return c.body(null, 400)

  const item = await itemFor(viewer, id)
  if (!item) return c.body(null, 404)
  if (!encodeAllowed(viewer.access, query.data.quality))
    return c.body(null, 403)
  let job = knownJob(key)
  if (!job) {
    // After a restart: the same request makes the same encode, unless the
    // file or the settings changed and the player needs a new playlist.
    const request = await hlsRequest(item, query.data)
    if (request === "missing") return c.body(null, 404)
    const spec = await encodeSpec(item, request)
    if (spec?.key !== key) return c.body(null, 404)
    job = await openJob(spec)
  }
  if (job.spec.itemId !== item.id) return c.body(null, 404)
  // A cached key names the actual encode, not the quality in a hand-written query.
  if (!encodeAllowed(viewer.access, job.spec.plan.quality))
    return c.body(null, 403)

  const watcher = watcherFor(
    viewer,
    item,
    query.data.session,
    c.req.header("user-agent"),
  )
  const signal = c.req.raw.signal
  const segment = name[1]
  if (segment !== undefined && !hasSegment(job, Number(segment))) {
    return c.body(null, 404)
  }
  const path =
    segment === undefined
      ? await initPath(job, watcher, signal)
      : await segmentPath(job, Number(segment), watcher, signal)
  // A 5xx, so hls.js tries again; the encode may come back after a failure.
  if (!path) return c.body(null, 503)
  const info = await stat(path).catch(() => null)
  // Deleted behind the players, with segment deletion on.
  if (!info) return c.body(null, 404)
  return c.body(fileBody(path), 200, {
    "Content-Type": "video/mp4",
    "Content-Length": String(info.size),
    "Cache-Control": "private, max-age=3600",
  })
})

streamRoutes.get("/:id/fonts/:index?", async (c) => {
  const viewer = await readViewer(c)
  if (!viewer) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.body(null, 404)
  const item = await itemFor(viewer, id)
  if (!item) return c.body(null, 404)
  const result = await itemFonts(item)
  const headers = {
    "Cache-Control": "private, no-cache",
    ETag: `"${result.key}"`,
  }
  if (ifNoneMatchSatisfied(c.req.header("if-none-match"), headers.ETag))
    return c.body(null, 304, headers)
  const index = c.req.param("index")
  if (index === undefined)
    return c.json(
      result.fonts.map((_, i) => `/api/media/${id}/fonts/${i}`),
      200,
      headers,
    )
  if (!/^\d{1,2}$/.test(index)) return c.body(null, 404)
  const font = result.fonts[Number(index)]
  return font
    ? c.body(Uint8Array.from(font), 200, {
        ...headers,
        "Content-Type": "application/octet-stream",
      })
    : c.body(null, 404)
})

streamRoutes.get("/:id/subtitles/:trackId", async (c) => {
  const viewer = await readViewer(c)
  if (!viewer) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.body(null, 404)

  const item = await itemFor(viewer, id)
  if (!item) return c.body(null, 404)
  const track = await openSubtitle(
    item,
    c.req.param("trackId"),
    c.req.query("delivery") === "ass",
  )
  if (!track) return c.body(null, 404)
  // The URL stays the same when the file changes, so check every time.
  const headers = {
    "Cache-Control": "private, no-cache",
    ETag: track.etag,
  }
  if (ifNoneMatchSatisfied(c.req.header("if-none-match"), track.etag)) {
    return c.body(null, 304, headers)
  }
  const content = await track.read()
  if (content === null) return c.body(null, 404)
  if (content.kind === "webvtt") {
    return c.body(content.text, 200, {
      ...headers,
      "Content-Type": "text/vtt; charset=utf-8",
    })
  }
  const info = await stat(content.path).catch(() => null)
  if (!info?.isFile()) return c.body(null, 404)
  return c.body(fileBody(content.path), 200, {
    ...headers,
    // PGS has no media type of its own.
    "Content-Type":
      content.kind === "ass"
        ? "text/x-ssa; charset=utf-8"
        : "application/octet-stream",
    "Content-Length": String(info.size),
  })
})

streamRoutes.on(["GET", "HEAD"], "/:id/stream", async (c) => {
  const viewer = await readViewer(c)
  if (!viewer) return c.body(null, 401)
  const id = c.req.param("id")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.body(null, 404)

  const item = await itemFor(viewer, id)
  if (!item) return c.body(null, 404)

  const info = await stat(item.path).catch(() => null)
  if (!info?.isFile()) return c.body(null, 404)
  // This route also serves original downloads, which have no bit rate limit.
  if (
    !viewer.access.downloads &&
    !(await mayStreamOriginal(viewer.access, item, info))
  )
    return c.body(null, 403)

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
