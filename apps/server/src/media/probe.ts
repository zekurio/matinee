import type { Stats } from "node:fs"

import type { MediaProbe } from "@matinee/contracts"
import { mediaItem, type MediaItemRow } from "@matinee/db"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "../db"
import { defineQueue, perCpu } from "../jobs/queue"
import { log } from "../log"
import { runFfprobe } from "./ffprobe"
import { processFailureKind } from "./process"

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
  // meanwhile; it cleared probedAt and the file gets probed again. Matching
  // the path does the same for a file a scan moved, whose old path failed.
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
        eq(mediaItem.path, row.path),
      ),
    )
  return probe
}

type ProbeJob = { id: string; relativePath: string }

/**
 * ffprobe for each new or changed file. Each probe reads a few megabytes
 * from the start of a file; a few at a time keeps a first scan of a big
 * library from crowding out playback. A job reads the row again, so a file
 * probed meanwhile isn't probed twice.
 */
export const probes = defineQueue<ProbeJob, MediaProbe | null>({
  id: "media-probe",
  name: "Media info",
  description: "Read the streams of new and changed files with ffprobe.",
  concurrency: 3,
  tuning: {
    // ffprobe mostly waits on the disk, so allow one per CPU.
    max: perCpu(1, { min: 4, max: 16 }),
    note: "Files ffprobe reads at once. Raise it to finish the first scan of a large library sooner.",
  },
  key: (job) => job.id,
  label: (job) => job.relativePath,
  failure: (job) => `Couldn't probe ${job.relativePath}`,
  // Without ffprobe no file can be read, so stop until the next scan.
  fatal: (cause) =>
    processFailureKind(cause) === "start"
      ? {
          message: `Skipping media probes: ${failureMessage(cause)}`,
          drop: () => true,
        }
      : null,
  summary: ({ completed, failed, ms }) =>
    completed + failed > 1
      ? `Probed ${completed} file${completed === 1 ? "" : "s"} in ${ms} ms${failed > 0 ? `, ${failed} failed` : ""}`
      : null,
  run: async (job) => {
    const [row] = await db
      .select()
      .from(mediaItem)
      .where(eq(mediaItem.id, job.id))
    if (!row) return null
    if (row.probedAt !== null) return row.probe
    return probeAndStore(row)
  },
})

/**
 * Probe a file now, ahead of the background probes, and store what ffprobe
 * found. Null when ffprobe couldn't read the file; throws when ffprobe
 * can't run at all.
 */
export function probeItem(row: MediaItemRow): Promise<MediaProbe | null> {
  return probes.run(
    { id: row.id, relativePath: row.relativePath },
    { priority: "high" },
  )
}

/**
 * What ffprobe read from the file, probing it now if the background probe
 * hasn't reached it yet. Null when ffprobe couldn't read it, and when the
 * file changed since the scan that stored the probe: its stream indexes
 * may be gone, and the next scan probes it again.
 */
export async function currentProbe(
  item: MediaItemRow,
  info: Stats,
): Promise<MediaProbe | null> {
  if (
    info.size !== item.sizeBytes ||
    info.mtime.getTime() !== item.modifiedAt.getTime()
  ) {
    return null
  }
  if (item.probedAt !== null) return item.probe
  return probeItem(item).catch(() => null)
}

/**
 * Queue a probe of every file that needs one, in the library or in all of
 * them. Resolves once those probes are done.
 */
export async function probeMissing(
  options: { libraryId?: string; signal?: AbortSignal } = {},
): Promise<void> {
  const rows = await db
    .select({ id: mediaItem.id, relativePath: mediaItem.relativePath })
    .from(mediaItem)
    .where(
      and(
        isNull(mediaItem.probedAt),
        options.libraryId
          ? eq(mediaItem.libraryId, options.libraryId)
          : undefined,
      ),
    )
  const done = rows.map((row) => probes.run(row, { priority: "low" }))
  options.signal?.addEventListener("abort", () => {
    for (const row of rows) probes.cancel(row.id)
  })
  await Promise.allSettled(done)
}
