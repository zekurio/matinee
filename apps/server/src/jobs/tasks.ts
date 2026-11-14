import { library } from "@matinee/db"
import { sql } from "drizzle-orm"

import { syncOidcAccounts } from "../auth/oidc-refresh"
import { deleteExpiredSessions } from "../auth/session"
import { forgetBrowsedPages } from "../catalog/cache"
import { db } from "../db"
import { env } from "../env"
import { scans } from "../library/scanner"
import { log } from "../log"
import { prefetchArtwork } from "../media/artwork"
import { sweepDownloads } from "../media/downloads"
import { sweepTranscodes } from "../media/hls"
import { probeMissing } from "../media/probe"
import { prepareMissingSubtitles } from "../media/subtitles"
import { makeMissingTrickplay, sweepTrickplay } from "../media/trickplay"
import { refreshMetadata } from "../metadata/refresh"
import { events } from "../realtime/events"
import { arrivals } from "../requests/arrival"
import { dispatchQueued } from "../requests/dispatch"
import { pollProgress } from "../requests/poll"
import type { TaskDefinition } from "./scheduler"

// Queue database work on approval, scope edits and retries without waiting for the sweep.
events.subscribe("requests", () => {
  void dispatchQueued().catch((cause) =>
    log.error("Cannot queue accepted requests", cause),
  )
})

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** Full scans of every library, the longest unscanned first. */
const scanLibraries: TaskDefinition = {
  id: "scan-libraries",
  name: "Scan libraries",
  description:
    "Look for new, changed, and removed files in every library, for changes the folder watcher can't see, like a network share written by another host.",
  queue: "library-scan",
  // Files may have arrived while the server was down. Scan once dev
  // restarts and a busy startup have passed.
  startupDelayMs: MINUTE_MS,
  intervalMs:
    env.MATINEE_SCAN_INTERVAL_HOURS > 0
      ? env.MATINEE_SCAN_INTERVAL_HOURS * HOUR_MS
      : null,
  run: async ({ signal, progress }) => {
    const rows = await db
      .select({ id: library.id })
      .from(library)
      .orderBy(sql`${library.lastScannedAt} asc nulls first`)
    let done = 0
    const scanned = rows.map((row) =>
      scans
        .run({ libraryId: row.id, targets: null, regroup: false })
        .catch(() => {
          // Logged by the queue.
        })
        .finally(() => progress(++done / rows.length)),
    )
    signal.addEventListener("abort", () => {
      for (const row of rows) scans.cancel(row.id)
    })
    await Promise.all(scanned)
  },
}

const refreshStale: TaskDefinition = {
  id: "refresh-metadata",
  name: "Refresh metadata",
  description:
    "Fetch metadata for titles without a match and for ones that went stale, for new episodes and artwork.",
  queue: "metadata",
  startupDelayMs: 0,
  intervalMs: 24 * HOUR_MS,
  run: ({ signal }) => refreshMetadata({ signal }),
}

const probeMedia: TaskDefinition = {
  id: "probe-media",
  name: "Read media info",
  description:
    "Run ffprobe on files that weren't read yet. Scans queue their new files on their own.",
  queue: "media-probe",
  startupDelayMs: 0,
  intervalMs: 24 * HOUR_MS,
  run: ({ signal }) => probeMissing({ signal }),
}

const fetchArtwork: TaskDefinition = {
  id: "prefetch-artwork",
  name: "Fetch artwork",
  description:
    "Download images the server has no blurred placeholder for yet, posters and backdrops first. Metadata fetches queue their images on their own; this catches up after a restart or a failed download.",
  queue: "artwork",
  // After the startup metadata fetch has had a head start.
  startupDelayMs: MINUTE_MS,
  intervalMs: 24 * HOUR_MS,
  run: (context) => prefetchArtwork(context),
}

const prepareSubtitles: TaskDefinition = {
  id: "prepare-subtitles",
  name: "Prepare subtitles",
  description:
    "Cache indexed text subtitles and delete outputs of removed or changed files. Picture subtitles stay on demand.",
  queue: "subtitle-prepare",
  startupDelayMs: MINUTE_MS,
  intervalMs: 24 * HOUR_MS,
  run: (context) => prepareMissingSubtitles(context),
}

const makeTrickplay: TaskDefinition = {
  id: "make-trickplay",
  name: "Make trickplay images",
  description:
    "Make the seek bar's thumbnails for videos without them, or whose file or settings changed, newest first. Scans queue their new files on their own. Also deletes the images of files that are gone.",
  queue: "trickplay",
  // Only on its interval, not after every restart: a run can take hours.
  startupDelayMs: null,
  intervalMs: 24 * HOUR_MS,
  run: async ({ signal, progress }) => {
    await sweepTrickplay()
    await makeMissingTrickplay({ signal, progress })
  },
}

const cleanTranscodes: TaskDefinition = {
  id: "clean-transcodes",
  name: "Clean up encodes",
  description: `Delete encodes nobody played for ${env.MATINEE_TRANSCODE_CACHE_HOURS} hours, then the least recently played past ${env.MATINEE_TRANSCODE_CACHE_GB} GB, and downloads nobody fetched from for ${env.MATINEE_TRANSCODE_CACHE_HOURS} hours.`,
  queue: null,
  startupDelayMs: 0,
  intervalMs: 10 * MINUTE_MS,
  run: async () => {
    await sweepTranscodes()
    await sweepDownloads()
  },
}

const cleanSessions: TaskDefinition = {
  id: "clean-sessions",
  name: "Delete expired sessions",
  description: "Remove sign-ins that expired from the database.",
  queue: null,
  startupDelayMs: 0,
  intervalMs: 6 * HOUR_MS,
  run: () => deleteExpiredSessions(),
}

const forgetBrowsed: TaskDefinition = {
  id: "forget-browsed-pages",
  name: "Forget browsed catalog pages",
  description:
    "Delete pages of the filtered catalog that nobody opened for a week.",
  queue: null,
  startupDelayMs: 5 * MINUTE_MS,
  intervalMs: 24 * HOUR_MS,
  run: () => forgetBrowsedPages(),
}

const syncProviderAccounts: TaskDefinition = {
  id: "sync-oidc-accounts",
  name: "Sync provider accounts",
  description:
    "Refresh roles, pictures, and access from the sign-in provider for accounts with a refresh token.",
  queue: null,
  startupDelayMs: 3 * MINUTE_MS,
  intervalMs: 6 * HOUR_MS,
  run: (context) => syncOidcAccounts(context),
}

/** The scheduled tasks, in the order admins see them. */
export const TASKS: TaskDefinition[] = [
  {
    id: "dispatch-requests",
    name: "Send requests",
    description: "Find accepted requests waiting to be sent.",
    queue: "request-dispatch",
    startupDelayMs: 0,
    intervalMs: MINUTE_MS,
    run: dispatchQueued,
  },
  {
    id: "poll-requests",
    name: "Read request progress",
    description: "Check active requests through each connection once.",
    queue: "request-progress",
    startupDelayMs: 0,
    intervalMs: MINUTE_MS,
    run: pollProgress,
  },
  {
    id: "reconcile-requests",
    name: "Reconcile request arrivals",
    description: "Find playable films and seasons for accepted requests.",
    queue: "request-arrival",
    startupDelayMs: 0,
    intervalMs: 5 * MINUTE_MS,
    run: async () => {
      await arrivals.run(null)
    },
  },
  scanLibraries,
  refreshStale,
  probeMedia,
  fetchArtwork,
  prepareSubtitles,
  makeTrickplay,
  cleanTranscodes,
  cleanSessions,
  forgetBrowsed,
  syncProviderAccounts,
]
