import { type ChildProcess, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  appendFile,
  type FileHandle,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"

import { type Download, DownloadPlan, DownloadSpec } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { mediaItem, type MediaItemRow } from "@matinee/db"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { defineQueue } from "../jobs/queue"
import { log } from "../log"
import { trackStream } from "../stats/sessions"
import { fragmentTracks, type InitTrack, initTracks, readMoofs } from "./bmff"
import {
  buildDownload,
  type DownloadBuild,
  DownloadSpecError,
  downloadFileName,
} from "./download-encode"
import {
  type AudioResume,
  planAudioResume,
  type TrackEnd,
} from "./download-resume"
import {
  type DownloadText,
  initWithText,
  makeDownloadText,
  textFragment,
} from "./download-text"
import { keyframesNear } from "./playback"

/*
 * Downloads in the making. A download is a directory under the transcode
 * directory: what it holds, the times of the segments made so far, and
 * the segments themselves while the client still needs them. One ffmpeg
 * run at a time writes the segments in order; the client fetches them in
 * order, and the ones behind it are deleted, so the server never holds
 * the whole download.
 *
 * When the client goes away, the run stops. When it comes back for the
 * next segment, a new run starts there: an encode starts on its segment
 * grid, a copy on the keyframe the segment starts with, which the times
 * say. Runs go through a queue, so only a few encode at once. A run that
 * gets far ahead of the client pauses until it catches up.
 */

const ID = /^[0-9a-f-]{36}$/i
const TICK_MS = 500
// Segments a run may write ahead of the one the client asked for last.
const AHEAD_SEGMENTS = 10
// A run nobody fetched from in this long stops.
const ORPHAN_MS = 30_000
// A download nobody fetched from in this long leaves memory; its
// directory stays for the sweep.
const FORGET_MS = 5 * 60_000
// Longest a request waits for its segment.
const SEGMENT_WAIT_MS = 2 * 60_000
// After a run fails without writing a segment, don't start another this soon.
const FAILURE_BACKOFF_MS = 10_000
// A request this many segments past what an encode wrote starts a run there.
const RESTART_GAP = 4
const TOUCH_MS = 60_000
const STDERR_LINES = 20
const READ_CHUNK = 256 * 1024
// The whole-file stream waits for a segment this long at a time, and
// sends a keepalive between waits so proxies don't close a quiet line.
const STREAM_WAIT_MS = 15_000
// Failed runs in a row after which the whole-file stream gives up.
const STREAM_FAILURES = 3
/**
 * An empty `free` box. MP4 allows one anywhere between top-level boxes,
 * and players skip it, so it keeps a connection busy without changing
 * what plays.
 */
const KEEPALIVE = new Uint8Array([0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65])

const StoredDownload = t.object({
  version: t.literal(1),
  id: t.uuid(),
  userId: t.uuid(),
  itemId: t.uuid(),
  key: t.string(),
  spec: DownloadSpec,
  fileName: t.string(),
  plan: DownloadPlan,
  createdAt: t.coerce.date(),
})
type StoredDownload = t.infer<typeof StoredDownload>

const TrackEndLine = t.object({
  end: t.number().int(),
  total: t.number().int().nonnegative(),
  scale: t.number().int().positive(),
})

/** A line of `segments.log`: a finished segment, or where the video ends. */
const LogLine = t.union([
  t.object({
    segment: t.number().int().nonnegative(),
    start: t.number(),
    duration: t.number(),
    /** Per audio output, where it stood after the segment. */
    audio: t.array(TrackEndLine.nullable()).optional(),
  }),
  // Null when a run that cuts elsewhere may end elsewhere too.
  t.object({ end: t.number().int().min(-1).nullable() }),
])

type Times = {
  start: number
  duration: number
  /** Per audio output, where it stood after the segment; see `TrackEnd`. */
  audio?: (TrackEnd | null)[]
}

type Run = {
  /** The first segment it writes. */
  first: number
  /** Where in the file it starts. */
  startSeconds: number
  /** The last segment it finished, `first - 1` before the first. */
  head: number
  /** Null while it waits for its turn in the queue. */
  child: ChildProcess | null
  exited: boolean
  /** The server stopped it. */
  stopping: boolean
  paused: boolean
  playlistSize: number
  stderr: string[]
  /** A read of its playlist in progress; reads take turns. */
  reading: Promise<void> | null
}

type Active = {
  record: StoredDownload
  dir: string
  /** The file's path in its library, naming the download's runs. */
  label: string
  /** Worked out again on first use after a restart. */
  build: DownloadBuild | null
  /** The file or the settings changed since the download started. */
  changed: boolean
  times: Map<number, Times>
  /** Segments on disk and complete. */
  done: Set<number>
  hasInit: boolean
  /** The init segment's tracks, once read. */
  tracks: InitTrack[] | null
  /** The text subtitles that go in the file, once asked for. */
  text: Promise<DownloadText> | null
  /** The init segment with them, and the id of their first track. */
  textInit: Promise<{ path: string; firstId: number }> | null
  /** The last segment, once a run reached the end; -1 for none. */
  end: number | null
  run: Run | null
  /** Requests and response bodies in flight. */
  users: number
  /** The segment the client asked for last. */
  wanted: number
  seenAt: number
  failedAt: number
  waiters: Set<() => void>
  timer: NodeJS.Timeout | null
  ticking: boolean
  touchedAt: number
}

const downloads = new Map<string, Active>()
const opening = new Map<string, Promise<Active | null>>()

function root(): string {
  return join(env.transcodeDir, "downloads")
}

type RunJob = {
  downloadId: string
  label: string
  launch: (signal: AbortSignal) => Promise<void>
}

/**
 * The ffmpeg runs of downloads. A run holds its slot until it ends: at
 * the end of the file, or once its client went away.
 */
export const downloadRuns = defineQueue<RunJob, void>({
  id: "downloads",
  name: "Downloads",
  description:
    "Make the versions of files that apps download to watch offline, while they fetch them.",
  concurrency: 2,
  tuning: {
    max: 8,
    note: "Downloads converted at once. Each one uses an encoder as a stream would; raise it if the server keeps up.",
  },
  key: (job) => job.downloadId,
  label: (job) => job.label,
  failure: (job) => `Couldn't make a download of ${job.label}`,
  // A new run waits for the one it replaces to exit.
  joinsRunning: () => false,
  run: (job, { signal }) => job.launch(signal),
})

function live(run: Run | null): run is Run {
  return run !== null && !run.exited && !run.stopping
}

function notify(active: Active): void {
  const waiters = [...active.waiters]
  active.waiters.clear()
  for (const wake of waiters) wake()
}

/** Resolves on the download's next change, or after `ms`. */
function changed(active: Active, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(wake, ms)
    function wake() {
      clearTimeout(timer)
      active.waiters.delete(wake)
      resolve()
    }
    active.waiters.add(wake)
  })
}

function segmentFile(active: Active, segment: number): string {
  return join(active.dir, `${segment}.m4s`)
}

function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}

async function writeRecord(
  path: string,
  record: StoredDownload,
): Promise<void> {
  const temporary = `${path}.tmp`
  await writeFile(temporary, JSON.stringify(record))
  await rename(temporary, path)
}

function logLine(active: Active, line: t.infer<typeof LogLine>): void {
  void appendFile(
    join(active.dir, "segments.log"),
    `${JSON.stringify(line)}\n`,
  ).catch((cause: unknown) =>
    log.warn("Couldn't note a download's progress", cause),
  )
}

function newActive(record: StoredDownload, dir: string, label: string): Active {
  return {
    record,
    dir,
    label,
    build: null,
    changed: false,
    times: new Map(),
    done: new Set(),
    hasInit: false,
    tracks: null,
    text: null,
    textInit: null,
    end: null,
    run: null,
    users: 0,
    wanted: 0,
    seenAt: Date.now(),
    failedAt: 0,
    waiters: new Set(),
    timer: null,
    ticking: false,
    touchedAt: Date.now(),
  }
}

/** A download from its directory, as the last process left it. */
async function load(id: string): Promise<Active | null> {
  const dir = join(root(), id)
  const text = await readFile(join(dir, "download.json"), "utf8").catch(
    () => null,
  )
  if (text === null) return null
  let json
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const parsed = StoredDownload.safeParse(json)
  if (!parsed.success) return null
  // The file's path once `prepare` reads it.
  const active = newActive(parsed.data, dir, parsed.data.fileName)

  const lines = await readFile(join(dir, "segments.log"), "utf8").catch(
    () => "",
  )
  for (const raw of lines.split("\n")) {
    if (!raw.trim()) continue
    let value
    try {
      value = JSON.parse(raw)
    } catch {
      continue
    }
    const line = LogLine.safeParse(value)
    if (!line.success) continue
    if ("end" in line.data) active.end = line.data.end
    else {
      active.times.set(line.data.segment, {
        start: line.data.start,
        duration: line.data.duration,
        audio: line.data.audio,
      })
    }
  }

  const names = await readdir(dir).catch(() => [])
  await Promise.all(
    names.map(async (name) => {
      const match = /^(\d+)\.m4s$/.exec(name)
      if (match && active.times.has(Number(match[1]))) {
        active.done.add(Number(match[1]))
      } else if (name === "init.mp4") {
        active.hasInit = true
      } else if (
        match ||
        name.endsWith(".tmp") ||
        /^(?:run-\d+\.m3u8|init-\d+\.mp4|probe-.*\.nut|init-text\.mp4|text-\d+\.vtt)$/.test(
          name,
        )
      ) {
        // From a run the last process didn't see finish.
        await unlink(join(dir, name)).catch(() => {})
      }
    }),
  )
  return active
}

/** The download with `id`, from memory or from disk. Null when it's gone. */
function openDownload(id: string): Promise<Active | null> {
  const key = id.toLowerCase()
  const known = downloads.get(key)
  if (known) return Promise.resolve(known)
  const pending = opening.get(key)
  if (pending) return pending
  const promise = load(key)
    .then((active) => {
      if (active) downloads.set(key, active)
      return active
    })
    .finally(() => opening.delete(key))
  opening.set(key, promise)
  return promise
}

/** The command for the download, worked out on first use after a restart. */
function prepare(active: Active): Promise<DownloadBuild | null> {
  if (active.changed) return Promise.resolve(null)
  if (active.build) return Promise.resolve(active.build)
  return check(active)
}

/**
 * The command for the download from the file and settings as they are
 * now. Marks the download changed when they no longer give its key.
 */
async function check(active: Active): Promise<DownloadBuild | null> {
  if (active.changed) return null
  const item = await itemOf(active)
  if (item) active.label = item.relativePath
  let build: DownloadBuild | null = null
  if (item) {
    try {
      build = await buildDownload(item, active.record.spec)
    } catch (cause) {
      if (!(cause instanceof DownloadSpecError)) throw cause
    }
  }
  if (!build || build.key !== active.record.key) {
    active.changed = true
    stopRun(active)
    return null
  }
  active.build = build
  return build
}

async function itemOf(active: Active): Promise<MediaItemRow | null> {
  const [item] = await db
    .select()
    .from(mediaItem)
    .where(eq(mediaItem.id, active.record.itemId))
  return item ?? null
}

function ensureTimer(active: Active): void {
  if (active.timer) return
  active.timer = setInterval(() => void tick(active), TICK_MS)
  active.timer.unref()
}

async function tick(active: Active): Promise<void> {
  if (active.ticking) return
  active.ticking = true
  try {
    const run = active.run
    if (live(run)) await updateHead(active, run)
    enforce(active)
  } catch (cause) {
    log.warn("Couldn't check a download", cause)
  } finally {
    active.ticking = false
  }
}

function enforce(active: Active): void {
  const now = Date.now()
  const run = active.run
  const idle = active.users === 0 ? now - active.seenAt : 0
  if (run && !run.stopping && idle > ORPHAN_MS) stopRun(active)
  else if (live(run) && active.build?.pauseKeys) {
    if (run.head - active.wanted > AHEAD_SEGMENTS) pause(run)
    else resume(run)
  }
  if (active.users > 0 && now - active.touchedAt > TOUCH_MS) {
    active.touchedAt = now
    // The sweep reads the directory's time to find downloads nobody fetches.
    void utimes(active.dir, new Date(now), new Date(now)).catch(() => {})
  }
  if (!active.run && idle > FORGET_MS) {
    if (active.timer) clearInterval(active.timer)
    active.timer = null
    downloads.delete(active.record.id)
  }
}

function pause(run: Run): void {
  if (run.paused || !run.child) return
  run.paused = true
  run.child.stdin?.write("p")
}

function resume(run: Run): void {
  if (!run.paused || !run.child) return
  run.paused = false
  run.child.stdin?.write("u")
}

/** Stop the download's run, or drop it from the queue if it waits there. */
function stopRun(active: Active): void {
  const run = active.run
  if (!run || run.stopping) return
  run.stopping = true
  if (run.child) run.child.kill("SIGKILL")
  else downloadRuns.cancel(active.record.id)
  active.run = null
  notify(active)
}

type Listed = { segment: number; duration: number }

type RunPlaylist = {
  listed: Listed[]
  /** ffmpeg wrote the end mark: the run reached the end of the file. */
  ended: boolean
}

/** The segments a run's playlist lists, and whether it reached the end. */
function readPlaylist(text: string): RunPlaylist {
  const listed: Listed[] = []
  let duration: number | null = null
  for (const line of text.split("\n")) {
    const extinf = /^#EXTINF:([\d.]+)/.exec(line)
    if (extinf) {
      duration = Number(extinf[1])
      continue
    }
    const name = /^(\d+)\.m4s$/.exec(line.trim())
    if (name && duration !== null) {
      listed.push({ segment: Number(name[1]), duration })
      duration = null
    }
  }
  return { listed, ended: text.includes("#EXT-X-ENDLIST") }
}

/**
 * Note the segments a run finished, from the playlist ffmpeg rewrites.
 * Reads take turns, so each segment is noted once.
 */
function updateHead(active: Active, run: Run): Promise<void> {
  run.reading ??= readHead(active, run).finally(() => {
    run.reading = null
  })
  return run.reading
}

async function readHead(active: Active, run: Run): Promise<void> {
  const playlist = join(active.dir, `run-${run.first}.m3u8`)
  const info = await stat(playlist).catch(() => null)
  if (!info || info.size === run.playlistSize) return
  run.playlistSize = info.size
  const text = await readFile(playlist, "utf8").catch(() => "")
  const { listed, ended } = readPlaylist(text)
  const fresh = listed.filter(({ segment }) => segment > run.head)
  if (fresh.length > 0) await promoteInit(active, run)
  const build = active.build
  for (const { segment, duration } of fresh) {
    const before = active.times.get(segment - 1)
    const start =
      build && !build.copyVideo
        ? segment * build.segmentSeconds
        : segment === run.first
          ? run.startSeconds
          : before
            ? before.start + before.duration
            : run.startSeconds
    // Before it counts as done, so a run that resumes after it finds it.
    const audio = await audioEnds(active, segment, before?.audio)
    active.times.set(segment, { start, duration, audio })
    logLine(active, { segment, start, duration, audio })
    active.done.add(segment)
    run.head = segment
  }
  if (ended && active.end === null) {
    active.end = run.head
    logLine(active, { end: run.head })
  }
  if (fresh.length > 0 || ended) notify(active)
}

/** The init segment's audio tracks, in output order. */
async function audioTracksOf(active: Active): Promise<InitTrack[]> {
  if (!active.tracks) {
    const init = await readFile(join(active.dir, "init.mp4")).catch(() => null)
    if (!init) return []
    active.tracks = initTracks(init)
  }
  return active.tracks.filter((track) => track.handler === "soun")
}

/**
 * Where each audio output stood after `segment`, from its `moof` boxes:
 * the end of its samples and how many packets it has had so far. Null for
 * a track whose count before the segment isn't known.
 */
async function audioEnds(
  active: Active,
  segment: number,
  before: (TrackEnd | null)[] | undefined,
): Promise<(TrackEnd | null)[] | undefined> {
  try {
    const tracks = await audioTracksOf(active)
    if (tracks.length === 0) return undefined
    const all = active.tracks ?? []
    const found = fragmentTracks(
      await readMoofs(segmentFile(active, segment)),
      all,
    )
    return tracks.map((track, index) => {
      const previous = before?.[index] ?? null
      const sofar = segment === 0 ? 0 : previous?.total
      if (sofar === undefined) return null
      const fragment = found.get(track.id)
      if (!fragment) return previous
      return {
        end: fragment.end,
        total: sofar + fragment.samples,
        scale: track.timescale,
      }
    })
  } catch (cause) {
    log.warn("Couldn't read a download segment's audio", cause)
    return undefined
  }
}

/**
 * Every run writes its own init segment, and they are all the same. The
 * first complete one becomes the download's.
 */
async function promoteInit(active: Active, run: Run): Promise<void> {
  // Called once the run listed a segment, so its init segment is whole.
  if (active.hasInit) return
  const own = join(active.dir, `init-${run.first}.mp4`)
  const ok = await rename(own, join(active.dir, "init.mp4")).then(
    () => true,
    () => false,
  )
  if (ok) active.hasInit = true
}

async function finishRun(
  active: Active,
  run: Run,
  code: number | null,
): Promise<void> {
  // A read in flight may have started before the playlist's last change.
  await updateHead(active, run)
  await updateHead(active, run)
  if (!run.stopping) {
    if (code === 0) {
      // ffmpeg reached the end of the file, which may come before the
      // probe's duration said.
      if (active.end === null) {
        active.end = run.head
        logLine(active, { end: run.head })
      }
    } else if (run.head < run.first) {
      active.failedAt = Date.now()
    }
  }
  const names = await readdir(active.dir).catch(() => [])
  await Promise.all(
    names.map(async (name) => {
      const match = /^(\d+)\.m4s$/.exec(name)
      // Its own files, and a segment it finished but hadn't listed: its
      // length isn't known, so the next run makes it again.
      const stale =
        name === `init-${run.first}.mp4` ||
        name === `run-${run.first}.m3u8` ||
        name.endsWith(".tmp") ||
        (match !== null &&
          Number(match[1]) > run.head &&
          !active.done.has(Number(match[1])))
      if (stale) await unlink(join(active.dir, name)).catch(() => {})
    }),
  )
}

/**
 * How a run that doesn't start at the beginning takes its audio up where
 * the segment before it ended. Null to start it with the video, when the
 * segment before isn't known well enough.
 */
async function resumeAudio(
  active: Active,
  run: Run,
  build: DownloadBuild,
): Promise<AudioResume | null> {
  const ends = active.times.get(run.first - 1)?.audio
  if (build.audio.length === 0 || !ends) return null
  const item = await itemOf(active)
  if (!item) return null
  const init = join(active.dir, "init.mp4")
  const previous = segmentFile(active, run.first - 1)
  const reference =
    (await exists(init)) && (await exists(previous))
      ? `concat:${init}|${previous}`
      : null
  try {
    return await planAudioResume({
      path: item.path,
      tracks: build.audio,
      ends,
      dir: active.dir,
      reference,
    })
  } catch (cause) {
    log.warn(
      `Couldn't line up the audio of a download of ${item.relativePath} where it resumes`,
      cause,
    )
    return null
  }
}

/** Run ffmpeg for `run` once the queue gives it a slot. */
async function launch(
  active: Active,
  run: Run,
  signal: AbortSignal,
): Promise<void> {
  if (run.stopping) return
  // The file may have been replaced, or the settings changed, while the
  // download was away.
  const current = await check(active)
  if (!current || run.stopping || signal.aborted) return
  discardFrom(active, run.first, current)
  const resume = run.first > 0 ? await resumeAudio(active, run, current) : null
  if (run.stopping || signal.aborted) return
  const child = spawn(
    env.MATINEE_FFMPEG_PATH,
    current.args(run.first, run.startSeconds, active.dir, resume),
    { stdio: [current.pauseKeys ? "pipe" : "ignore", "ignore", "pipe"] },
  )
  run.child = child
  const untrack = trackStream(null)
  const stop = () => {
    run.stopping = true
    child.kill("SIGKILL")
  }
  signal.addEventListener("abort", stop, { once: true })
  child.stdin?.on("error", () => {
    // ffmpeg exited; the close handler deals with it.
  })
  child.stderr?.setEncoding("utf8")
  child.stderr?.on("data", (chunk: string) => {
    run.stderr.push(...chunk.split("\n").filter((line) => line.trim()))
    run.stderr.splice(0, Math.max(0, run.stderr.length - STDERR_LINES))
  })
  ensureTimer(active)
  return new Promise((resolve, reject) => {
    child.once("error", (cause) => {
      run.exited = true
      untrack()
      signal.removeEventListener("abort", stop)
      active.failedAt = Date.now()
      if (active.run === run) active.run = null
      notify(active)
      reject(cause)
    })
    child.once("close", (code) => {
      run.exited = true
      untrack()
      signal.removeEventListener("abort", stop)
      void finishRun(active, run, code)
        .catch((cause: unknown) =>
          log.warn("Couldn't clean up after a download's run", cause),
        )
        .finally(() => {
          if (active.run === run) active.run = null
          notify(active)
          if (code === 0 || run.stopping) resolve()
          else {
            reject(
              new Error(
                `ffmpeg stopped (exit ${code}): ${run.stderr.join("\n")}`,
              ),
            )
          }
        })
    })
  })
}

function startRun(active: Active, first: number, startSeconds: number): void {
  const run: Run = {
    first,
    startSeconds,
    head: first - 1,
    child: null,
    exited: false,
    stopping: false,
    paused: false,
    playlistSize: 0,
    stderr: [],
    reading: null,
  }
  active.run = run
  ensureTimer(active)
  downloadRuns
    .run({
      downloadId: active.record.id,
      label: active.label,
      launch: (signal) => launch(active, run, signal),
    })
    .catch(() => {
      // Logged by the queue, or dropped from it.
    })
    .finally(() => {
      run.exited = true
      if (active.run === run) active.run = null
      notify(active)
    })
}

/** The first segment from `from` on that isn't on disk, or null past the end. */
function firstMissing(active: Active, from: number): number | null {
  let segment = from
  while (active.done.has(segment)) segment++
  if (active.end !== null && segment > active.end) return null
  return segment
}

/**
 * Before a run from `first`: segments an earlier run left after it go,
 * since the new one makes them again. A copy cuts where its own run's
 * keyframes fall, so they might not fit, and its end may move too.
 */
function discardFrom(
  active: Active,
  first: number,
  build: DownloadBuild,
): void {
  // Deleting from a Set while iterating it is safe.
  for (const segment of active.done) {
    if (segment < first) continue
    active.done.delete(segment)
    active.times.delete(segment)
    void unlink(segmentFile(active, segment)).catch(() => {})
  }
  if (build.copyVideo && active.end !== null && active.end >= first) {
    active.end = null
    logLine(active, { end: null })
  }
}

/**
 * Where a copy's segment starts: after the one before it, on the keyframe
 * nearest to where the times put it. Null when the segment before it was
 * never made.
 */
async function copyStart(
  active: Active,
  segment: number,
): Promise<number | null> {
  if (segment === 0) return 0
  const before = active.times.get(segment - 1)
  if (!before) return null
  const guess = before.start + before.duration
  const item = await itemOf(active)
  const keyframes = item ? await keyframesNear(item, guess) : null
  if (!keyframes) return guess
  const { before: earlier, after: later } = keyframes
  return later !== null && later - guess < guess - earlier ? later : earlier
}

type Producing = "ok" | "failed" | "skipped"

/** Make sure a run is on its way to `segment`. */
async function produce(
  active: Active,
  build: DownloadBuild,
  segment: number,
): Promise<Producing> {
  const run = active.run
  if (run && !run.stopping) {
    if (run.first <= segment) {
      // A copy only goes forward from where it is.
      const near = segment <= run.head + 1 + RESTART_GAP
      if (near || build.copyVideo) {
        if (live(run) && segment <= run.head + AHEAD_SEGMENTS) resume(run)
        return "ok"
      }
    }
    stopRun(active)
  }
  if (Date.now() - active.failedAt < FAILURE_BACKOFF_MS) return "failed"
  const first = firstMissing(active, segment)
  if (first === null) return "ok"
  const seconds = build.copyVideo
    ? await copyStart(active, first)
    : first * build.segmentSeconds
  if (seconds === null) return "skipped"
  // Someone else may have started one while the keyframes were looked up.
  // Nothing may wait between this and starting the run.
  if (active.run || active.changed) return "ok"
  startRun(active, first, seconds)
  return "ok"
}

/** Mark the download in use while `work` runs. */
async function using<T>(active: Active, work: () => Promise<T>): Promise<T> {
  active.users++
  active.seenAt = Date.now()
  ensureTimer(active)
  try {
    return await work()
  } finally {
    active.users--
    active.seenAt = Date.now()
  }
}

/** The download's text subtitles, made once they're first wanted. */
function textOf(active: Active, build: DownloadBuild): Promise<DownloadText> {
  active.text ??= itemOf(active).then((item) =>
    item && build.text.length > 0
      ? makeDownloadText(item, build.text, active.dir)
      : { tracks: [] },
  )
  return active.text
}

/**
 * The init segment as the client gets it: with the text tracks when the
 * download has any. Null when the runs haven't written one yet.
 */
function servedInit(
  active: Active,
  build: DownloadBuild,
): Promise<{ path: string; firstId: number }> {
  active.textInit ??= (async () => {
    const path = join(active.dir, "init.mp4")
    if (build.text.length === 0) return { path, firstId: 0 }
    const [init, text] = await Promise.all([
      readFile(path),
      textOf(active, build),
    ])
    const patched = initWithText(init, text)
    if (patched.init === init) return { path, firstId: patched.firstId }
    const served = join(active.dir, "init-text.mp4")
    await writeFile(served, patched.init)
    return { path: served, firstId: patched.firstId }
  })().catch((cause: unknown) => {
    active.textInit = null
    throw cause
  })
  return active.textInit
}

/**
 * Where segment `segment` ends in seconds, for cutting the text samples:
 * on the grid for an encode, as its times say for a copy. Null when they
 * aren't known.
 */
function segmentEnd(
  active: Active,
  build: DownloadBuild,
  segment: number,
): number | null {
  if (!build.copyVideo) return (segment + 1) * build.segmentSeconds
  const times = active.times.get(segment)
  return times ? times.start + times.duration : null
}

/** Where the text samples that go before segment `segment` start. */
function textStart(
  active: Active,
  build: DownloadBuild,
  segment: number,
): number {
  if (segment === 0) return Number.NEGATIVE_INFINITY
  return (
    segmentEnd(active, build, segment - 1) ??
    active.times.get(segment)?.start ??
    0
  )
}

/**
 * The fragment of text samples from `from` up to `to` seconds, to send
 * before segment `segment`. Null when there are none, or no text tracks.
 */
async function textBefore(
  active: Active,
  build: DownloadBuild,
  segment: number,
  from: number,
  to: number,
): Promise<Buffer | null> {
  if (build.text.length === 0 || from >= to) return null
  const [text, init] = await Promise.all([
    textOf(active, build),
    servedInit(active, build),
  ])
  return textFragment(text, init.firstId, from, to, segment + 1)
}

/** The client moved on to `segment`: what's behind the one before goes. */
function moveTo(active: Active, segment: number): void {
  active.wanted = segment
  const old = [...active.done].filter((done) => done < segment - 1)
  for (const done of old) {
    active.done.delete(done)
    void unlink(segmentFile(active, done)).catch(() => {})
  }
}

export type DownloadAccess =
  | { kind: "found"; active: Active }
  | { kind: "gone" }
  | { kind: "changed" }

/** The user's download with `id`, ready to make. */
export async function accessDownload(
  id: string,
  userId: string,
): Promise<DownloadAccess> {
  if (!ID.test(id)) return { kind: "gone" }
  const active = await openDownload(id)
  if (!active || active.record.userId !== userId) return { kind: "gone" }
  const build = await prepare(active)
  return build ? { kind: "found", active } : { kind: "changed" }
}

export type SegmentResult =
  | {
      kind: "segment"
      path: string
      size: number
      times: Times
      last: boolean
      /** The text samples to send before it. */
      before: Buffer | null
    }
  /** Past the last segment. */
  | { kind: "end" }
  /** Not made in time, or the queue is full: try again soon. */
  | { kind: "busy" }
  /** The last run failed; the next try waits a few seconds. */
  | { kind: "failed" }
  /** Copied video only goes forward; ask for the segments in order. */
  | { kind: "skipped" }
  | { kind: "changed" }

/** Segment `segment` once it's made, waiting up to `waitMs`. */
export function downloadSegment(
  active: Active,
  segment: number,
  signal: AbortSignal,
  waitMs = SEGMENT_WAIT_MS,
): Promise<SegmentResult> {
  return using(active, async () => {
    moveTo(active, segment)
    const deadline = Date.now() + waitMs
    while (true) {
      const build = active.build
      if (active.changed || !build) return { kind: "changed" }
      if (active.end !== null && segment > active.end) return { kind: "end" }
      if (active.done.has(segment)) {
        const path = segmentFile(active, segment)
        const info = await stat(path).catch(() => null)
        const times = active.times.get(segment)
        if (info && times) {
          const last = active.end === segment
          const to = last
            ? Number.POSITIVE_INFINITY
            : (segmentEnd(active, build, segment) ?? Number.POSITIVE_INFINITY)
          return {
            kind: "segment",
            path,
            size: info.size,
            times,
            last,
            before: await textBefore(
              active,
              build,
              segment,
              textStart(active, build, segment),
              to,
            ),
          }
        }
        // Deleted behind the server's back.
        active.done.delete(segment)
      }
      if (signal.aborted || Date.now() > deadline) return { kind: "busy" }
      const producing = await produce(active, build, segment)
      if (producing === "skipped") return { kind: "skipped" }
      if (producing === "failed") return { kind: "failed" }
      await changed(active, 250)
      const run = active.run
      if (live(run)) await updateHead(active, run)
    }
  })
}

/**
 * The path of the init segment as the client gets it, once a run wrote
 * it, or null. With text subtitles it waits for them too.
 */
export function downloadInit(
  active: Active,
  signal: AbortSignal,
  waitMs = SEGMENT_WAIT_MS,
): Promise<string | null> {
  return using(active, async () => {
    const deadline = Date.now() + waitMs
    const path = join(active.dir, "init.mp4")
    while (true) {
      const build = active.build
      if (active.changed || !build) return null
      if (active.hasInit) {
        if (await exists(path)) {
          const served = servedInit(active, build).then((init) => init.path)
          const remaining = deadline - Date.now()
          // Subtitles taken out of a large file take as long as reading it.
          const ready = await Promise.race([
            served,
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), Math.max(0, remaining)).unref(),
            ),
          ])
          if (ready !== null || signal.aborted) return ready
          return null
        }
        active.hasInit = false
      }
      if (signal.aborted || Date.now() > deadline) return null
      if (!active.run) {
        if (Date.now() - active.failedAt < FAILURE_BACKOFF_MS) return null
        // Any run writes one; the one the client needs next is the best.
        // With every segment made, the last one is made again for it.
        let segment = firstMissing(active, active.wanted)
        if (segment === null) {
          segment = Math.max(0, active.end ?? active.wanted)
          active.done.delete(segment)
        }
        const producing = await produce(active, build, segment)
        if (producing !== "ok") return null
      }
      await changed(active, 250)
      const run = active.run
      if (live(run)) await updateHead(active, run)
    }
  })
}

/**
 * A file's bytes as a response body. The download counts as in use until
 * the body is sent, so its run doesn't stop under a slow client.
 */
export function fileBody(
  active: Active,
  path: string,
  before: Buffer | null = null,
): ReadableStream<Uint8Array> {
  let pending = before
  let handle: FileHandle | null = null
  let released = false
  const release = () => {
    if (released) return
    released = true
    active.users--
    active.seenAt = Date.now()
    void handle?.close().catch(() => {})
    handle = null
  }
  active.users++
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (pending) {
          controller.enqueue(pending)
          pending = null
          return
        }
        handle ??= await open(path, "r")
        const buffer = Buffer.allocUnsafe(READ_CHUNK)
        const { bytesRead } = await handle.read(buffer, 0, READ_CHUNK, null)
        if (bytesRead === 0) {
          release()
          controller.close()
          return
        }
        controller.enqueue(buffer.subarray(0, bytesRead))
      } catch (cause) {
        release()
        controller.error(cause)
      }
    },
    cancel: release,
  })
}

/**
 * The whole download from segment `from` on as one stream, the init
 * segment first when `from` is 0. It waits as long as the client stays,
 * with keepalives between segments. It errors, rather than ends, when the
 * download can't be made, so a client never takes a cut-off file for a
 * whole one.
 */
export function downloadStream(
  active: Active,
  from: number,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  let next = from
  let wantInit = from === 0
  // The text samples after the last segment go out once, at the end.
  let wantTail = true
  let failures = 0
  let countedFailure = active.failedAt
  let handle: FileHandle | null = null
  let released = false
  const release = () => {
    if (released) return
    released = true
    active.users--
    active.seenAt = Date.now()
    void handle?.close().catch(() => {})
    handle = null
  }
  active.users++

  /** Nothing to send yet: give up on a download that keeps failing. */
  const stalled = async (): Promise<"wait"> => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    if (active.changed) throw new Error("The download changed.")
    const failing = Date.now() - active.failedAt < FAILURE_BACKOFF_MS
    if (failing && active.failedAt !== countedFailure) {
      countedFailure = active.failedAt
      if (++failures >= STREAM_FAILURES) {
        throw new Error("The server couldn't make the download.")
      }
    }
    // Waits out the pause after a failure before the next run.
    if (failing) await changed(active, FAILURE_BACKOFF_MS)
    return "wait"
  }

  /**
   * What to send next: bytes, then a file, either of which may be
   * missing. Null at the end, or "wait" to ask again.
   */
  const nextPart = async (): Promise<
    { before: Buffer | null; path: string | null } | null | "wait"
  > => {
    if (wantInit) {
      const path = await downloadInit(active, signal, STREAM_WAIT_MS)
      if (!path) return stalled()
      wantInit = false
      return { before: null, path }
    }
    const result = await downloadSegment(active, next, signal, STREAM_WAIT_MS)
    switch (result.kind) {
      case "end": {
        const build = active.build
        if (!wantTail || !build || next === 0) return null
        wantTail = false
        const before = await textBefore(
          active,
          build,
          next,
          segmentEnd(active, build, next - 1) ?? Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
        )
        return { before, path: null }
      }
      case "segment":
        next++
        // The last segment's text runs to the end already.
        if (result.last) wantTail = false
        return { before: result.before, path: result.path }
      case "busy":
      case "failed":
        return stalled()
      case "skipped":
      case "changed":
        throw new Error(`Segment ${next} of the download can't be made.`)
    }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          if (!handle) {
            const part = await nextPart()
            if (part === null) {
              release()
              controller.close()
              return
            }
            if (part === "wait") {
              // Only between boxes: before the init segment, players want
              // the file type box first.
              if (!wantInit) {
                controller.enqueue(KEEPALIVE.slice())
                return
              }
              continue
            }
            if (part.path === null) {
              if (part.before) {
                controller.enqueue(part.before)
                return
              }
              continue
            }
            handle = await open(part.path, "r")
            if (part.before) {
              controller.enqueue(part.before)
              return
            }
          }
          const buffer = Buffer.allocUnsafe(READ_CHUNK)
          const { bytesRead } = await handle.read(buffer, 0, READ_CHUNK, null)
          if (bytesRead > 0) {
            controller.enqueue(buffer.subarray(0, bytesRead))
            return
          }
          await handle.close()
          handle = null
        }
      } catch (cause) {
        release()
        controller.error(cause)
      }
    },
    cancel: release,
  })
}

/**
 * A Matroska download as one stream: a single ffmpeg run from the file to
 * the client, once the queue gives it a slot. ffmpeg waits while the
 * client is behind, and stops when it goes. It errors, rather than ends,
 * when the run fails, so a client never takes a cut-off file for a whole
 * one. Nothing of it stays on disk, so it can't resume.
 */
export function matroskaStream(
  active: Active,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  let child: ChildProcess | null = null
  let released = false
  const release = () => {
    if (released) return
    released = true
    active.users--
    active.seenAt = Date.now()
    child?.kill("SIGKILL")
  }
  active.users++
  signal.addEventListener("abort", release, { once: true })

  /** One ffmpeg run, writing into `controller` until it ends. */
  const launch = async (
    controller: ReadableStreamDefaultController<Uint8Array>,
    queueSignal: AbortSignal,
  ): Promise<void> => {
    const build = await check(active)
    const args = build?.matroska ? await build.matroska() : null
    if (!args) throw new Error("The download changed.")
    if (released || queueSignal.aborted) return
    const run = spawn(env.MATINEE_FFMPEG_PATH, args, {
      stdio: ["ignore", "pipe", "pipe"],
    })
    child = run
    const untrack = trackStream(null)
    const stop = () => run.kill("SIGKILL")
    queueSignal.addEventListener("abort", stop, { once: true })
    const stderr: string[] = []
    run.stderr.setEncoding("utf8")
    run.stderr.on("data", (chunk: string) => {
      stderr.push(...chunk.split("\n").filter((line) => line.trim()))
      stderr.splice(0, Math.max(0, stderr.length - STDERR_LINES))
    })
    run.stdout.on("data", (chunk: Buffer) => {
      if (released) return
      controller.enqueue(new Uint8Array(chunk))
      // Until the client reads; `pull` carries on.
      if ((controller.desiredSize ?? 1) <= 0) run.stdout.pause()
    })
    await new Promise<void>((resolve, reject) => {
      run.once("error", reject)
      run.once("close", (code) => {
        untrack()
        queueSignal.removeEventListener("abort", stop)
        if (released) resolve()
        else if (code === 0) {
          release()
          controller.close()
          resolve()
        } else {
          reject(new Error(`ffmpeg stopped (exit ${code}): ${stderr.join("\n")}`))
        }
      })
    })
  }

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        downloadRuns
          .run({
            downloadId: active.record.id,
            label: active.label,
            launch: (queueSignal) => launch(controller, queueSignal),
          })
          .catch((cause: unknown) => {
            if (released) return
            release()
            controller.error(cause)
          })
      },
      pull() {
        child?.stdout?.resume()
      },
      cancel: release,
    },
    // About a megabyte of ffmpeg's 64 KiB reads.
    new CountQueuingStrategy({ highWaterMark: 16 }),
  )
}

/** Set up a download of `item` for `userId`; see `downloads.start`. */
export async function startDownload(
  item: MediaItemRow,
  spec: DownloadSpec,
  userId: string,
): Promise<Download> {
  const build = await buildDownload(item, spec)
  const id = randomUUID()
  const dir = join(root(), id)
  const record: StoredDownload = {
    version: 1,
    id,
    userId,
    itemId: item.id,
    key: build.key,
    spec,
    fileName: downloadFileName(item, spec.container),
    plan: build.plan,
    createdAt: new Date(),
  }
  await mkdir(dir, { recursive: true })
  await writeRecord(join(dir, "download.json"), record)
  const active = newActive(record, dir, item.relativePath)
  active.build = build
  downloads.set(id, active)
  ensureTimer(active)
  // Ready, usually, by the time the client asks for the init segment.
  if (build.text.length > 0) void textOf(active, build)
  return {
    id,
    itemId: item.id,
    fileName: record.fileName,
    plan: record.plan,
    createdAt: record.createdAt,
  }
}

/** Stop the user's download and delete it. False when there's none. */
export async function removeDownload(
  id: string,
  userId: string,
): Promise<boolean> {
  if (!ID.test(id)) return false
  const active = await openDownload(id)
  if (!active || active.record.userId !== userId) return false
  stopRun(active)
  if (active.timer) clearInterval(active.timer)
  active.timer = null
  active.changed = true
  notify(active)
  downloads.delete(active.record.id)
  await rm(active.dir, { recursive: true, force: true })
  return true
}

/** Delete downloads nobody fetched from for MATINEE_TRANSCODE_CACHE_HOURS. */
export async function sweepDownloads(): Promise<void> {
  const entries = await readdir(root(), { withFileTypes: true }).catch(() => [])
  const keepMs = env.MATINEE_TRANSCODE_CACHE_HOURS * 3_600_000
  const now = Date.now()
  for (const entry of entries) {
    if (!entry.isDirectory() || !ID.test(entry.name)) continue
    const active = downloads.get(entry.name)
    if (active && (active.run || active.users > 0)) continue
    const path = join(root(), entry.name)
    const info = await stat(path).catch(() => null)
    if (!info) continue
    const usedAt = Math.max(info.mtimeMs, active?.seenAt ?? 0)
    if (now - usedAt < keepMs) continue
    if (active) {
      if (active.timer) clearInterval(active.timer)
      downloads.delete(entry.name)
    }
    await rm(path, { recursive: true, force: true })
  }
}
