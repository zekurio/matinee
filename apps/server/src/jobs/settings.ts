import { JobQueueId } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { setting } from "@matinee/db"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { allQueues, queueById } from "./queue"

/*
 * How many jobs each queue runs at once, as an admin set it. A queue
 * without a saved number keeps the one its module picked.
 */

const KEY = "jobs"

const SavedJobs = t.object({
  concurrency: t.partialRecord(JobQueueId, t.number().int().min(1)).catch({}),
})
type SavedJobs = t.infer<typeof SavedJobs>

let saved: SavedJobs = { concurrency: {} }

/** Apply what was saved. Call once the queues are defined. */
export async function loadJobSettings(): Promise<void> {
  const [row] = await db.select().from(setting).where(eq(setting.key, KEY))
  const parsed = SavedJobs.safeParse(row?.value ?? {})
  if (!parsed.success) {
    log.warn(
      "Ignoring saved job settings that no longer validate",
      parsed.error,
    )
  }
  saved = parsed.success ? parsed.data : { concurrency: {} }
  for (const queue of allQueues()) {
    const concurrency = saved.concurrency[queue.id]
    if (concurrency) queue.setConcurrency(concurrency)
  }
}

/**
 * Change queues' concurrency now and for the next start. The caller checks
 * the numbers against each queue's maximum.
 */
export async function saveConcurrency(
  changes: Partial<Record<JobQueueId, number>>,
): Promise<void> {
  const concurrency = { ...saved.concurrency }
  for (const [id, value] of Object.entries(changes)) {
    const parsed = JobQueueId.safeParse(id)
    const queue = parsed.success ? queueById(parsed.data) : undefined
    if (!queue || value === undefined) continue
    queue.setConcurrency(value)
    const applied = queue.status().concurrency
    // The default needn't be stored; a later default then applies.
    if (applied === queue.defaultConcurrency) delete concurrency[queue.id]
    else concurrency[queue.id] = applied
  }
  const next: SavedJobs = { concurrency }
  await db
    .insert(setting)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value: next, updatedAt: new Date() },
    })
  saved = next
}
