import { access, mkdir, rename, rm } from "node:fs/promises"
import { join } from "node:path"

import type { ThumbnailSize } from "@matinee/contracts"
import type { MediaItemRow } from "@matinee/db"

import { env } from "../env"
import { log } from "../log"
import { probeItem } from "./probe"
import { limiter, run } from "./process"

const WIDTHS = { small: 480, large: 1280 } satisfies Record<
  ThumbnailSize,
  number
>
// Each extraction seeks into a large file; a few at a time keeps a library
// page from starting a hundred ffmpeg processes.
const withSlot = limiter(2)

const dir = join(env.dataDir, "thumbnails")
const inflight = new Map<string, Promise<string | null>>()
// Files ffmpeg couldn't read, so a broken file isn't retried on every view.
const failed = new Set<string>()

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}

async function extract(
  item: MediaItemRow,
  size: ThumbnailSize,
  file: string,
): Promise<string | null> {
  await mkdir(dir, { recursive: true })
  let duration = item.durationSeconds
  if (item.probedAt === null) {
    // The background probe hasn't reached this file yet.
    const probe = await probeItem(item).catch(() => null)
    duration = probe?.format.durationSeconds ?? duration
  }
  // A quarter in skips cold opens and title cards on most episodes.
  const seek = duration
    ? Math.max(0, Math.min(duration * 0.25, duration - 1))
    : 30
  const tmp = `${file}.${process.pid}.tmp.jpg`
  try {
    await run(env.MATINEE_FFMPEG_PATH, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      seek.toFixed(2),
      "-i",
      item.path,
      "-frames:v",
      "1",
      "-vf",
      `scale=${WIDTHS[size]}:-2`,
      "-q:v",
      "4",
      "-y",
      tmp,
    ])
    await rename(tmp, file)
    return file
  } catch (cause) {
    await rm(tmp, { force: true })
    throw cause
  }
}

/**
 * The cached frame for a file, extracting it on first request. Null when
 * ffmpeg can't read the file or isn't installed.
 */
export async function thumbnailFor(
  item: MediaItemRow,
  size: ThumbnailSize,
): Promise<string | null> {
  // The modification time is part of the name, so a replaced file gets a
  // new frame.
  const key = `${item.id}-${item.modifiedAt.getTime()}-${size}`
  const file = join(dir, `${key}.jpg`)
  if (await exists(file)) return file
  if (failed.has(key)) return null

  const pending = inflight.get(key)
  if (pending) return pending
  const job = withSlot(() => extract(item, size, file))
    .catch((cause: unknown) => {
      failed.add(key)
      log.warn(`Couldn't extract a thumbnail for ${item.relativePath}`, cause)
      return null
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}
