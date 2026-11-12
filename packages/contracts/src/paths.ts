import type { AppAuthorizeRequest } from "./sessions"

/** Mount point of the RPC handler, for `createMatineeClient()`. */
export const RPC_PATH = "/api/rpc"

/**
 * Mount point of the REST API, the same procedures as RPC with the methods
 * and paths from the contract. For clients that aren't TypeScript.
 */
export const OPENAPI_PATH = "/api/v1"

/** The OpenAPI 3.1 document that describes the REST API. */
export const OPENAPI_SPEC_PATH = `${OPENAPI_PATH}/openapi.json`

/**
 * The web page that reads the OpenAPI document as a reference, where the
 * requests can be tried out with the session the browser has.
 */
export const API_REFERENCE_PAGE_PATH = "/api-docs"

/** Redirects to `API_REFERENCE_PAGE_PATH`, beside the document. */
export const OPENAPI_DOCS_PATH = `${OPENAPI_PATH}/docs`

/**
 * Whether a server is there and which contract it speaks, without a
 * session: `{ "ok": true, "contract": "…" }`. `contract` is a hash of the
 * REST API's paths and schemas, the same as the `info.version` of the
 * OpenAPI document. A client generated from a document keeps the one it
 * was generated from. Against a server that names another, an answer the
 * client can't read means the two are different versions, older or newer,
 * rather than that the server is broken. A server from before this has no
 * `contract`. This answer keeps its shape, so any version of a client
 * reads any version of it.
 */
export const HEALTH_PATH = "/api/health"

/** Byte-range video stream of one media item. */
export function mediaStreamPath(id: string): string {
  return `/api/media/${encodeURIComponent(id)}/stream`
}

/**
 * The video with one audio track as fragmented MP4, starting at `start`
 * seconds into the file, which becomes the stream's time 0. With the
 * `original` quality the video is copied, so start on a keyframe from
 * `media.keyframes`; other qualities encode it and start anywhere, though
 * `mediaHlsPath` shares their encodes. There are no byte ranges: seek by
 * asking for a new start.
 *
 * `audioCodecs` lists what the player decodes in MP4, from
 * `PLAYBACK_AUDIO_CODECS`, in the order it wants them. A track in one of
 * them is copied; the rest become stereo in the first of Opus and AAC the
 * list has and the server encodes, else AAC. Without the list the server
 * assumes `DEFAULT_PLAYBACK_AUDIO_CODECS`.
 *
 * `videoCodecs` lists the codecs from `TRANSCODE_VIDEO_CODECS` the player
 * takes an encode in, the one it wants first. An encode comes in the first
 * one the server can make (`playback.options` says which), else H.264,
 * which is also what it gets without the list.
 *
 * `session` is the id the player reports progress with, so statistics
 * know what the server converted for that session.
 */
export function mediaPlaybackPath(
  id: string,
  options: {
    audio: number
    start: number
    quality: string
    audioCodecs?: readonly string[]
    videoCodecs?: readonly string[]
    session?: string
  },
): string {
  const params = new URLSearchParams({
    audio: String(options.audio),
    start: options.start.toFixed(3),
    quality: options.quality,
  })
  if (options.audioCodecs) {
    params.set("audioCodecs", options.audioCodecs.join(","))
  }
  if (options.videoCodecs) {
    params.set("videoCodecs", options.videoCodecs.join(","))
  }
  if (options.session) params.set("session", options.session)
  return `/api/media/${encodeURIComponent(id)}/play?${params}`
}

/**
 * An encode of the file as an HLS playlist of fMP4 segments, on the file's
 * own timeline, so the player seeks within it. Every quality but
 * `original`. Players that ask for the same file, audio track, and quality,
 * and take the same codecs, share one encode, and a segment once
 * encoded is served from disk again. `start` is where the player begins,
 * so the server starts encoding there. `audioCodecs`, `videoCodecs`, and
 * `session` work as in `mediaPlaybackPath`.
 *
 * `subtitle` burns a picture-based subtitle track into the video: the id
 * of a track from `media.subtitles` whose `delivery` is `pgs` or
 * `burn-in`. 404 when the file has no such track.
 */
export function mediaHlsPath(
  id: string,
  options: {
    audio: number
    quality: string
    start?: number
    audioCodecs?: readonly string[]
    videoCodecs?: readonly string[]
    session?: string
    subtitle?: string | null
  },
): string {
  const params = new URLSearchParams({
    audio: String(options.audio),
    quality: options.quality,
  })
  if (options.subtitle) params.set("subtitle", options.subtitle)
  if (options.start) params.set("start", options.start.toFixed(3))
  if (options.audioCodecs) {
    params.set("audioCodecs", options.audioCodecs.join(","))
  }
  if (options.videoCodecs) {
    params.set("videoCodecs", options.videoCodecs.join(","))
  }
  if (options.session) params.set("session", options.session)
  return `/api/media/${encodeURIComponent(id)}/hls/main.m3u8?${params}`
}

export type ThumbnailSize = "small" | "large"

function downloadBase(downloadId: string): string {
  return `/api/downloads/${encodeURIComponent(downloadId)}`
}

/**
 * A download from `downloads.start` as one stream, which a browser saves
 * as a file: Matroska, or fragmented MP4 with the init segment first and
 * then every segment in order, as the server makes them. There's no
 * length and no byte ranges, since the size is only known at the end;
 * clients that resume fetch an MP4's segments themselves instead. While
 * the server works on an MP4's segment, empty `free` boxes keep the line
 * busy; players skip them.
 *
 * `from` starts an MP4 at that segment and leaves out the init segment,
 * for a client that has the ones before it. 404 once the download is
 * gone; 409 when the file or the server's settings changed since it
 * started, so it has to start over. 503 with Retry-After when the server
 * is making as many downloads as it does at once and had no turn for
 * this one within half a minute: nothing was sent, so ask again. Once it
 * started, the stream breaks off, rather than ends, when the server can't
 * make the rest.
 */
export function downloadFilePath(downloadId: string, from = 0): string {
  const path = `${downloadBase(downloadId)}/file.mp4`
  return from > 0 ? `${path}?from=${from}` : path
}

/**
 * A download's init segment: the MP4 header the segments follow. A file
 * of it and the segments in order, appended, plays as one MP4. It answers
 * as a segment does, 503 with Retry-After included.
 */
export function downloadInitPath(downloadId: string): string {
  return `${downloadBase(downloadId)}/init.mp4`
}

/**
 * One segment of a download, from 0 on. The request waits while the
 * server makes it, for half a minute at most. Fetch them in order:
 * segments behind the newest one asked for are deleted. Headers say
 * where it is in the video: `X-Matinee-Segment-Start` and
 * `X-Matinee-Segment-End` in seconds, and `X-Matinee-Last-Segment: 1` on
 * the last one when the server knows it is. A segment past the end
 * answers 204, so a client fetches until then.
 *
 * 503 with Retry-After when the segment isn't made yet: the server is
 * still at it, the download waits for its turn among the others, or a run
 * just failed. It isn't a failure of the download. Ask again after
 * Retry-After, as often as it takes; a download that waits for its turn
 * keeps its place while its client asks at least every half minute. 404
 * once the download is gone; 409 when the file or the server's settings
 * changed since it started. A download that keeps the video as it is cuts
 * at the source's keyframes, so it only goes forward: 416 for a segment
 * past the next one it can make. To resume after a break, ask for the
 * first segment the client doesn't have.
 */
export function downloadSegmentPath(
  downloadId: string,
  segment: number,
): string {
  return `${downloadBase(downloadId)}/${segment}.m4s`
}

/**
 * One subtitle track of a media item: WebVTT for `webvtt` tracks, a PGS
 * `.sup` file for `pgs` ones. Track ids come from `media.subtitles`. 404
 * for `burn-in` tracks, and when the server can't read or convert one.
 * Taking a track out of a large file can take the server minutes.
 */
export function subtitlePath(itemId: string, trackId: string): string {
  return `/api/media/${encodeURIComponent(itemId)}/subtitles/${encodeURIComponent(trackId)}`
}

/**
 * A frame from the video, for cards (`small`, 480px wide) and banners
 * (`large`, 1280px wide). 404 when the server can't extract one.
 */
export function mediaThumbnailPath(
  id: string,
  size: ThumbnailSize = "small",
): string {
  return `/api/media/${encodeURIComponent(id)}/thumbnail?size=${size}`
}

/**
 * One tile of a file's trickplay images, a JPEG. Take `key` and the tiles
 * from `media.trickplay`; tile `n` holds thumbnails from
 * `n * columns * rows` on. The URL never changes its image, so browsers
 * may cache it for good.
 */
export function trickplayTilePath(
  itemId: string,
  key: string,
  tile: number,
): string {
  return `/api/media/${encodeURIComponent(itemId)}/trickplay/${encodeURIComponent(key)}/${tile}.jpg`
}

/**
 * A file's trickplay images as an HLS image playlist, the
 * `#EXT-X-IMAGES-ONLY` kind with `#EXT-X-TILES` that Roku and Apple's
 * players read, like Jellyfin's `tiles.m3u8`. It lists the tiles of the
 * current set, so it changes when the images are made again. 404 while the
 * file has none; asking queues them like `media.trickplay` does.
 */
export function trickplayPlaylistPath(itemId: string): string {
  return `/api/media/${encodeURIComponent(itemId)}/trickplay/tiles.m3u8`
}

/** The widths the server scales artwork to, smallest first. */
export const ARTWORK_WIDTHS = {
  thumb: 240,
  small: 480,
  medium: 960,
  large: 1920,
} as const

export type ArtworkSize = keyof typeof ARTWORK_WIDTHS

export const ARTWORK_SIZES = Object.keys(ARTWORK_WIDTHS).filter(
  (size): size is ArtworkSize => size in ARTWORK_WIDTHS,
)

/**
 * Artwork from a metadata provider, cached by the server at most as wide
 * as `ARTWORK_WIDTHS` says: `small` for cards, `large` for banners. The
 * URL never changes its image, so browsers may cache it for good.
 */
export function artworkPath(id: string, size: ArtworkSize = "small"): string {
  return `/api/artwork/${encodeURIComponent(id)}?size=${size}`
}

/**
 * A `srcset` with every size up to `largest` and the one above it, so the
 * browser picks the smallest that is sharp at the image's width on screen.
 */
export function artworkSrcSet(id: string, largest: ArtworkSize): string {
  const last = Math.min(
    ARTWORK_SIZES.indexOf(largest) + 1,
    ARTWORK_SIZES.length - 1,
  )
  return ARTWORK_SIZES.slice(0, last + 1)
    .map((size) => `${artworkPath(id, size)} ${ARTWORK_WIDTHS[size]}w`)
    .join(", ")
}

/**
 * A user's picture, a 256px square. Ids change with the picture, so browsers
 * may cache it for good. Take the id from `User.avatarId`.
 */
export function avatarPath(id: string): string {
  return `/api/avatars/${encodeURIComponent(id)}`
}

export const OIDC_START_PATH = "/api/auth/oidc/start"
export const OIDC_CALLBACK_PATH = "/api/auth/oidc/callback"

/**
 * What the OIDC start route should do with the provider's answer. `sign-in`
 * also creates the first admin during setup.
 */
export type OidcMode = "sign-in" | "link"

export function oidcStartPath(mode: OidcMode, redirect?: string): string {
  const params = new URLSearchParams({ mode })
  if (redirect) params.set("redirect", redirect)
  return `${OIDC_START_PATH}?${params}`
}

/**
 * Login page query key the OIDC callback sets when a sign-in's username
 * claim matched an existing account. It only tells the page to look up the
 * `PendingOidcLink`, which decides what shows.
 */
export const OIDC_LINK_QUERY_KEY = "link"

/** Query key the login page reads an OIDC failure from. */
export const AUTH_ERROR_QUERY_KEY = "auth_error"

/**
 * The web page an app opens in the system browser to be signed in, with an
 * `AppAuthorizeRequest` as its query. See `auth.app`.
 */
export const APP_AUTHORIZE_PAGE_PATH = "/authorize"

export function appAuthorizePagePath(request: AppAuthorizeRequest): string {
  const params = new URLSearchParams({
    redirect_uri: request.redirect_uri,
    state: request.state,
    code_challenge: request.code_challenge,
    code_challenge_method: request.code_challenge_method,
    platform: request.platform,
  })
  if (request.device_name) params.set("device_name", request.device_name)
  return `${APP_AUTHORIZE_PAGE_PATH}?${params}`
}

/**
 * Where the authorize page posts the approval, as a form so the CSRF check
 * stops other sites from sending it. Answers with a redirect to the app.
 */
export const APP_AUTHORIZE_PATH = "/api/auth/app/authorize"

/**
 * The web page an invite link opens. The token is the fragment, which the
 * browser doesn't send, so the page hands it to `auth.invite.check`.
 */
export const INVITE_PAGE_PATH = "/invite"

export function invitePagePath(token: string): string {
  return `${INVITE_PAGE_PATH}#${token}`
}

/** The web page where someone enters the code an app shows. */
export const DEVICE_LINK_PAGE_PATH = "/link"

export function deviceLinkPagePath(userCode?: string): string {
  if (!userCode) return DEVICE_LINK_PAGE_PATH
  return `${DEVICE_LINK_PAGE_PATH}?${new URLSearchParams({ code: userCode })}`
}
