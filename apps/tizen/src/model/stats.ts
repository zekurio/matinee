import type {
  Leaderboard,
  LeaderboardBoard,
  LeaderboardEntry,
  LeaderboardMetric,
  StatsRange,
  StatsUnit,
} from "@matinee/contracts"

import { locale, plural, type StringKey, tr } from "@/i18n"

/* What the statistics say, apart from how they're laid out, as the Android app's StatsData. */

/** The ranges, shortest first, as `STATS_RANGES` lists them. */
export const RANGES: readonly StatsRange[] = ["7d", "30d", "90d", "365d", "all"]

/** "45m", "3h 20m", "120h", as the web's formatWatchTime. */
export function formatWatchTime(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return tr("format_minutes_short", minutes)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours >= 100 || rest === 0
    ? tr("format_hours_short", hours)
    : tr("format_hours_minutes_short", hours, rest)
}

const RANGE_NAMES = {
  "7d": "stats_range_7d",
  "30d": "stats_range_30d",
  "90d": "stats_range_90d",
  "365d": "stats_range_365d",
  all: "stats_range_all",
} satisfies Record<StatsRange, StringKey>

export function rangeName(range: StatsRange): string {
  return tr(RANGE_NAMES[range])
}

const RANGE_PHRASES = {
  "7d": "stats_period_7d",
  "30d": "stats_period_30d",
  "90d": "stats_period_90d",
  "365d": "stats_period_365d",
  all: "stats_period_all",
} satisfies Record<StatsRange, StringKey>

/** How a sentence ends for the range: "in the last 30 days". */
export function rangePhrase(range: StatsRange): string {
  return tr(RANGE_PHRASES[range])
}

/** The TV's time zone, for counting days and hours in; UTC where it won't say. */
export function timeZone(): string {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    return /^[A-Za-z0-9_+\-/]{1,64}$/.test(zone ?? "") ? zone : "UTC"
  } catch {
    return "UTC"
  }
}

/** "Nov 9", "Week of Nov 3", "November 2026", for a bucket. */
export function bucketName(start: string, unit: StatsUnit): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start)
  if (!match) return start
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  )
  if (unit === "month") {
    return date.toLocaleDateString(locale, { month: "long", year: "numeric" })
  }
  const day = date.toLocaleDateString(
    locale,
    date.getFullYear() === new Date().getFullYear()
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" },
  )
  return unit === "week" ? tr("stats_bucket_week", day) : day
}

const TIDY_STEPS = [1, 2, 5, 10, 15, 20, 30, 45, 60]

function tidy(value: number): number {
  const step = TIDY_STEPS.find((candidate) => candidate >= value)
  if (step !== undefined) return step
  let magnitude = 10
  while (magnitude * 10 < value) magnitude *= 10
  return (
    [1, 2, 5, 10]
      .map((factor) => factor * magnitude)
      .find((candidate) => candidate >= value) ?? value
  )
}

/** The top of the scale: whole minutes up to an hour, then hours, rounded up to a tidy number. */
export function scaleTop(seconds: number): number {
  const minutes = Math.ceil(seconds / 60)
  return minutes <= 60
    ? tidy(Math.max(minutes, 1)) * 60
    : tidy(minutes / 60) * 3600
}

/** "18:00" or "6:00 PM", an hour in the TV's way. */
export function hourName(hour: number): string {
  return new Date(2024, 0, 1, hour).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  })
}

/** A weekday's name, 1 being Monday, as the activity cells count them. */
export function weekdayName(weekday: number, short = false): string {
  // The first of January 2024 was a Monday.
  return new Date(2024, 0, weekday).toLocaleDateString(locale, {
    weekday: short ? "short" : "long",
  })
}

/** A board's value as the leaderboard shows it: "4h", "12 plays", "3 days". */
export function metricValue(metric: LeaderboardMetric, value: number): string {
  const count = Math.trunc(value)
  switch (metric) {
    case "watchTime":
      return formatWatchTime(value)
    case "plays":
      return plural("stats_play_count", count)
    case "currentStreak":
    case "longestStreak":
      return plural("stats_day_count", count)
    case "movies":
      return plural("stats_movie_count", count)
    case "episodes":
      return plural("stats_episode_count", count)
  }
}

const METRIC_NAMES = {
  watchTime: "stats_metric_watchTime",
  plays: "stats_metric_plays",
  currentStreak: "stats_metric_currentStreak",
  longestStreak: "stats_metric_longestStreak",
  movies: "stats_metric_movies",
  episodes: "stats_metric_episodes",
} satisfies Record<LeaderboardMetric, StringKey>

export function metricName(metric: LeaderboardMetric): string {
  return tr(METRIC_NAMES[metric])
}

/** Where the user stands on a board: their place between the people just above and below them. */
export type BoardStanding = {
  board: LeaderboardBoard
  places: readonly LeaderboardEntry[]
}

/** The user's standing on each board they're on, in the server's order. */
export function standingsOf(leaderboard: Leaderboard | null): BoardStanding[] {
  const standings: BoardStanding[] = []
  for (const board of leaderboard?.boards ?? []) {
    const at = board.entries.findIndex((entry) => entry.self)
    if (at >= 0) {
      standings.push({
        board,
        places: board.entries.slice(Math.max(0, at - 1), at + 2),
      })
    }
  }
  return standings
}

/** Places shown at the top of a board; the viewer's neighborhood comes after. */
const TOP_PLACES = 10

/** Whether the place at `index` starts the viewer's neighborhood, apart from the top places, so it's set off. */
export function startsNeighborhood(
  board: LeaderboardBoard,
  index: number,
): boolean {
  const place = board.entries[index]
  return (
    index === TOP_PLACES &&
    place !== undefined &&
    place.rank > (board.entries[TOP_PLACES - 1]?.rank ?? 0) + 1
  )
}
