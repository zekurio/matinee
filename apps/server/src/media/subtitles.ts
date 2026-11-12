import { randomUUID } from "node:crypto"
import type { Stats } from "node:fs"
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { basename, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"

import { MediaProbe } from "@matinee/contracts"
import type {
  SubtitleDelivery,
  Subtitles,
  SubtitleStream,
  SubtitleTrack,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  mediaItem,
  type MediaItemRow,
  subtitleFile,
  type SubtitleFileRow,
} from "@matinee/db"
import { and, asc, eq, inArray } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { defineQueue } from "../jobs/queue"
import { log } from "../log"
import { languageTag, trackLabel } from "./language"
import { indexedSubtitle } from "./matroska-subtitles"
import { currentProbe } from "./probe"
import { run, runProcess } from "./process"
import { cleanVtt, decodeText, srtToVtt, vttText } from "./webvtt"

// Display names for ffmpeg's codec names and sidecar extensions.
const FORMAT_NAMES = new Map([
  ["subrip", "SRT"],
  ["srt", "SRT"],
  ["ass", "ASS"],
  ["ssa", "SSA"],
  ["webvtt", "WebVTT"],
  ["vtt", "WebVTT"],
  ["mov_text", "TX3G"],
  ["hdmv_pgs_subtitle", "PGS"],
  ["sup", "PGS"],
  ["dvd_subtitle", "VobSub"],
  ["idx", "VobSub"],
  ["dvb_subtitle", "DVB"],
  ["dvb_teletext", "Teletext"],
])
const UUID = /^[0-9a-f-]{36}$/i
const STREAM_ID = /^stream-(\d{1,4})$/
// Pulling one stream out of a large file reads all of it.
const EXTRACT_TIMEOUT_MS = 10 * 60_000
const START_TIMEOUT_MS = 15_000
// Bump when the conversion changes, so browsers drop what they cached.
const VERSION = 2

const dir = join(env.dataDir, "subtitles")

/** What the cache holds: WebVTT, or PGS copied out of a video. */
type Output = "vtt" | "sup" | "ass"

const OUTPUT_ARGS = {
  vtt: ["-c:s", "webvtt", "-f", "webvtt"],
  ass: ["-c:s", "copy", "-f", "ass"],
  sup: ["-c:s", "copy", "-f", "sup"],
} satisfies Record<Output, string[]>

function formatName(codec: string): string {
  return FORMAT_NAMES.get(codec) ?? codec.toUpperCase()
}

/** Sidecars by extension: PGS goes out as it is, VobSub only burns in. */
function sidecarDelivery(format: string): SubtitleDelivery {
  if (format === "sup") return "pgs"
  if (format === "idx") return "burn-in"
  return "webvtt"
}

function streamDelivery(stream: SubtitleStream): SubtitleDelivery | null {
  if (stream.kind === "text") return "webvtt"
  if (stream.codec === "hdmv_pgs_subtitle") return "pgs"
  if (stream.kind === "bitmap") return "burn-in"
  return null
}

function sidecarTrack(row: SubtitleFileRow): SubtitleTrack {
  return {
    id: row.id,
    label: trackLabel(row.language, row.title, "Unknown language"),
    language: row.language,
    title: row.title,
    forced: row.forced,
    sdh: row.sdh,
    default: row.isDefault,
    source: "sidecar",
    format: formatName(row.format),
    delivery: sidecarDelivery(row.format),
  }
}

function embeddedTrack(
  stream: SubtitleStream,
  position: number,
): SubtitleTrack {
  const language = languageTag(stream.language ?? "")
  const words = stream.title?.toLowerCase() ?? ""
  return {
    id: `stream-${stream.index}`,
    label: trackLabel(language, stream.title, `Track ${position + 1}`),
    language,
    title: stream.title ?? null,
    forced: stream.forced || /\bforced\b/.test(words),
    sdh: stream.hearingImpaired || /\b(sdh|cc|hearing impaired)\b/.test(words),
    default: stream.default,
    source: "embedded",
    format: formatName(stream.codec),
    delivery: streamDelivery(stream),
  }
}

/**
 * A file's subtitle tracks. Streams nothing can show, like teletext, are
 * listed too, so people can tell the file has them.
 */
export async function listSubtitles(item: MediaItemRow): Promise<Subtitles> {
  const [files, info] = await Promise.all([
    db
      .select()
      .from(subtitleFile)
      .where(eq(subtitleFile.mediaItemId, item.id))
      .orderBy(asc(subtitleFile.path)),
    stat(item.path).catch(() => null),
  ])
  const probe = info?.isFile() ? await currentProbe(item, info) : null
  // The default audio plays first, else the first audio stream.
  const audio = probe?.audio.find((stream) => stream.default) ?? probe?.audio[0]
  return {
    tracks: [
      // By language, so a file's English tracks sit together.
      ...files.map(sidecarTrack).sort((a, b) => a.label.localeCompare(b.label)),
      ...(probe?.subtitles ?? []).map(embeddedTrack),
    ],
    audioLanguage: languageTag(audio?.language ?? ""),
  }
}

function etagFor(name: string, info: Stats): string {
  return `"v${VERSION}-${name}-${info.size.toString(16)}-${info.mtime.getTime().toString(16)}"`
}

async function removeStale(
  name: string,
  output: Output,
  keep: string,
): Promise<void> {
  const files = await readdir(dir).catch(() => [])
  for (const file of files) {
    if (
      file.startsWith(`${name}-`) &&
      file.endsWith(`.${output}`) &&
      file !== keep
    ) {
      await rm(join(dir, file), { force: true })
    }
  }
}

type Conversion = {
  key: string
  name: string
  file: string
  input: string[]
  output: Output
  embedded?: { path: string; index: number }
  small?: { path: string; index: number }
  indexedOnly?: boolean
}

async function extract(
  job: Conversion,
  signal?: AbortSignal,
): Promise<boolean> {
  await mkdir(dir, { recursive: true })
  const lock = `${job.file}.lock`
  while (true) {
    if (signal?.aborted) throw signal.reason
    if (await stat(job.file).catch(() => null)) return true
    try {
      await mkdir(lock)
      break
    } catch (cause) {
      const locked = await stat(lock).catch(() => null)
      if (!locked) throw cause
      if (Date.now() - locked.mtimeMs > EXTRACT_TIMEOUT_MS * 2) {
        await rm(lock, { recursive: true, force: true })
      }
      await delay(50, undefined, { signal })
    }
  }
  const tmp = `${job.file}.${randomUUID()}.tmp`
  const indexed = `${tmp}.mkv`
  try {
    if (await stat(job.file).catch(() => null)) return true
    const small = job.small
      ? null
      : job.embedded
        ? await indexedSubtitle(job.embedded.path, job.embedded.index)
        : null
    if (job.indexedOnly && !small && !job.small && job.embedded) return false
    if (small) await writeFile(indexed, small.bytes)
    const convert = (input: string[]) =>
      job.indexedOnly
        ? runProcess({
            name: "ffmpeg",
            command: env.MATINEE_FFMPEG_PATH,
            args: [
              "-hide_banner",
              "-loglevel",
              "error",
              ...input,
              ...OUTPUT_ARGS[job.output],
              "-y",
              tmp,
            ],
            timeoutMs: EXTRACT_TIMEOUT_MS,
            signal,
            priority: 10,
            idleIo: true,
          })
        : run(
            env.MATINEE_FFMPEG_PATH,
            [
              "-hide_banner",
              "-loglevel",
              "error",
              ...input,
              ...OUTPUT_ARGS[job.output],
              "-y",
              tmp,
            ],
            EXTRACT_TIMEOUT_MS,
          )
    if (small || job.small) {
      try {
        await convert([
          "-copyts",
          "-i",
          job.small?.path ?? indexed,
          "-map",
          `0:s:${job.small?.index ?? 0}`,
        ])
      } catch (cause) {
        if (job.indexedOnly) throw cause
        // A decoder may need context the index cannot supply.
        await convert(job.input)
      }
    } else {
      await convert(job.input)
    }
    if (job.output === "vtt") {
      await writeFile(tmp, cleanVtt(await readFile(tmp, "utf8")))
    }
    await rename(tmp, job.file)
  } catch (cause) {
    await rm(tmp, { force: true })
    throw cause
  } finally {
    await rm(indexed, { force: true })
    await rm(lock, { recursive: true, force: true })
  }
  await removeStale(job.name, job.output, basename(job.file))
  return true
}

/**
 * Subtitles turned into WebVTT, and PGS tracks copied out of videos.
 * Matroska subtitle cues avoid a full read where available. Two jobs at
 * a time leave room for playback when a full demux is necessary. One that
 * failed isn't tried again until the source changes, which changes its
 * key.
 */
const conversions = defineQueue<Conversion, void>({
  id: "subtitles",
  name: "Subtitles",
  description:
    "Convert subtitles to WebVTT, and copy PGS subtitles out of videos.",
  concurrency: 2,
  key: (job) => job.key,
  label: (job) => job.name,
  group: (job) =>
    job.name.startsWith("file-")
      ? job.name.slice(5, 41)
      : job.name.slice(0, 36),
  retryAfterMs: Number.POSITIVE_INFINITY,
  failure: (job) => `Couldn't convert subtitles ${job.name}`,
  run: async (job) => {
    await extract(job)
  },
})

/** Outputs a player can request. Picture tracks remain on demand. */
function textConversions(item: MediaItemRow): Conversion[] {
  return (item.probe?.subtitles ?? [])
    .filter((stream) => streamDelivery(stream) === "webvtt")
    .flatMap((stream) => {
      const outputs: Output[] =
        stream.codec === "ass" || stream.codec === "ssa"
          ? ["vtt", "ass"]
          : ["vtt"]
      return outputs.map((output) => {
        const name = `${item.id}-${stream.index}`
        const key = `${name}-${item.modifiedAt.getTime()}-${item.sizeBytes}.${output}`
        return {
          name,
          key,
          file: join(dir, key),
          input: ["-i", item.path, "-map", `0:${stream.index}`],
          output,
          embedded: { path: item.path, index: stream.index },
          indexedOnly: true,
        }
      })
    })
}

type Preparation = MediaItemRow & { sidecars?: Conversion[] }

function preparationKey(item: Preparation): string {
  return `${item.id}-${item.modifiedAt.getTime()}-${item.sizeBytes}${item.sidecars?.map((job) => `-${job.key}`).join("") ?? ""}`
}

const preparations = defineQueue<Preparation, void>({
  id: "subtitle-prepare",
  name: "Prepare subtitles",
  description: "Cache indexed text subtitles without reading video streams.",
  concurrency: 1,
  tuning: {
    max: 4,
    note: "Files whose indexed text subtitles are prepared at once.",
  },
  key: preparationKey,
  group: (item) => item.id,
  label: (item) => item.relativePath,
  retryAfterMs: Number.POSITIVE_INFINITY,
  failure: (item) => `Couldn't prepare subtitles for ${item.relativePath}`,
  run: async (item, { signal }) => {
    const jobs = [...textConversions(item), ...(item.sidecars ?? [])]
    const missing: Conversion[] = []
    for (const job of jobs) {
      if (
        !(await stat(job.file).catch(() => null)) &&
        !(await stat(`${job.file}.skip`).catch(() => null))
      )
        missing.push(job)
    }
    if (!missing.length) return
    if (missing.some((job) => job.embedded)) {
      const info = await stat(item.path)
      if (
        info.size !== item.sizeBytes ||
        info.mtime.getTime() !== item.modifiedAt.getTime()
      )
        return
    }
    const start = performance.now()
    await mkdir(dir, { recursive: true })
    const input = join(dir, `${item.id}.${randomUUID()}.work.mkv`)
    let sourceBytes: number | null = 0
    let streams: number[] = []
    const wanted = [
      ...new Set(
        missing.flatMap((job) => (job.embedded ? [job.embedded.index] : [])),
      ),
    ]
    let written = 0
    const movie = item.container === "mp4" || item.container === "mov"
    try {
      if (wanted.length) {
        const worker = fileURLToPath(
          new URL(
            import.meta.url.endsWith(".ts")
              ? "./subtitle-worker.ts"
              : "./subtitle-worker.mjs",
            import.meta.url,
          ),
        )
        let resultLine = ""
        await runProcess({
          name: "subtitle index reader",
          command: process.execPath,
          args: [
            ...process.execArgv,
            worker,
            movie ? "movie" : "matroska",
            item.path,
            input,
            ...wanted.map(String),
          ],
          signal,
          timeoutMs: EXTRACT_TIMEOUT_MS,
          priority: 10,
          idleIo: true,
          onStdoutLine: (line) => {
            resultLine = line
          },
        })
        const result = t
          .object({ bytesRead: t.number(), streams: t.array(t.number()) })
          .parse(JSON.parse(resultLine))
        sourceBytes = result.bytesRead
        streams = result.streams
      }
      if (movie && streams.length) {
        // Only static sample tables passed the bounded metadata check.
        await runProcess({
          name: "ffmpeg",
          command: env.MATINEE_FFMPEG_PATH,
          args: [
            "-v",
            "error",
            "-copyts",
            "-f",
            "mov",
            "-i",
            item.path,
            ...streams.flatMap((index) => ["-map", `0:${index}`]),
            "-c:s",
            "srt",
            "-f",
            "matroska",
            "-y",
            input,
          ],
          signal,
          timeoutMs: EXTRACT_TIMEOUT_MS,
          priority: 10,
          idleIo: true,
        })
        sourceBytes = null
      }
      for (const job of missing) {
        signal.throwIfAborted()
        if (!job.embedded) {
          await extract(job, signal)
          written += (await stat(job.file)).size
          continue
        }
        const index = streams.indexOf(job.embedded.index)
        if (index < 0) {
          await writeFile(`${job.file}.skip`, "No usable subtitle index\n")
          continue
        }
        await extract({ ...job, small: { path: input, index } }, signal)
        written += (await stat(job.file)).size
      }
      log.info(
        `Prepared subtitles for ${item.relativePath}: ${streams.length} tracks, ${sourceBytes ?? "sample-table"} source bytes, ${written} cache bytes, ${Math.round(performance.now() - start)} ms`,
      )
    } finally {
      await rm(input, { force: true })
    }
  },
})

/** Inventory the cache once, never stat media that needs no work. */
export async function prepareMissingSubtitles(
  options: {
    libraryId?: string
    signal?: AbortSignal
    progress?: (fraction: number) => void
  } = {},
): Promise<void> {
  // ACCESS: Scheduled maintenance covers every library, not a viewer request.
  const rows = (await db.select().from(mediaItem)).map((item) => ({
    ...item,
    probe: MediaProbe.safeParse(item.probe).data ?? null,
  }))
  const present = new Set(await readdir(dir).catch(() => []))
  const expected = new Set(
    rows.flatMap((item) =>
      textConversions(item).flatMap((job) => [job.key, `${job.key}.skip`]),
    ),
  )
  const ids = new Map(rows.map((item) => [item.id, item]))
  // Keep current outputs and active writers. Sidecars and fonts have separate lifetimes.
  for (const name of present) {
    if (
      !/^[0-9a-f-]{36}-\d+-\d+-\d+\.(vtt|ass|sup)(\.skip)?$/i.test(name) ||
      expected.has(name)
    )
      continue
    const id = name.slice(0, 36)
    const item = ids.get(id)
    if (preparations.busy(id) || conversions.busy(id)) continue
    // PGS outputs still belong to current media, even though we don't prepare them.
    if (
      item &&
      name.includes(`-${item.modifiedAt.getTime()}-${item.sizeBytes}.`)
    )
      continue
    await rm(join(dir, name), { force: true })
  }
  const sidecars = await db
    .select()
    .from(subtitleFile)
    .where(inArray(subtitleFile.format, ["ass", "ssa"]))
  const sidecarJobs = new Map<string, Conversion[]>()
  const cachedSidecars = new Set(
    [...present].flatMap((name) => {
      const match = /^file-([0-9a-f-]{36})-\d+-\d+\.(vtt|ass)$/i.exec(name)
      return match ? [`${match[1]}.${match[2]}`] : []
    }),
  )
  for (const row of sidecars) {
    const item = ids.get(row.mediaItemId)
    if (!item || (options.libraryId && item.libraryId !== options.libraryId))
      continue
    // Sidecars have no stored size/mtime. Scheduled catch-up stats only
    // missing outputs; scans check revisions after walking those disks anyway.
    if (
      !options.libraryId &&
      cachedSidecars.has(`${row.id}.vtt`) &&
      cachedSidecars.has(`${row.id}.ass`)
    )
      continue
    const info = await stat(row.path).catch(() => null)
    if (!info?.isFile()) continue
    const jobs = sidecarJobs.get(row.mediaItemId) ?? []
    for (const output of ["vtt", "ass"] satisfies Output[]) {
      const name = `file-${row.id}`
      const key = `${name}-${info.mtime.getTime()}-${info.size}.${output}`
      if (!present.has(key))
        jobs.push({
          name,
          key,
          file: join(dir, key),
          input: ["-i", row.path, "-map", "0:s:0"],
          output,
          indexedOnly: true,
        })
    }
    sidecarJobs.set(row.mediaItemId, jobs)
  }
  const sidecarIds = new Set(sidecars.map((row) => row.id))
  for (const name of present) {
    const match = /^file-([0-9a-f-]{36})-\d+-\d+\.(vtt|ass)$/i.exec(name)
    if (match?.[1] && !sidecarIds.has(match[1]) && !conversions.busy(match[1]))
      await rm(join(dir, name), { force: true })
  }
  for (const name of present) {
    if (!/\.(work\.mkv|tmp|tmp\.mkv|lock)$/.test(name)) continue
    const id = name.startsWith("file-") ? name.slice(5, 41) : name.slice(0, 36)
    if (preparations.busy(id) || conversions.busy(id)) continue
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (info && Date.now() - info.mtimeMs > EXTRACT_TIMEOUT_MS * 2)
      await rm(path, { force: true, recursive: true })
  }
  const pending: Preparation[] = rows
    .filter(
      (item) =>
        (!options.libraryId || item.libraryId === options.libraryId) &&
        (Boolean(sidecarJobs.get(item.id)?.length) ||
          textConversions(item).some(
            (job) => !present.has(job.key) && !present.has(`${job.key}.skip`),
          )),
    )
    .map((item) => ({ ...item, sidecars: sidecarJobs.get(item.id) }))
  let done = 0
  const abort = () => {
    for (const item of pending) preparations.cancel(preparationKey(item))
  }
  options.signal?.addEventListener("abort", abort, { once: true })
  try {
    await Promise.all(
      pending.map(async (item) => {
        if (options.signal?.aborted) return
        await preparations.run(item, { priority: "low" }).catch(() => {
          /* Logged by the queue. */
        })
        options.progress?.(++done / pending.length)
      }),
    )
  } finally {
    options.signal?.removeEventListener("abort", abort)
  }
}

/**
 * The path of ffmpeg's output for a subtitle file or stream, cached under
 * the data dir. The cache file's name holds the source's modification time
 * and size, so a replaced file is converted again. Null when ffmpeg failed
 * on it.
 */
async function converted(
  name: string,
  info: Stats,
  input: string[],
  output: Output,
  embedded?: { path: string; index: number },
): Promise<string | null> {
  const key = `${name}-${info.mtime.getTime()}-${info.size}.${output}`
  const file = join(dir, key)
  const cached = await stat(file).catch(() => null)
  if (cached?.isFile()) return file
  return conversions
    .run({ key, name, file, input, output, embedded }, { priority: "high" })
    .then(
      () => file,
      () => null,
    )
}

/** A track's bytes, as the subtitle route sends them. */
type SubtitleContent =
  | { kind: "webvtt"; text: string }
  | { kind: "ass"; path: string }
  | { kind: "pgs"; path: string }

async function webvtt(file: string | null): Promise<SubtitleContent | null> {
  if (file === null) return null
  const text = await readFile(file, "utf8").catch(() => null)
  // Cleaned again: files cached before a fix to it keep their faults.
  return text === null ? null : { kind: "webvtt", text: cleanVtt(text) }
}

async function sidecarText(
  row: SubtitleFileRow,
  info: Stats,
): Promise<SubtitleContent | null> {
  if (row.format === "srt" || row.format === "vtt") {
    const bytes = await readFile(row.path).catch((cause: unknown) => {
      log.warn(`Couldn't read ${row.path}`, cause)
      return null
    })
    if (!bytes) return null
    const text = decodeText(bytes)
    return {
      kind: "webvtt",
      text: cleanVtt(row.format === "srt" ? srtToVtt(text) : vttText(text)),
    }
  }
  // ASS and SSA lose their styling on the way.
  return webvtt(
    await converted(
      `file-${row.id}`,
      info,
      ["-i", row.path, "-map", "0:s:0"],
      "vtt",
    ),
  )
}

export type SubtitleBody = {
  /** Changes whenever the served bytes would. */
  etag: string
  /** The track's bytes. Null when it can't be read or converted. */
  read: () => Promise<SubtitleContent | null>
}

function sidecarRow(
  item: MediaItemRow,
  trackId: string,
): Promise<SubtitleFileRow | undefined> {
  return db
    .select()
    .from(subtitleFile)
    .where(
      and(eq(subtitleFile.id, trackId), eq(subtitleFile.mediaItemId, item.id)),
    )
    .then(([row]) => row)
}

/** The probed stream of a `stream-<index>` track, if the file has it. */
async function embeddedStream(
  item: MediaItemRow,
  index: number,
): Promise<{ stream: SubtitleStream; info: Stats } | null> {
  const info = await stat(item.path).catch(() => null)
  if (!info?.isFile()) return null
  const probe = await currentProbe(item, info)
  const stream = probe?.subtitles.find((candidate) => candidate.index === index)
  return stream ? { stream, info } : null
}

/**
 * Look up a track for the subtitle route. The id is either a row of
 * `subtitle_file` or `stream-<index>` for a stream inside the file. Null
 * when the item has no such track or only an encode can show it.
 */
export async function openSubtitle(
  item: MediaItemRow,
  trackId: string,
  ass = false,
): Promise<SubtitleBody | null> {
  const match = STREAM_ID.exec(trackId)
  if (match) {
    const index = Number(match[1])
    const found = await embeddedStream(item, index)
    if (!found) return null
    const { stream, info } = found
    const delivery = streamDelivery(stream)
    const name = `${item.id}-${index}`
    const input = ["-i", item.path, "-map", `0:${index}`]
    const embedded = { path: item.path, index }
    if (ass && (stream.codec === "ass" || stream.codec === "ssa")) {
      return {
        etag: etagFor(`${name}-ass`, info),
        read: async () => {
          const path = await converted(name, info, input, "ass", embedded)
          return path ? { kind: "ass", path } : null
        },
      }
    }
    if (delivery === "webvtt") {
      return {
        etag: etagFor(name, info),
        read: async () =>
          webvtt(await converted(name, info, input, "vtt", embedded)),
      }
    }
    if (delivery === "pgs") {
      return {
        etag: etagFor(name, info),
        read: async () => {
          const path = await converted(name, info, input, "sup", embedded)
          return path === null ? null : { kind: "pgs", path }
        },
      }
    }
    return null
  }

  if (!UUID.test(trackId)) return null
  const row = await sidecarRow(item, trackId)
  if (!row) return null
  const delivery = sidecarDelivery(row.format)
  if (delivery === "burn-in") return null
  const info = await stat(row.path).catch(() => null)
  if (!info?.isFile()) return null
  if (ass && (row.format === "ass" || row.format === "ssa")) {
    return {
      etag: etagFor(`${row.id}-ass`, info),
      read: async () => {
        const path = await converted(
          `file-${row.id}`,
          info,
          ["-i", row.path, "-map", "0:s:0"],
          "ass",
        )
        return path ? { kind: "ass", path } : null
      },
    }
  }
  return {
    etag: etagFor(row.id, info),
    read:
      delivery === "pgs"
        ? () => Promise.resolve({ kind: "pgs", path: row.path })
        : () => sidecarText(row, info),
  }
}

/**
 * A picture subtitle to burn into an encode: a stream of the file, or a
 * subtitle file read as an input of its own.
 */
export type BurnInSource =
  | { kind: "stream"; index: number }
  | {
      kind: "file"
      path: string
      size: number
      modified: number
      /** The time of its first picture, which ffmpeg reads as its start. */
      startSeconds: number
    }

const StartTime = t.object({
  format: t
    .object({ start_time: t.coerce.number().optional().catch(undefined) })
    .optional()
    .catch(undefined),
})

/** Where ffmpeg says a subtitle file starts: its first cue or picture. */
async function startSeconds(path: string): Promise<number> {
  const stdout = await run(
    env.MATINEE_FFPROBE_PATH,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "format=start_time",
      path,
    ],
    START_TIMEOUT_MS,
  )
  let json
  try {
    json = JSON.parse(stdout)
  } catch {
    return 0
  }
  const start = StartTime.parse(json).format?.start_time ?? 0
  return Number.isFinite(start) && start > 0 ? start : 0
}

/**
 * A picture track for an encode to burn in. Null when the item has no
 * such track, it's text, or its file can't be read.
 */
export async function burnInSource(
  item: MediaItemRow,
  trackId: string,
): Promise<BurnInSource | null> {
  const match = STREAM_ID.exec(trackId)
  if (match) {
    const index = Number(match[1])
    const found = await embeddedStream(item, index)
    return found?.stream.kind === "bitmap" ? { kind: "stream", index } : null
  }
  if (!UUID.test(trackId)) return null
  const row = await sidecarRow(item, trackId)
  if (!row || sidecarDelivery(row.format) === "webvtt") return null
  const info = await stat(row.path).catch(() => null)
  if (!info?.isFile()) return null
  let start
  try {
    start = await startSeconds(row.path)
  } catch (cause) {
    log.warn(`Couldn't read ${row.path}`, cause)
    return null
  }
  return {
    kind: "file",
    path: row.path,
    size: info.size,
    modified: info.mtimeMs,
    startSeconds: start,
  }
}

/**
 * A subtitle track to put in a Matroska file as it is: a stream of the
 * file, or a subtitle file read as an input of its own.
 */
export type MuxSource =
  | { kind: "stream"; index: number; codec: string }
  | {
      kind: "file"
      path: string
      /** The time of its first cue or picture, which ffmpeg reads as its start. */
      startSeconds: number
      /** For ffmpeg's `-sub_charenc`, when a text file isn't UTF-8. */
      charset: string | null
    }

/** Whether text bytes need a character set other than UTF-8 to read. */
function legacyText(bytes: Uint8Array): boolean {
  const bom =
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  if (bom) return false
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return false
  } catch {
    return true
  }
}

/**
 * A track for a Matroska download. Null when the item has no such track,
 * nothing can show it, or its file can't be read.
 */
export async function muxSource(
  item: MediaItemRow,
  trackId: string,
): Promise<MuxSource | null> {
  const match = STREAM_ID.exec(trackId)
  if (match) {
    const found = await embeddedStream(item, Number(match[1]))
    if (!found || streamDelivery(found.stream) === null) return null
    return {
      kind: "stream",
      index: found.stream.index,
      codec: found.stream.codec,
    }
  }
  if (!UUID.test(trackId)) return null
  const row = await sidecarRow(item, trackId)
  if (!row) return null
  const info = await stat(row.path).catch(() => null)
  if (!info?.isFile()) return null
  const text = sidecarDelivery(row.format) === "webvtt"
  try {
    const bytes = text ? await readFile(row.path) : null
    return {
      kind: "file",
      path: row.path,
      startSeconds: await startSeconds(row.path),
      charset: bytes && legacyText(bytes) ? "WINDOWS-1252" : null,
    }
  } catch (cause) {
    log.warn(`Couldn't read ${row.path}`, cause)
    return null
  }
}
