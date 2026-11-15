import Foundation
import MatineeCore

/*
 * StatsData.kt: what the statistics say, in the app's language. The
 * arithmetic under it, the scale, the bars, the standings, and the grid,
 * is MatineeCore's (Profile/Stats.swift).
 */

/// "45m", "3h 20m", "120h", as the web's formatWatchTime.
nonisolated func formatWatchTime(_ seconds: Double) -> String {
  switch WatchTime(seconds: seconds) {
  case .minutes(let minutes): Str.formatMinutesShort(minutes)
  case .hours(let hours): Str.formatHoursShort(hours)
  case .hoursMinutes(let hours, let minutes): Str.formatHoursMinutesShort(hours, minutes)
  }
}

/// What the range chips say: "30 days", "All time".
nonisolated func rangeName(_ range: String) -> String {
  switch range {
  case StatsRange._7d: Str.statsRange7d
  case StatsRange._30d: Str.statsRange30d
  case StatsRange._90d: Str.statsRange90d
  case StatsRange._365d: Str.statsRange365d
  default: Str.statsRangeAll
  }
}

/// How a sentence ends for the range: "in the last 30 days".
nonisolated func rangePhrase(_ range: String) -> String {
  switch range {
  case StatsRange._7d: Str.statsPeriod7d
  case StatsRange._30d: Str.statsPeriod30d
  case StatsRange._90d: Str.statsPeriod90d
  case StatsRange._365d: Str.statsPeriod365d
  default: Str.statsPeriodAll
  }
}

/// "Nov 9", "Week of Nov 3", "November 2026", for a bucket.
nonisolated func bucketName(_ start: String, unit: String) -> String {
  guard let name = BucketName(start: start, unit: unit) else { return start }
  let date = name.formatDate(locale: .app)
  if case .week = name { return Str.statsBucketWeek(date) }
  return date
}

/// "18:00" or "6:00 PM", an hour as the app's language writes the time.
nonisolated func hourName(_ hour: Int) -> String { formatHour(hour, locale: .app) }

/// A weekday's name, 1 being Monday, as the activity cells count them.
nonisolated func weekdayName(_ weekday: Int, short: Bool) -> String {
  weekdayName(weekday, short: short, locale: .app)
}

/// A board's value as the leaderboard shows it: "4h", "12 plays", "3 days".
nonisolated func metricValue(_ metric: String, _ value: Double) -> String {
  switch MetricValue(metric: metric, value: value) {
  case .watchTime: formatWatchTime(value)
  case .plays(let count): Str.statsPlayCount(count)
  case .days(let count): Str.statsDayCount(count)
  case .movies(let count): Str.statsMovieCount(count)
  case .episodes(let count): Str.statsEpisodeCount(count)
  case .count(let count): formatCount(count)
  }
}

nonisolated func metricName(_ metric: String) -> String {
  switch metric {
  case "plays": Str.statsMetricPlays
  case "currentStreak": Str.statsMetricCurrentStreak
  case "longestStreak": Str.statsMetricLongestStreak
  case "movies": Str.statsMetricMovies
  case "episodes": Str.statsMetricEpisodes
  default: Str.statsMetricWatchTime
  }
}

/// The time zone the server counts days and hours in: this device's, so they match its clock.
nonisolated var statsTimeZone: String { TimeZone.current.identifier }
