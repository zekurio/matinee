import type {
  LibraryGrowthBucket,
  LibraryShare,
  LibraryStats,
  LibraryTotals,
  QualityStat,
  StatsInput,
  StatsRange,
  StatsUnit,
} from "@matinee/contracts"
import { library, mediaItem, title } from "@matinee/db"
import { asc, count, desc, eq, type SQL, sql } from "drizzle-orm"

import { db } from "../db"
import { knownZone, planBuckets, sinceStart, todayIn } from "./range"
import { fileDuration } from "./sql"

// When a file arrived: when it appeared on its disk, or when a scan found
// it if that came first. Not its mtime, which a release or a copy keeps
// from years back. Rows a scan hasn't dated yet count from being found.
const arrived = sql`least(${mediaItem.fileCreatedAt}, ${mediaItem.createdAt})`

function sizeSum() {
  return sql<number>`coalesce(sum(${mediaItem.sizeBytes}), 0)`.mapWith(Number)
}

function durationSum() {
  return sql<number>`coalesce(sum(${fileDuration}), 0)`.mapWith(Number)
}

const video = sql`(${mediaItem.probe} -> 'video')`
// False for files ffprobe hasn't read, couldn't read, or found no video in.
const hasVideo = sql`coalesce(jsonb_typeof(${video}) = 'object', false)`
const width = sql`(${video} ->> 'width')::int`
const height = sql`(${video} ->> 'height')::int`

// Named for what the frame fits, as the player names it: a 1920x800 scope
// picture is 1080p.
const resolution = sql<string>`case
  when not ${hasVideo} then 'unknown'
  when ${width} >= 3456 or ${height} >= 1944 then '4K'
  when ${width} >= 2304 or ${height} >= 1296 then '1440p'
  when ${width} >= 1728 or ${height} >= 972 then '1080p'
  when ${width} >= 1152 or ${height} >= 648 then '720p'
  when ${width} >= 768 or ${height} >= 432 then '480p'
  else 'SD' end`

const videoCodec = sql<string>`case when ${hasVideo} then coalesce(${video} ->> 'codec', 'unknown') else 'unknown' end`

const dynamicRange = sql<string>`case when ${hasVideo} then coalesce(${video} ->> 'hdr', 'sdr') else 'unknown' end`

// The track a player starts with: the one marked default, else the first.
const audioCodec = sql<string>`coalesce((
  select track.value ->> 'codec'
  from jsonb_array_elements(case when jsonb_typeof(${mediaItem.probe} -> 'audio') = 'array' then ${mediaItem.probe} -> 'audio' else '[]'::jsonb end)
    with ordinality as track(value, position)
  order by (track.value ->> 'default')::boolean desc nulls last, track.position
  limit 1
), 'unknown')`

export async function libraryTotals(): Promise<LibraryTotals> {
  const [kinds, [files]] = await Promise.all([
    db.select({ kind: title.kind, n: count() }).from(title).groupBy(title.kind),
    db
      .select({
        files: count(),
        episodes:
          sql<number>`count(*) filter (where ${title.kind} = 'show')`.mapWith(
            Number,
          ),
        sizeBytes: sizeSum(),
        durationSeconds: durationSum(),
      })
      .from(mediaItem)
      .leftJoin(title, eq(title.id, mediaItem.titleId)),
  ])
  return {
    movies: kinds.find((row) => row.kind === "movie")?.n ?? 0,
    shows: kinds.find((row) => row.kind === "show")?.n ?? 0,
    episodes: files?.episodes ?? 0,
    files: files?.files ?? 0,
    sizeBytes: files?.sizeBytes ?? 0,
    durationSeconds: files?.durationSeconds ?? 0,
  }
}

/** Files that arrived per bucket, with the running total. */
async function growthOf(
  range: StatsRange,
  zone: string,
): Promise<{ unit: StatsUnit; buckets: LibraryGrowthBucket[] }> {
  const local = sql`(${arrived} at time zone ${zone})`
  const since = sinceStart(arrived, range, zone)
  const before = since ? sql`not (${since})` : sql`false`
  const [span] = await db
    .select({
      first: sql<string>`to_char(coalesce(min(${local}), now() at time zone ${zone}), 'YYYY-MM-DD')`,
      today: todayIn(zone),
      // The running total starts from the files older than the range.
      files: sql<number>`count(*) filter (where ${before})`.mapWith(Number),
      sizeBytes:
        sql<number>`coalesce(sum(${mediaItem.sizeBytes}) filter (where ${before}), 0)`.mapWith(
          Number,
        ),
    })
    .from(mediaItem)
  const today = span?.today ?? new Date().toISOString().slice(0, 10)
  const { unit, starts } = planBuckets(range, today, span?.first ?? today)

  const rows = await db
    .select({
      start: sql<string>`to_char(date_trunc(${unit}, ${local}), 'YYYY-MM-DD')`,
      files: count(),
      movies:
        sql<number>`count(*) filter (where ${title.kind} = 'movie')`.mapWith(
          Number,
        ),
      episodes:
        sql<number>`count(*) filter (where ${title.kind} = 'show')`.mapWith(
          Number,
        ),
      sizeBytes: sizeSum(),
    })
    .from(mediaItem)
    .leftJoin(title, eq(title.id, mediaItem.titleId))
    .where(since)
    .groupBy(sql`1`)
  const byStart = new Map(rows.map((row) => [row.start, row]))
  let totalFiles = span?.files ?? 0
  let totalSizeBytes = span?.sizeBytes ?? 0
  const buckets = starts.map((start) => {
    const row = byStart.get(start)
    totalFiles += row?.files ?? 0
    totalSizeBytes += row?.sizeBytes ?? 0
    return {
      start,
      movies: row?.movies ?? 0,
      episodes: row?.episodes ?? 0,
      sizeBytes: row?.sizeBytes ?? 0,
      totalFiles,
      totalSizeBytes,
    }
  })
  return { unit, buckets }
}

/** Files and their size per value of `label`, most files first. */
async function qualityBy(label: SQL<string>): Promise<QualityStat[]> {
  const files = count()
  return db
    .select({ name: label, files, sizeBytes: sizeSum() })
    .from(mediaItem)
    .groupBy(sql`1`)
    .orderBy(desc(files))
}

async function librariesOf(): Promise<LibraryShare[]> {
  const rows = await db
    .select({
      id: library.id,
      name: library.name,
      kind: library.kind,
      titles:
        sql<number>`(select count(*) from ${title} where ${title.libraryId} = ${library.id})`.mapWith(
          Number,
        ),
      files: count(mediaItem.id),
      sizeBytes: sizeSum(),
      durationSeconds: durationSum(),
    })
    .from(library)
    .leftJoin(mediaItem, eq(mediaItem.libraryId, library.id))
    .groupBy(library.id)
    .orderBy(asc(library.name))
  return rows
}

/** What the libraries hold, how they grew over the range, and in what quality. */
export async function libraryStats(input: StatsInput): Promise<LibraryStats> {
  const zone = await knownZone(input.timeZone)
  const [totals, growth, resolutions, videoCodecs, dynamic, audio, libraries] =
    await Promise.all([
      libraryTotals(),
      growthOf(input.range, zone),
      qualityBy(resolution),
      qualityBy(videoCodec),
      qualityBy(dynamicRange),
      qualityBy(audioCodec),
      librariesOf(),
    ])
  return {
    range: input.range,
    unit: growth.unit,
    totals,
    growth: growth.buckets,
    resolutions,
    videoCodecs,
    dynamicRange: dynamic,
    audioCodecs: audio,
    libraries,
  }
}
