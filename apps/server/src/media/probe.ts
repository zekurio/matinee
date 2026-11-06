import type { MediaProbe } from "@matinee/contracts"
import { mediaItem, type MediaItemRow } from "@matinee/db"
import { and, asc, eq, gt, isNull } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { runFfprobe } from "./ffprobe"
import { limiter, processFailureKind } from "./process"

const BATCH_SIZE = 50
// Each probe reads a few megabytes from the start of a file. A few at a
// time keeps a first scan of a big library from crowding out playback.
const withSlot = limiter(3)

const inflight = new Map<string, Promise<MediaProbe | null>>()
const running = new Map<string, Promise<void>>()
// Libraries that asked for another pass while one was running.
const again = new Set<string>()

function failureMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "Unknown error"
  return message.slice(0, 1000)
}

async function probeAndStore(row: MediaItemRow): Promise<MediaProbe | null> {
  let probe: MediaProbe | null = null
  let error: string | null = null
  try {
    probe = await runFfprobe(row.path)
  } catch (cause) {
    const kind = processFailureKind(cause)
    // Without ffprobe there is nothing to record about the file.
    if (kind === "start") throw cause
    error = failureMessage(cause)
    log.warn(`Couldn't probe ${row.relativePath}: ${error}`)
    // A timeout is more often a stalled mount than a broken file, so it
    // isn't stored and the next pass tries again.
    if (kind === "timeout") return null
  }
  // A failure is stored too, so a broken file waits until it changes.
  // Matching size and time skips the write when a scan saw the file change
  // meanwhile; it cleared probedAt and the file gets probed again.
  await db
    .update(mediaItem)
    .set({
      probe,
      probedAt: new Date(),
      probeError: error,
      durationSeconds: probe?.format.durationSeconds ?? undefined,
    })
    .where(
      and(
        eq(mediaItem.id, row.id),
        eq(mediaItem.sizeBytes, row.sizeBytes),
        eq(mediaItem.modifiedAt, row.modifiedAt),
      ),
    )
  return probe
}

/**
 * Probe a file and store what ffprobe found, joining a probe of it that is
 * already running. Null when ffprobe couldn't read the file; throws when
 * ffprobe can't run at all.
 */
export function probeItem(row: MediaItemRow): Promise<MediaProbe | null> {
  const pending = inflight.get(row.id)
  if (pending) return pending
  const job = probeAndStore(row).finally(() => inflight.delete(row.id))
  inflight.set(row.id, job)
  return job
}

/** One pass over the library's files that are due, in id order. */
async function probePass(
  libraryId: string,
): Promise<{ read: number; failed: number }> {
  let read = 0
  let failed = 0
  let after: string | null = null
  while (true) {
    const rows = await db
      .select()
      .from(mediaItem)
      .where(
        and(
          eq(mediaItem.libraryId, libraryId),
          isNull(mediaItem.probedAt),
          after === null ? undefined : gt(mediaItem.id, after),
        ),
      )
      .orderBy(asc(mediaItem.id))
      .limit(BATCH_SIZE)
    const last = rows.at(-1)
    if (!last) break
    after = last.id
    const results = await Promise.allSettled(
      rows.map((row) => withSlot(() => probeItem(row))),
    )
    for (const result of results) {
      if (result.status === "rejected") throw result.reason
      if (result.value) read++
      else failed++
    }
  }
  return { read, failed }
}

/**
 * Probe the library's new, changed, and never probed files in the
 * background. A call during a run adds one more pass after it, for files a
 * scan wrote meanwhile.
 */
export function probeLibrary(libraryId: string): Promise<void> {
  const existing = running.get(libraryId)
  if (existing) {
    again.add(libraryId)
    return existing
  }
  const job = (async () => {
    const started = Date.now()
    let read = 0
    let failed = 0
    try {
      do {
        again.delete(libraryId)
        const pass = await probePass(libraryId)
        read += pass.read
        failed += pass.failed
      } while (again.has(libraryId))
      const total = read + failed
      if (total > 0) {
        log.info(
          `Probed ${total} file${total === 1 ? "" : "s"} in library ${libraryId} in ${Date.now() - started} ms${failed > 0 ? `, ${failed} unreadable` : ""}`,
        )
      }
    } catch (cause) {
      if (processFailureKind(cause) === "start") {
        log.warn(`Skipping media probes: ${failureMessage(cause)}`)
      } else log.error(`Probing library ${libraryId} failed`, cause)
    } finally {
      running.delete(libraryId)
      again.delete(libraryId)
    }
  })()
  running.set(libraryId, job)
  return job
}
