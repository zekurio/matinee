import { type ChildProcess, spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  utimes,
} from "node:fs/promises"
import { join } from "node:path"

import { env } from "../env"
import { log } from "../log"
import {
  addEncodeSeconds,
  type SessionOwner,
  trackStream,
} from "../stats/sessions"
import { transcodingSettings } from "../transcode/settings"
import type { EncodeSpec } from "./hls-encode"

/*
 * Shared HLS encodes, the way Jellyfin keeps its transcodes: ffmpeg writes
 * fMP4 segments of the file's own timeline into a directory per encode,
 * and the server hands them out as players ask. Unlike Jellyfin, an encode
 * isn't tied to one player. Everyone who plays the same file the same way
 * reads the same segments, and a segment once written is never encoded
 * again while it stays on disk.
 *
 * A run is one ffmpeg process, from some segment on. A request for a
 * segment that isn't there joins the run about to write it, or starts a
 * new run there, as a seek does. Runs stop when they reach segments
 * another run wrote, when no player needs them, or at the end of the file.
 * With throttling on, a run pauses once it is far enough ahead of every
 * player reading from it.
 */

const KEY = /^[0-9a-f]{32}$/
const TICK_MS = 250
// A request waiting on a segment checks for it this often itself, rather
// than waiting up to a tick to hear that ffmpeg finished it.
const WAIT_POLL_MS = 25
// A player that asked for nothing in this long has left or paused.
const VIEWER_IDLE_MS = 2 * 60_000
// A run no player reads from stops after this.
const ORPHAN_MS = 15_000
// After its only player closed, a run stops this soon.
const CLOSED_GRACE_MS = 2_000
// After a run fails without writing a segment, don't start another this soon.
const FAILURE_BACKOFF_MS = 10_000
// Longest a request waits for its segment while a run works towards it.
const SEGMENT_WAIT_MS = 2 * 60_000
// Missing segments this far past a request start a run, so playback that
// reaches the end of what's on disk doesn't wait for ffmpeg to start.
const PREFETCH_S = 30
// Jellyfin: a request further than this past a run's position starts a
// run of its own rather than waiting.
const RESTART_GAP_S = 24
// Jellyfin never throttles closer than this.
const MIN_THROTTLE_S = 60
const DELETE_EVERY_TICKS = 20
const TOUCH_MS = 60_000
const STDERR_LINES = 20

type Run = {
  /** The first segment it writes. */
  start: number
  /** The last segment it finished, `start - 1` before the first. */
  head: number
  child: ChildProcess
  exited: boolean
  /** The server stopped it. */
  stopping: boolean
  paused: boolean
  /** When a player last needed it. */
  neededAt: number
  playlistSize: number
  stderr: string[]
}

type Viewer = {
  /** The segment it asked for last. */
  segment: number
  at: number
  /** The run writing what it needs next, if any. */
  run: Run | null
  owner: SessionOwner | null
}

type Job = {
  spec: EncodeSpec
  dir: string
  /** Segments on disk and complete. */
  done: Set<number>
  hasInit: boolean
  /** The last segment, once a run reached the end of the file. */
  end: number | null
  runs: Set<Run>
  viewers: Map<string, Viewer>
  failedAt: number
  timer: NodeJS.Timeout | null
  ticking: boolean
  ticks: number
  waiters: Set<() => void>
  touchedAt: number
}

const jobs = new Map<string, Job>()
const opening = new Map<string, Promise<Job>>()

function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}

function segmentFile(job: Job, segment: number): string {
  return join(job.dir, `${segment}.m4s`)
}

function segmentsIn(job: Job, seconds: number): number {
  return Math.max(1, Math.ceil(seconds / job.spec.segmentSeconds))
}

function lastSegment(job: Job): number {
  return job.end ?? job.spec.segmentCount - 1
}

function live(run: Run): boolean {
  return !run.exited && !run.stopping
}

function notify(job: Job): void {
  const waiters = [...job.waiters]
  job.waiters.clear()
  for (const wake of waiters) wake()
}

/**
 * Resolves on the job's next change, or after a short wait and a look at
 * the runs' playlists for segments they finished meanwhile.
 */
async function nextSegments(job: Job): Promise<void> {
  await changed(job, WAIT_POLL_MS)
  await Promise.all([...job.runs].map((run) => updateHead(job, run)))
}

/** Resolves on the job's next change, or after `ms`. */
function changed(job: Job, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(wake, ms)
    function wake() {
      clearTimeout(timer)
      job.waiters.delete(wake)
      resolve()
    }
    job.waiters.add(wake)
  })
}

/** The encode's state, from memory or from what an earlier run left on disk. */
export function openJob(spec: EncodeSpec): Promise<Job> {
  const known = jobs.get(spec.key)
  if (known) return Promise.resolve(known)
  const pending = opening.get(spec.key)
  if (pending) return pending
  const promise = (async () => {
    const dir = join(env.transcodeDir, spec.key)
    await mkdir(dir, { recursive: true })
    const names = await readdir(dir)
    const done = new Set<number>()
    for (const name of names) {
      const match = /^(\d+)\.m4s$/.exec(name)
      if (match) done.add(Number(match[1]))
    }
    const job: Job = {
      spec,
      dir,
      done,
      hasInit: names.includes("init.mp4"),
      end: null,
      runs: new Set(),
      viewers: new Map(),
      failedAt: 0,
      timer: null,
      ticking: false,
      ticks: 0,
      waiters: new Set(),
      touchedAt: Date.now(),
    }
    jobs.set(spec.key, job)
    return job
  })().finally(() => opening.delete(spec.key))
  opening.set(spec.key, promise)
  return promise
}

/** An encode this process has open. */
export function knownJob(key: string): Job | undefined {
  return KEY.test(key) ? jobs.get(key) : undefined
}

/**
 * The live run that will write `segment` soon: one that started at or
 * before it, is close enough, and has nothing written in between, where
 * it would stop.
 */
function producer(job: Job, segment: number): Run | null {
  if (segment > lastSegment(job)) return null
  const gap = segmentsIn(job, RESTART_GAP_S)
  let best: Run | null = null
  for (const run of job.runs) {
    if (!live(run) || run.start > segment) continue
    if (segment - (run.head + 1) > gap) continue
    let blocked = false
    for (let k = run.head + 1; k < segment; k++) {
      if (job.done.has(k)) {
        blocked = true
        break
      }
    }
    if (!blocked && (!best || run.head > best.head)) best = run
  }
  return best
}

function firstMissing(job: Job, from: number): number | null {
  const last = lastSegment(job)
  for (let k = from; k <= last; k++) if (!job.done.has(k)) return k
  return null
}

function viewerOf(
  job: Job,
  key: string,
  owner: SessionOwner | null,
  segment: number,
): Viewer {
  let viewer = job.viewers.get(key)
  if (!viewer) {
    viewer = { segment, at: Date.now(), run: null, owner }
    job.viewers.set(key, viewer)
  }
  viewer.owner ??= owner
  return viewer
}

/** Make sure something writes the segments `viewer` needs from `segment` on. */
function want(job: Job, viewer: Viewer, segment: number): void {
  const now = Date.now()
  viewer.segment = segment
  viewer.at = now
  const missing = firstMissing(job, segment)
  if (missing === null) {
    viewer.run = null
    return
  }
  // Far ahead, follow the run that's writing there if there is one, so it
  // keeps going, but don't start one yet.
  const near = missing - segment <= segmentsIn(job, PREFETCH_S)
  const run =
    producer(job, missing) ??
    (near ? startRun(job, missing, viewer.owner) : null)
  const left = viewer.run
  viewer.run = run
  // A player that jumped elsewhere, as a seek does, is done with the run it
  // read. Unless someone else reads it, it stops now, as Jellyfin's does,
  // rather than encode on beside the new one: two 4K encodes take twice
  // the memory.
  if (left && left !== run) releaseRun(job, left, now, 0)
  if (run) {
    run.neededAt = now
    // What it writes next is close to the player now.
    if (near) resume(run)
  }
  ensureTimer(job)
}

function startRun(
  job: Job,
  start: number,
  owner: SessionOwner | null,
): Run | null {
  if (Date.now() - job.failedAt < FAILURE_BACKOFF_MS) return null
  if (start > lastSegment(job)) return null
  let args: string[]
  try {
    args = job.spec.args(start, job.dir)
  } catch (cause) {
    log.warn("Couldn't build a video encode", cause)
    return null
  }
  // The sweep may have removed the directory since the job opened.
  mkdirSync(job.dir, { recursive: true })
  const child = spawn(env.MATINEE_FFMPEG_PATH, args, {
    stdio: [job.spec.pauseKeys ? "pipe" : "ignore", "ignore", "pipe"],
  })
  const run: Run = {
    start,
    head: start - 1,
    child,
    exited: false,
    stopping: false,
    paused: false,
    neededAt: Date.now(),
    playlistSize: 0,
    stderr: [],
  }
  job.runs.add(run)
  const untrack = trackStream(null)
  const started = performance.now()
  child.stdin?.on("error", () => {
    // ffmpeg exited; the close handler deals with it.
  })
  child.stderr?.setEncoding("utf8")
  child.stderr?.on("data", (chunk: string) => {
    run.stderr.push(...chunk.split("\n").filter((line) => line.trim()))
    run.stderr.splice(0, Math.max(0, run.stderr.length - STDERR_LINES))
  })
  child.on("error", (cause) => log.warn("Couldn't start ffmpeg", cause))
  child.once("close", (code) => {
    run.exited = true
    untrack()
    if (owner) {
      const seconds = (performance.now() - started) / 1000
      void addEncodeSeconds(owner, seconds).catch((cause: unknown) =>
        log.warn("Couldn't record a stream in its session", cause),
      )
    }
    void finishRun(job, run, code)
      .catch((cause: unknown) => log.warn("Couldn't clean up an encode", cause))
      .finally(() => {
        job.runs.delete(run)
        notify(job)
      })
  })
  ensureTimer(job)
  return run
}

function stop(run: Run): void {
  if (run.exited || run.stopping) return
  run.stopping = true
  // Paused or not, SIGKILL ends it. Only complete segments carry their
  // names, so nothing it leaves behind is half written.
  run.child.kill("SIGKILL")
}

function pause(run: Run): void {
  if (run.paused || !live(run)) return
  run.paused = true
  run.child.stdin?.write("p")
}

function resume(run: Run): void {
  if (!run.paused || !live(run)) return
  run.paused = false
  run.child.stdin?.write("u")
}

/** Note the segments a run finished, from the playlist ffmpeg rewrites. */
async function updateHead(job: Job, run: Run): Promise<void> {
  const playlist = join(job.dir, `run-${run.start}.m3u8`)
  const info = await stat(playlist).catch(() => null)
  if (!info || info.size === run.playlistSize) return
  run.playlistSize = info.size
  const text = await readFile(playlist, "utf8").catch(() => "")
  const count = text
    .split("\n")
    .filter((line) => line.startsWith("#EXTINF")).length
  const head = run.start + count - 1
  if (head <= run.head) return
  for (let k = run.head + 1; k <= head; k++) job.done.add(k)
  run.head = head
  await promoteInit(job, run)
  notify(job)
}

/**
 * Every run writes its own init segment, and they are all the same. The
 * first complete one becomes the encode's.
 */
async function promoteInit(job: Job, run: Run): Promise<void> {
  if (job.hasInit || run.head < run.start) return
  const own = join(job.dir, `init-${run.start}.mp4`)
  const ok = await rename(own, join(job.dir, "init.mp4")).then(
    () => true,
    () => false,
  )
  if (ok) job.hasInit = true
}

async function finishRun(
  job: Job,
  run: Run,
  code: number | null,
): Promise<void> {
  await updateHead(job, run)
  // A killed run may have finished a segment it hadn't listed yet.
  const next = run.head + 1
  if (!job.done.has(next) && (await exists(segmentFile(job, next)))) {
    job.done.add(next)
    run.head = next
    await promoteInit(job, run)
  }
  if (!run.stopping) {
    if (code === 0) {
      // ffmpeg reached the end of the file, which may be short of what
      // the probe said.
      job.end = run.head
      if (run.head < run.start) job.failedAt = Date.now()
    } else {
      log.warn(
        `ffmpeg stopped encoding ${job.spec.relativePath} (exit ${code}): ${run.stderr.join("\n")}`,
      )
      if (run.head < run.start) job.failedAt = Date.now()
    }
  }
  await Promise.all(
    [`init-${run.start}.mp4`, `run-${run.start}.m3u8`].map((name) =>
      unlink(join(job.dir, name)).catch(() => {
        // Not written, or promoted.
      }),
    ),
  )
}

function ensureTimer(job: Job): void {
  if (job.timer) return
  job.timer = setInterval(() => void tick(job), TICK_MS)
  job.timer.unref()
}

async function tick(job: Job): Promise<void> {
  if (job.ticking) return
  job.ticking = true
  try {
    await Promise.all([...job.runs].map((run) => updateHead(job, run)))
    await enforce(job)
  } catch (cause) {
    log.warn("Couldn't check an encode", cause)
  } finally {
    job.ticking = false
  }
}

async function enforce(job: Job): Promise<void> {
  const now = Date.now()
  const settings = await transcodingSettings()
  for (const [key, viewer] of job.viewers) {
    if (now - viewer.at > VIEWER_IDLE_MS) job.viewers.delete(key)
  }
  const throttleSegments = segmentsIn(
    job,
    Math.max(settings.throttleDelaySeconds, MIN_THROTTLE_S),
  )
  const throttle = settings.enableThrottling && job.spec.pauseKeys
  for (const run of job.runs) {
    if (!live(run)) continue
    // It caught up with segments another run wrote.
    if (job.done.has(run.head + 1)) {
      stop(run)
      continue
    }
    const readers = [...job.viewers.values()].filter(
      (viewer) => viewer.run === run,
    )
    if (readers.length > 0) run.neededAt = now
    else if (now - run.neededAt > ORPHAN_MS) {
      stop(run)
      continue
    }
    const furthest = Math.max(...readers.map((viewer) => viewer.segment))
    if (
      throttle &&
      readers.length > 0 &&
      run.head - furthest > throttleSegments
    ) {
      pause(run)
    } else resume(run)
  }

  job.ticks++
  if (
    settings.enableSegmentDeletion &&
    job.viewers.size > 0 &&
    job.ticks % DELETE_EVERY_TICKS === 0
  ) {
    const slowest = Math.min(
      ...[...job.viewers.values()].map((viewer) => viewer.segment),
    )
    const below = slowest - segmentsIn(job, settings.segmentKeepSeconds)
    const old = [...job.done].filter((segment) => segment < below)
    for (const segment of old) job.done.delete(segment)
    await Promise.all(
      old.map((segment) =>
        unlink(segmentFile(job, segment)).catch(() => {
          // Gone already.
        }),
      ),
    )
  }

  const active = job.runs.size > 0 || job.viewers.size > 0
  if (active && now - job.touchedAt > TOUCH_MS) {
    job.touchedAt = now
    // The sweep reads the directory's time to find encodes nobody plays.
    await utimes(job.dir, new Date(now), new Date(now)).catch(() => {
      // Swept meanwhile; the next run makes it again.
    })
  }
  if (!active && job.timer) {
    clearInterval(job.timer)
    job.timer = null
  }
}

/**
 * Wait until `segment` is on disk, while some run works towards it. False
 * when nothing will write it, or the request went away.
 */
async function waitFor(
  job: Job,
  segment: number,
  signal: AbortSignal,
): Promise<boolean> {
  const deadline = Date.now() + SEGMENT_WAIT_MS
  while (!job.done.has(segment)) {
    if (signal.aborted || Date.now() > deadline) return false
    if (!producer(job, segment)) return false
    await nextSegments(job)
  }
  return true
}

export type Watcher = {
  /** The player's session id, else something naming the user. */
  key: string
  owner: SessionOwner | null
}

/** A player opened the playlist and starts at `seconds`. */
export function startWatching(
  job: Job,
  seconds: number,
  watcher: Watcher,
): void {
  const segment = Math.min(
    lastSegment(job),
    Math.floor(seconds / job.spec.segmentSeconds),
  )
  const viewer = viewerOf(job, watcher.key, watcher.owner, segment)
  want(job, viewer, segment)
}

/** Whether the encode has segment `segment`. */
export function hasSegment(job: Job, segment: number): boolean {
  return segment >= 0 && segment <= lastSegment(job)
}

/** The path of a segment once it's written, or null when it won't be. */
export async function segmentPath(
  job: Job,
  segment: number,
  watcher: Watcher,
  signal: AbortSignal,
): Promise<string | null> {
  if (!hasSegment(job, segment)) return null
  const viewer = viewerOf(job, watcher.key, watcher.owner, segment)
  // Twice, for a segment deleted behind the server's back.
  for (let attempt = 0; attempt < 2; attempt++) {
    want(job, viewer, segment)
    if (!(await waitFor(job, segment, signal))) return null
    const path = segmentFile(job, segment)
    if (await exists(path)) return path
    job.done.delete(segment)
  }
  return null
}

/** The path of the init segment once a run wrote one, or null. */
export async function initPath(
  job: Job,
  watcher: Watcher,
  signal: AbortSignal,
): Promise<string | null> {
  const deadline = Date.now() + SEGMENT_WAIT_MS
  const path = join(job.dir, "init.mp4")
  while (true) {
    if (job.hasInit) {
      if (await exists(path)) return path
      // Deleted behind the server's back.
      job.hasInit = false
    }
    if (signal.aborted || Date.now() > deadline) return null
    if (![...job.runs].some(live)) {
      const viewer = viewerOf(job, watcher.key, watcher.owner, 0)
      // Even with every segment near the player on disk, a run writes one.
      want(job, viewer, viewer.segment)
      if (![...job.runs].some(live)) {
        const run = startRun(job, viewer.segment, viewer.owner)
        if (!run) return null
        viewer.run = run
      }
    }
    await nextSegments(job)
  }
}

/**
 * The playlist: every segment of the file, written or not. `query` goes on
 * every segment URL, so a segment request after a restart can build the
 * encode again.
 */
export function playlist(job: Job, query: string): string {
  const { spec } = job
  const seconds = spec.segmentSeconds
  const count = lastSegment(job) + 1
  const suffix = query ? `?${query}` : ""
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${Math.ceil(seconds)}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-MAP:URI="${spec.key}/init.mp4${suffix}"`,
  ]
  for (let k = 0; k < count; k++) {
    const length =
      k === count - 1 && job.end === null
        ? Math.max(0.001, spec.durationSeconds - k * seconds)
        : seconds
    lines.push(`#EXTINF:${length.toFixed(6)},`, `${spec.key}/${k}.m4s${suffix}`)
  }
  lines.push("#EXT-X-ENDLIST", "")
  return lines.join("\n")
}

/** Sessions with a player reading from a running encode. */
export function encodingSessions(): Set<string> {
  const sessions = new Set<string>()
  for (const job of jobs.values()) {
    for (const viewer of job.viewers.values()) {
      if (viewer.owner && viewer.run && live(viewer.run)) {
        sessions.add(viewer.owner.id)
      }
    }
  }
  return sessions
}

/**
 * `run` stops after `graceMs` once no player reads from it any more, at
 * the next tick.
 */
function releaseRun(job: Job, run: Run, now: number, graceMs: number): void {
  const read = [...job.viewers.values()].some((viewer) => viewer.run === run)
  if (!read) run.neededAt = Math.min(run.neededAt, now - ORPHAN_MS + graceMs)
}

/**
 * A player closed: its runs stop soon unless someone else reads them.
 * Sooner than an orphan that may only be between requests: the player
 * said it's gone, so only a quick reload would come back for it.
 */
export function releaseSession(session: string): void {
  const now = Date.now()
  for (const job of jobs.values()) {
    const viewer = job.viewers.get(session)
    if (!viewer) continue
    job.viewers.delete(session)
    if (viewer.run) releaseRun(job, viewer.run, now, CLOSED_GRACE_MS)
  }
}

/** Stop every run, for shutdown. */
export function stopEncodes(): void {
  for (const job of jobs.values()) for (const run of job.runs) stop(run)
}

type CacheEntry = { key: string; path: string; usedAt: number; bytes: number }

async function directoryBytes(path: string): Promise<number> {
  const names = await readdir(path).catch(() => [])
  const sizes = await Promise.all(
    names.map((name) =>
      stat(join(path, name)).then(
        (info) => info.size,
        () => 0,
      ),
    ),
  )
  return sizes.reduce((sum, size) => sum + size, 0)
}

async function remove(entry: CacheEntry): Promise<void> {
  const job = jobs.get(entry.key)
  if (job) {
    jobs.delete(entry.key)
    job.done.clear()
    job.hasInit = false
  }
  await rm(entry.path, { recursive: true, force: true })
}

/**
 * Delete encodes nobody played for MATINEE_TRANSCODE_CACHE_HOURS, then the
 * least recently played until the rest fit MATINEE_TRANSCODE_CACHE_GB.
 */
export async function sweepTranscodes(): Promise<void> {
  const root = env.transcodeDir
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const now = Date.now()
  const keepMs = env.MATINEE_TRANSCODE_CACHE_HOURS * 3_600_000
  const idle: CacheEntry[] = []
  let total = 0
  for (const entry of entries) {
    if (!entry.isDirectory() || !KEY.test(entry.name)) continue
    const path = join(root, entry.name)
    const job = jobs.get(entry.name)
    const bytes = await directoryBytes(path)
    total += bytes
    if (job && (job.runs.size > 0 || job.viewers.size > 0)) continue
    const info = await stat(path).catch(() => null)
    if (!info) continue
    const usedAt = Math.max(info.mtimeMs, job?.touchedAt ?? 0)
    const cached = { key: entry.name, path, usedAt, bytes }
    if (now - usedAt >= keepMs) {
      await remove(cached)
      total -= bytes
    } else idle.push(cached)
  }
  const limit = env.MATINEE_TRANSCODE_CACHE_GB * 1e9
  if (limit <= 0) return
  idle.sort((a, b) => a.usedAt - b.usedAt)
  for (const entry of idle) {
    if (total <= limit) break
    await remove(entry)
    total -= entry.bytes
  }
}
