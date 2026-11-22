import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';

/// The words a list of titles says about its filters and cards.

/// A score out of 10 with one decimal, in the app's language.
String scoreText(BuildContext context, double score) =>
    NumberFormat.decimalPatternDigits(
      locale: Localizations.localeOf(context).toString(),
      decimalDigits: 1,
    ).format(score);

/// "1h 45m", "2h", or "50m"; null for no runtime.
String? runtimeText(AppLocalizations l, int? minutes) {
  if (minutes == null || minutes <= 0) return null;
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  if (hours == 0) return l.formatMinutes(rest);
  if (rest == 0) return l.formatHours(hours);
  return l.formatHoursMinutes(hours, rest);
}

/// A count of titles, as the chips' counts read.
String countText(BuildContext context, int count) =>
    NumberFormat.decimalPattern(Localizations.localeOf(context).toString())
        .format(count);

/// What a card says under its name: the year, with the score or the
/// runtime before it while the list is ordered by that, as the web's cards.
CardDetail? cardDetail(BuildContext context, TitleSummary title, String sort) {
  final l = AppLocalizations.of(context);
  final year = title.year?.toString();
  final score = title.rating;
  if (sort == TitleSort.score && score != null) {
    return scoreDetail(l, scoreText(context, score), year);
  }
  final runtime = sort == TitleSort.runtime
      ? runtimeText(l, title.runtimeMinutes)
      : null;
  if (runtime != null) {
    return CardDetail(
      year == null
          ? l.webFiltersCardRuntimeOnly(runtime)
          : l.webFiltersCardRuntime(runtime, year),
    );
  }
  return year == null ? null : CardDetail(year);
}

/// "7.8 · 2021" after the star, which the web draws as a character the app's
/// font lacks, so it's the kit's icon here.
CardDetail scoreDetail(AppLocalizations l, String score, String? year) =>
    CardDetail(
      year == null
          ? l.webFiltersCardScoreOnly(score)
          : l.webFiltersCardScore(score, year),
      icon: Lucide.star,
      label: [l.webFiltersCardScoreSpoken(score), ?year].join(', '),
    );

/// How a range is worded: both ends, only the low one, only the high one.
typedef RangeWords = ({
  String Function(String low, String high) between,
  String Function(String low) low,
  String Function(String high) high,
});

RangeWords panelWords(AppLocalizations l) => (
  between: l.webFiltersBetween,
  low: l.webFiltersAtLeast,
  high: l.webFiltersUpTo,
);

RangeWords yearWords(AppLocalizations l) => (
  between: l.webFiltersBetween,
  low: l.webFiltersFrom,
  high: l.webFiltersUpTo,
);

/// "1980 to 1989", "At least 7.5", or [any] with both ends open.
String rangeText(
  double? low,
  double? high,
  String Function(double) format,
  String any,
  RangeWords words,
) {
  if (low != null && high != null) {
    return low == high ? format(low) : words.between(format(low), format(high));
  }
  if (low != null) return words.low(format(low));
  if (high != null) return words.high(format(high));
  return any;
}

String yearText(double value) => value.round().toString();

String watchWord(AppLocalizations l, String state) => switch (state) {
  WatchFilter.unwatched => l.webFiltersWatchUnwatched,
  WatchFilter.inProgress => l.webFiltersWatchInProgress,
  _ => l.webFiltersWatchWatched,
};
