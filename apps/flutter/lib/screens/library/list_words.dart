import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../core/display_names.dart';
import '../../l10n/app_localizations.dart';
import 'list_choices.dart';

/// The words a list of titles says about its filters and cards, as the
/// Kotlin app's `TitleFilters.kt` and `FilterSheet.kt` word them.

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
String? cardDetail(BuildContext context, TitleSummary title, String sort) {
  final l = AppLocalizations.of(context);
  final year = title.year?.toString();
  final score = title.rating;
  if (sort == TitleSort.score && score != null) {
    final text = scoreText(context, score);
    return year == null
        ? l.webFiltersCardScoreOnly(text)
        : l.webFiltersCardScore(text, year);
  }
  final runtime = sort == TitleSort.runtime
      ? runtimeText(l, title.runtimeMinutes)
      : null;
  if (runtime != null) {
    return year == null
        ? l.webFiltersCardRuntimeOnly(runtime)
        : l.webFiltersCardRuntime(runtime, year);
  }
  return year;
}

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

RangeWords _scoreChipWords(AppLocalizations l) => (
  between: l.webFiltersChipScoreBetween,
  low: l.webFiltersChipScoreAtLeast,
  high: l.webFiltersChipScoreUpTo,
);

RangeWords _runtimeChipWords(AppLocalizations l) => (
  between: l.webFiltersChipRuntimeBetween,
  low: l.webFiltersChipRuntimeAtLeast,
  high: l.webFiltersChipRuntimeUpTo,
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

/// A filter that's on, as its chip names it, and what takes it off.
typedef ActiveFilter = ({String key, String label, VoidCallback remove});

/// The filters in use as chips, each taking its own off: a range is one
/// chip, and so is each genre and studio. [bothRatings] is whether the list
/// has ratings of both kinds, so a rating chip says which; [languages]
/// names the language.
List<ActiveFilter> activeFilters(
  BuildContext context,
  ListFilters filters, {
  required bool bothRatings,
  required ValueChanged<ListFilters> change,
  DisplayNames languages = DisplayNames.none,
}) {
  final l = AppLocalizations.of(context);
  final active = <ActiveFilter>[];
  if (filters.watched case final state?) {
    active.add((
      key: 'watched',
      label: watchWord(l, state),
      remove: () => change(filters.copyWith(watched: () => null)),
    ));
  }
  for (final name in filters.genres) {
    active.add((
      key: 'genre-$name',
      label: name,
      remove: () =>
          change(filters.copyWith(genres: [...filters.genres]..remove(name))),
    ));
  }
  for (final name in filters.studios) {
    active.add((
      key: 'studio-$name',
      label: name,
      remove: () =>
          change(filters.copyWith(studios: [...filters.studios]..remove(name))),
    ));
  }
  if (filters.yearFrom != null || filters.yearTo != null) {
    active.add((
      key: 'years',
      label: rangeText(
        filters.yearFrom?.toDouble(),
        filters.yearTo?.toDouble(),
        yearText,
        '',
        yearWords(l),
      ),
      remove: () =>
          change(filters.copyWith(yearFrom: () => null, yearTo: () => null)),
    ));
  }
  if (filters.scoreMin != null || filters.scoreMax != null) {
    active.add((
      key: 'score',
      label: rangeText(
        filters.scoreMin,
        filters.scoreMax,
        (value) => scoreText(context, value),
        '',
        _scoreChipWords(l),
      ),
      remove: () =>
          change(filters.copyWith(scoreMin: () => null, scoreMax: () => null)),
    ));
  }
  if (filters.movieRating case final limit?) {
    active.add((
      key: 'movieRating',
      label: bothRatings
          ? l.webFiltersChipMovieRating(limit.rating)
          : l.webFiltersChipRating(limit.rating),
      remove: () => change(filters.copyWith(movieRating: () => null)),
    ));
  }
  if (filters.showRating case final limit?) {
    active.add((
      key: 'showRating',
      label: bothRatings
          ? l.webFiltersChipShowRating(limit.rating)
          : l.webFiltersChipRating(limit.rating),
      remove: () => change(filters.copyWith(showRating: () => null)),
    ));
  }
  if (filters.language case final language?) {
    active.add((
      key: 'language',
      label: languages.nameOf(language),
      remove: () => change(filters.copyWith(language: () => null)),
    ));
  }
  if (filters.runtimeMin != null || filters.runtimeMax != null) {
    active.add((
      key: 'runtime',
      label: rangeText(
        filters.runtimeMin?.toDouble(),
        filters.runtimeMax?.toDouble(),
        (value) => runtimeText(l, value.round()) ?? '0',
        '',
        _runtimeChipWords(l),
      ),
      remove: () => change(
        filters.copyWith(runtimeMin: () => null, runtimeMax: () => null),
      ),
    ));
  }
  return active;
}
