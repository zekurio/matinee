import { library } from "@matinee/db"
import { sql } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { probeLibrary } from "../media/probe"
import { refreshLibrary } from "../metadata/refresh"
import { scanLibrary } from "./scanner"

// Files may have arrived while the server was down. Scan everything once,
// after dev restarts and a busy startup have passed.
const STARTUP_SCAN_DELAY_MS = 60_000
const HOUR_MS = 60 * 60_000

const timers = new Set<NodeJS.Timeout>()

/** Queue a full scan of every library, the longest unscanned first. */
async function scanAll(): Promise<void> {
  const rows = await db
    .select({ id: library.id })
    .from(library)
    .orderBy(sql`${library.lastScannedAt} asc nulls first`)
  for (const row of rows) void scanLibrary(row.id)
}

function scanAllLater(why: string): void {
  void scanAll().catch((cause) => log.warn(`Couldn't start the ${why}`, cause))
}

/**
 * Refresh metadata that went stale and probe files that weren't probed
 * while the server was down.
 */
async function refreshAll(): Promise<void> {
  for (const row of await db.select({ id: library.id }).from(library)) {
    void refreshLibrary(row.id)
    void probeLibrary(row.id)
  }
}

/**
 * Refresh stale metadata and probe unprobed files now, scan every library
 * a minute from now, and then every `intervalHours` (0 for never). The
 * timed scan catches what the watcher can't see, like a network share
 * written by another host.
 */
export function startScheduledScans(intervalHours: number): void {
  void refreshAll().catch((cause) =>
    log.warn("Couldn't check libraries for pending work", cause),
  )
  const startup = setTimeout(() => {
    timers.delete(startup)
    scanAllLater("startup scan")
  }, STARTUP_SCAN_DELAY_MS)
  startup.unref()
  timers.add(startup)
  if (intervalHours > 0) {
    const timed = setInterval(
      () => scanAllLater("timed scan"),
      intervalHours * HOUR_MS,
    )
    timed.unref()
    timers.add(timed)
  }
}

export function stopScheduledScans(): void {
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
}
