import { library } from "@matinee/db"
import { sql } from "drizzle-orm"

import { syncOidcAccounts } from "../auth/oidc-refresh"
import { deleteExpiredSessions } from "../auth/session"
import { db } from "../db"
import { env } from "../env"
import { scans } from "../library/scanner"
import { prefetchArtwork } from "../media/artwork"
import { sweepDownloads } from "../media/downloads"
import { sweepTranscodes } from "../media/hls"
import { probeMissing } from "../media/probe"
import { makeMissingTrickplay, sweepTrickplay } from "../media/trickplay"
import { refreshMetadata } from "../metadata/refresh"
import type { TaskDefinition } from "./scheduler"

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
  scanLibraries,
  refreshStale,
  probeMedia,
  fetchArtwork,
  makeTrickplay,
  cleanTranscodes,
  cleanSessions,
  syncProviderAccounts,
]
