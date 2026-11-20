import 'dart:math' as math;

import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../l10n/app_localizations.dart';
import '../../query/server_data.dart';

/// What the profile reads and says, apart from its layout, as the Kotlin
/// app's `ProfileData.kt` and `StatsData.kt`.

/// The profile: who, their favorites, and what they watched last.
final profileProvider = serverQueryFamily(
  (api, String username) => api.profiles.get(username),
);

/// Whose statistics, for which range, with days and hours counted in a
/// time zone, or the server's when [timeZone] is null.
typedef StatsQuery = ({String username, String range, String? timeZone});

/// The statistics for one range. Null only for someone who doesn't share
/// them, never for one's own.
final statsProvider = serverQueryFamily(
  (api, StatsQuery query) => api.profiles.stats(
    query.username,
    range: query.range,
    timeZone: query.timeZone,
  ),
);

/// Everyone's standing for a range, for where the person stands.
final leaderboardProvider = serverQueryFamily(
  (api, ({String range, String? timeZone}) query) =>
      api.stats.leaderboard(range: query.range, timeZone: query.timeZone),
);

/// Everything they marked, each kind newest first.
final favoritesProvider = serverQueryFamily(
  (api, String username) => api.profiles.favorites(username, limit: 200),
);

/// The latest file of each title they watched, newest first.
final recentProvider = serverQueryFamily(
  (api, String username) => api.profiles.recent(username, limit: 100),
);

extension FavoritesEmpty on Favorites {
  bool get isEmpty =>
      shows.isEmpty && seasons.isEmpty && episodes.isEmpty && movies.isEmpty;
}

/// "November 2026", the month the person joined, or null when the server's
/// date doesn't read.
String? joinedMonth(String createdAt, String locale) {
  final at = DateTime.tryParse(createdAt);
  return at == null ? null : DateFormat.yMMMM(locale).format(at.toLocal());
}

/// "45m", "3h 20m", "120h", as the web's `formatWatchTime`.
String formatWatchTime(double seconds, AppLocalizations l) {
  final minutes = (seconds / 60).round();
  if (minutes < 60) return l.formatMinutesShort(minutes);
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  return hours >= 100 || rest == 0
      ? l.formatHoursShort(hours)
      : l.formatHoursMinutesShort(hours, rest);
}

/// A range's chip: "30 days".
String rangeName(String range, AppLocalizations l) => switch (range) {
  StatsRange.value7d => l.statsRange7d,
  StatsRange.value30d => l.statsRange30d,
  StatsRange.value90d => l.statsRange90d,
  StatsRange.value365d => l.statsRange365d,
  _ => l.statsRangeAll,
};

/// How a sentence ends for a range: "in the last 30 days".
String rangePhrase(String range, AppLocalizations l) => switch (range) {
  StatsRange.value7d => l.statsPeriod7d,
  StatsRange.value30d => l.statsPeriod30d,
  StatsRange.value90d => l.statsPeriod90d,
  StatsRange.value365d => l.statsPeriod365d,
  _ => l.statsPeriodAll,
};

/// "Nov 9", "Week of Nov 3", "November 2026": a bar of the watch time
/// chart, with the year where it isn't this one.
String bucketName(
  String start,
  String unit,
  AppLocalizations l,
  String locale, {
  DateTime? now,
}) {
  final date = DateTime.tryParse(start);
  if (date == null) return start;
  final thisYear = date.year == (now ?? DateTime.now()).year;
  final day = thisYear ? DateFormat.MMMd(locale) : DateFormat.yMMMd(locale);
  return switch (unit) {
    StatsUnit.month => DateFormat.yMMMM(locale).format(date),
    StatsUnit.week => l.statsBucketWeek(day.format(date)),
    _ => day.format(date),
  };
}

/// The top of the chart's scale: whole minutes up to an hour, then hours,
/// rounded up to a tidy number.
double scaleTop(double seconds) {
  double nice(double value) {
    for (final step in const [1.0, 2, 5, 10, 15, 20, 30, 45, 60]) {
      if (step >= value) return step.toDouble();
    }
    var magnitude = 10.0;
    while (magnitude * 10 < value) {
      magnitude *= 10;
    }
    for (final step in const [1.0, 2, 5, 10]) {
      if (step * magnitude >= value) return step * magnitude;
    }
    return 10 * magnitude;
  }

  final minutes = (seconds / 60).ceilToDouble();
  return minutes <= 60
      ? nice(math.max(minutes, 1)) * 60
      : nice(minutes / 60) * 3600;
}

/// "18:00" or "6 PM", an hour in the language's way.
String hourName(int hour, String locale) =>
    DateFormat.j(locale).format(DateTime(2024, 1, 1, hour));

/// A weekday's name, 1 being Monday, as the activity cells count them.
String weekdayName(int weekday, String locale, {bool short = false}) {
  // 1 January 2024 was a Monday.
  final day = DateTime(2024, 1, weekday);
  return (short ? DateFormat.E(locale) : DateFormat.EEEE(locale)).format(day);
}

/// A leaderboard's name: "Watch time".
String metricName(String metric, AppLocalizations l) => switch (metric) {
  'plays' => l.statsMetricPlays,
  'currentStreak' => l.statsMetricCurrentStreak,
  'longestStreak' => l.statsMetricLongestStreak,
  'movies' => l.statsMetricMovies,
  'episodes' => l.statsMetricEpisodes,
  _ => l.statsMetricWatchTime,
};

/// A board's value as the leaderboard shows it: "4h", "12 plays".
String metricValue(String metric, double value, AppLocalizations l) {
  final count = value.toInt();
  return switch (metric) {
    'watchTime' => formatWatchTime(value, l),
    'plays' => l.statsPlayCount(count),
    'currentStreak' || 'longestStreak' => l.statsDayCount(count),
    'movies' => l.statsMovieCount(count),
    'episodes' => l.statsEpisodeCount(count),
    _ => '$count',
  };
}

/// Where the person stands on a board: their place between the people just
/// above and below them.
typedef BoardStanding = ({
  LeaderboardBoard board,
  List<LeaderboardEntry> places,
});

/// The person's standing on each board they're on, in the server's order.
List<BoardStanding> standings(Leaderboard? leaderboard) => [
  for (final board in leaderboard?.boards ?? const <LeaderboardBoard>[])
    if (board.entries.indexWhere((entry) => entry.self) case final at
        when at >= 0)
      (
        board: board,
        places: board.entries.sublist(
          math.max(0, at - 1),
          math.min(board.entries.length, at + 2),
        ),
      ),
];
