import type {
  ActivityCell,
  StatsBucket,
  StatsRange,
  StatsUnit,
} from "@matinee/contracts"
import { playbackSession } from "@matinee/db"
import { and, eq, type SQL, type SQLWrapper, sql } from "drizzle-orm"

import { db } from "../db"
import { playCount, watchedSum } from "./sql"

const RANGE_DAYS = new Map<StatsRange, number>([
  ["7d", 7],
  ["30d", 30],
  ["90d", 90],
  ["365d", 365],
])

// "All time" switches to longer buckets past these spans, in days, and
// spans at least the shortest.
const MIN_DAYS = 7
const DAILY_UP_TO = 92
const WEEKLY_UP_TO = 731

const zones = new Map<string, boolean>()

/** The zone, if Postgres knows it as well as the browser did. Else UTC. */
export async function knownZone(zone: string): Promise<string> {
  if (zone === "UTC") return zone
  let known = zones.get(zone)
  if (known === undefined) {
    const result = await db.execute(
      sql`select 1 from pg_timezone_names where name = ${zone} limit 1`,
    )
    known = result.rows.length > 0
    zones.set(zone, known)
  }
  return known ? zone : "UTC"
}

/** When the session started, on the clock of `zone`. */
function localStart(zone: string): SQL {
  return sql`(${playbackSession.startedAt} at time zone ${zone})`
}

/** Sessions in the range, and of one user if given. */
export function scopeOf(
  range: StatsRange,
  zone: string,
  userId: string | undefined,
): SQL | undefined {
  return and(
    sinceStart(playbackSession.startedAt, range, zone),
    userId === undefined ? undefined : eq(playbackSession.userId, userId),
  )
}

/**
 * `time` falls in the range: from midnight in the zone, `days - 1` days
 * before today. Undefined for all time.
 */
export function sinceStart(
  time: SQLWrapper,
  range: StatsRange,
  zone: string,
): SQL | undefined {
  const days = RANGE_DAYS.get(range)
  return days
    ? sql`${time} >= (${rangeStartDay(days, zone)} at time zone ${zone})`
    : undefined
}

/** Midnight of the range's first day, on the clock of `zone`. */
function rangeStartDay(days: number, zone: string): SQL {
  return sql`(date_trunc('day', now() at time zone ${zone}) - make_interval(days => ${days - 1}))`
}

/** The range's first day as a date in `zone`; -infinity for all time. */
export function rangeFirstDay(range: StatsRange, zone: string): SQL {
  const days = RANGE_DAYS.get(range)
  return days ? sql`${rangeStartDay(days, zone)}::date` : sql`'-infinity'::date`
}

/** A YYYY-MM-DD day as a UTC date, for calendar math. */
function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`)
}

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(day: string, days: number): string {
  const date = dayDate(day)
  date.setUTCDate(date.getUTCDate() + days)
  return dayString(date)
}

/** The first day of the bucket holding `day`, as Postgres's date_trunc. */
function bucketOf(day: string, unit: StatsUnit): string {
  if (unit === "day") return day
  if (unit === "month") return `${day.slice(0, 7)}-01`
  // ISO weeks start on Monday.
  const weekday = (dayDate(day).getUTCDay() + 6) % 7
  return addDays(day, -weekday)
}

function nextBucket(start: string, unit: StatsUnit): string {
  if (unit === "day") return addDays(start, 1)
  if (unit === "week") return addDays(start, 7)
  const date = dayDate(start)
  date.setUTCMonth(date.getUTCMonth() + 1)
  return dayString(date)
}

function unitFor(range: StatsRange, spanDays: number): StatsUnit {
  if (range === "365d") return "week"
  if (range !== "all") return "day"
  if (spanDays <= DAILY_UP_TO) return "day"
  return spanDays <= WEEKLY_UP_TO ? "week" : "month"
}

/**
 * The bucket length and every bucket's first day, from the range's first
 * day through today. `first` is the earliest day with data, which only
 * all time needs; it shows at least a week, so a short history isn't a few
 * wide bars. Days are YYYY-MM-DD.
 */
export function planBuckets(range: StatsRange, today: string, first: string) {
  const days = RANGE_DAYS.get(range)
  const weekAgo = addDays(today, -(MIN_DAYS - 1))
  const from = days
    ? addDays(today, -(days - 1))
    : first < weekAgo
      ? first
      : weekAgo
  const spanDays =
    (dayDate(today).getTime() - dayDate(from).getTime()) / 86_400_000 + 1
  const unit = unitFor(range, spanDays)
  const starts: string[] = []
  const last = bucketOf(today, unit)
  for (
    let start = bucketOf(from, unit);
    start <= last;
    start = nextBucket(start, unit)
  ) {
    starts.push(start)
  }
  return { unit, starts }
}

/** Today, YYYY-MM-DD on the clock of `zone`. */
export function todayIn(zone: string): SQL<string> {
  return sql<string>`to_char(now() at time zone ${zone}, 'YYYY-MM-DD')`
}

/** Watch time per bucket, from the range's first day through today. */
export async function bucketsOf(
  range: StatsRange,
  zone: string,
  where: SQL | undefined,
): Promise<{ unit: StatsUnit; buckets: StatsBucket[] }> {
  const local = localStart(zone)
  const [span] = await db
    .select({
      first: sql<string>`to_char(coalesce(min(${local}), now() at time zone ${zone}), 'YYYY-MM-DD')`,
      today: todayIn(zone),
    })
    .from(playbackSession)
    .where(where)
  const today = span?.today ?? dayString(new Date())
  const { unit, starts } = planBuckets(range, today, span?.first ?? today)

  const rows = await db
    .select({
      start: sql<string>`to_char(date_trunc(${unit}, ${local}), 'YYYY-MM-DD')`,
      watchSeconds: watchedSum(),
      plays: playCount(),
    })
    .from(playbackSession)
    .where(where)
    .groupBy(sql`1`)
  const byStart = new Map(rows.map((row) => [row.start, row]))
  return {
    unit,
    buckets: starts.map(
      (start) => byStart.get(start) ?? { start, watchSeconds: 0, plays: 0 },
    ),
  }
}

export async function activityOf(
  zone: string,
  where: SQL | undefined,
): Promise<ActivityCell[]> {
  const local = localStart(zone)
  const rows = await db
    .select({
      weekday: sql<number>`extract(isodow from ${local})::int`.mapWith(Number),
      hour: sql<number>`extract(hour from ${local})::int`.mapWith(Number),
      watchSeconds: watchedSum(),
    })
    .from(playbackSession)
    .where(where)
    .groupBy(sql`1, 2`)
  return rows.filter((row) => row.watchSeconds > 0)
}
