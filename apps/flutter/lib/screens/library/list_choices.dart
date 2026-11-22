import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../l10n/app_localizations.dart';

/// What a list of titles is ordered and filtered by, for Shows, Movies, and a
/// genre's or a studio's page: the sort and its way, the filters the server
/// takes, and for the tabs the library, for Browse the kind. The server does
/// the sorting and filtering; these only say what was picked.

/// A sort and its way, in the order the sort menu offers them, each with
/// its words.
typedef TitleOrder = ({
  String sort,
  String order,
  String Function(AppLocalizations) label,
});

final List<TitleOrder> titleOrders = [
  (sort: TitleSort.name, order: SortOrder.asc, label: _nameAsc),
  (sort: TitleSort.name, order: SortOrder.desc, label: _nameDesc),
  (sort: TitleSort.recent, order: SortOrder.desc, label: _recentNew),
  (sort: TitleSort.recent, order: SortOrder.asc, label: _recentOld),
  (sort: TitleSort.year, order: SortOrder.desc, label: _newest),
  (sort: TitleSort.year, order: SortOrder.asc, label: _oldest),
  (sort: TitleSort.score, order: SortOrder.desc, label: _scoreHigh),
  (sort: TitleSort.score, order: SortOrder.asc, label: _scoreLow),
  (sort: TitleSort.runtime, order: SortOrder.desc, label: _longest),
  (sort: TitleSort.runtime, order: SortOrder.asc, label: _shortest),
];

String _nameAsc(AppLocalizations l) => l.webFiltersSortNameAsc;
String _nameDesc(AppLocalizations l) => l.webFiltersSortNameDesc;
String _recentNew(AppLocalizations l) => l.webFiltersSortRecentNew;
String _recentOld(AppLocalizations l) => l.webFiltersSortRecentOld;
String _newest(AppLocalizations l) => l.webFiltersSortNewest;
String _oldest(AppLocalizations l) => l.webFiltersSortOldest;
String _scoreHigh(AppLocalizations l) => l.webFiltersSortScoreHigh;
String _scoreLow(AppLocalizations l) => l.webFiltersSortScoreLow;
String _longest(AppLocalizations l) => l.webFiltersSortLongest;
String _shortest(AppLocalizations l) => l.webFiltersSortShortest;

/// An age limit, as `AgeLimit`, with equality.
typedef RatingLimit = ({String country, String rating});

/// The filters a list is narrowed by, as the contract's `TitleFilters`.
/// Null or empty leaves a filter off.
@immutable
final class ListFilters {
  const ListFilters({
    this.genres = const [],
    this.studios = const [],
    this.yearFrom,
    this.yearTo,
    this.scoreMin,
    this.scoreMax,
    this.movieRating,
    this.showRating,
    this.language,
    this.runtimeMin,
    this.runtimeMax,
    this.watched,
  });

  static const none = ListFilters();

  final List<String> genres;
  final List<String> studios;
  final int? yearFrom;
  final int? yearTo;
  final double? scoreMin;
  final double? scoreMax;
  final RatingLimit? movieRating;
  final RatingLimit? showRating;

  /// A language titles were made in, as a BCP 47 tag.
  final String? language;
  final int? runtimeMin;
  final int? runtimeMax;

  /// A `WatchFilter`.
  final String? watched;

  /// How many are on, a range counting once, as the Filter button says.
  int get count =>
      genres.length +
      studios.length +
      [
        yearFrom != null || yearTo != null,
        scoreMin != null || scoreMax != null,
        movieRating != null,
        showRating != null,
        language != null,
        runtimeMin != null || runtimeMax != null,
        watched != null,
      ].where((on) => on).length;

  /// A copy with the fields given changed; a getter, so null can be set.
  ListFilters copyWith({
    List<String>? genres,
    List<String>? studios,
    ValueGetter<int?>? yearFrom,
    ValueGetter<int?>? yearTo,
    ValueGetter<double?>? scoreMin,
    ValueGetter<double?>? scoreMax,
    ValueGetter<RatingLimit?>? movieRating,
    ValueGetter<RatingLimit?>? showRating,
    ValueGetter<String?>? language,
    ValueGetter<int?>? runtimeMin,
    ValueGetter<int?>? runtimeMax,
    ValueGetter<String?>? watched,
  }) => ListFilters(
    genres: genres ?? this.genres,
    studios: studios ?? this.studios,
    yearFrom: yearFrom == null ? this.yearFrom : yearFrom(),
    yearTo: yearTo == null ? this.yearTo : yearTo(),
    scoreMin: scoreMin == null ? this.scoreMin : scoreMin(),
    scoreMax: scoreMax == null ? this.scoreMax : scoreMax(),
    movieRating: movieRating == null ? this.movieRating : movieRating(),
    showRating: showRating == null ? this.showRating : showRating(),
    language: language == null ? this.language : language(),
    runtimeMin: runtimeMin == null ? this.runtimeMin : runtimeMin(),
    runtimeMax: runtimeMax == null ? this.runtimeMax : runtimeMax(),
    watched: watched == null ? this.watched : watched(),
  );

  /// What the server takes, with a genre's or a studio's page's own first.
  TitleFilters toApi({String? genre, String? studio}) => TitleFilters(
    genres: [?genre, ...genres.where((name) => name != genre)],
    studios: [?studio, ...studios.where((name) => name != studio)],
    yearFrom: yearFrom,
    yearTo: yearTo,
    scoreMin: scoreMin,
    scoreMax: scoreMax,
    movieRating: _limit(movieRating),
    showRating: _limit(showRating),
    language: language,
    runtimeMin: runtimeMin,
    runtimeMax: runtimeMax,
    watched: watched,
  );

  static AgeLimit? _limit(RatingLimit? limit) => limit == null
      ? null
      : AgeLimit(country: limit.country, rating: limit.rating);

  List<Object?> get _fields => [
    ...genres,
    '|',
    ...studios,
    '|',
    yearFrom,
    yearTo,
    scoreMin,
    scoreMax,
    movieRating,
    showRating,
    language,
    runtimeMin,
    runtimeMax,
    watched,
  ];

  @override
  bool operator ==(Object other) =>
      other is ListFilters && listEquals(other._fields, _fields);

  @override
  int get hashCode => Object.hashAll(_fields);
}

/// Everything picked for one list.
@immutable
final class ListChoices {
  const ListChoices({
    this.sort = TitleSort.name,
    this.order = SortOrder.asc,
    this.filters = ListFilters.none,
    this.libraryId,
    this.kind,
  });

  final String sort;
  final String order;
  final ListFilters filters;

  /// Shows or Movies narrowed to one library; null is every library.
  final String? libraryId;

  /// A genre's or a studio's page narrowed to movies or shows; null is both.
  final String? kind;

  ListChoices copyWith({
    TitleOrder? order,
    ListFilters? filters,
    ValueGetter<String?>? libraryId,
    ValueGetter<String?>? kind,
  }) => ListChoices(
    sort: order?.sort ?? sort,
    order: order?.order ?? this.order,
    filters: filters ?? this.filters,
    libraryId: libraryId == null ? this.libraryId : libraryId(),
    kind: kind == null ? this.kind : kind(),
  );

  /// The order the list asks for: the one picked, unless the server has
  /// nothing to order it by, like a score where no title has one; then A
  /// to Z, as the web falls back.
  TitleOrder effectiveOrder(List<String>? offered) {
    final picked = titleOrders.firstWhere(
      (each) => each.sort == sort && each.order == order,
      orElse: () => titleOrders.first,
    );
    if (offered == null || offered.contains(picked.sort)) return picked;
    return titleOrders.first;
  }

  @override
  bool operator ==(Object other) =>
      other is ListChoices &&
      other.sort == sort &&
      other.order == order &&
      other.filters == filters &&
      other.libraryId == libraryId &&
      other.kind == kind;

  @override
  int get hashCode => Object.hash(sort, order, filters, libraryId, kind);
}

/// Which list the choices are for: a tab's [kind], or a genre's or a
/// studio's page.
typedef ListKey = ({String? kind, String? genre, String? studio});

/// One list's choices. A new sign-in or another server starts them over,
/// since its libraries and genres are another's.
final class ListChoicesNotifier extends Notifier<ListChoices> {
  ListChoicesNotifier(this.list);

  final ListKey list;

  @override
  ListChoices build() {
    ref.watch(apiProvider);
    return const ListChoices();
  }

  void order(TitleOrder order) => state = state.copyWith(order: order);

  void filters(ListFilters filters) => state = state.copyWith(filters: filters);

  void clearFilters() => filters(ListFilters.none);

  void library(String? id) => state = state.copyWith(libraryId: () => id);

  void kind(String? kind) => state = state.copyWith(kind: () => kind);
}

/// Shows' and Movies' choices, kept for the sitting: leaving the tab and
/// coming back finds them as they were.
final tabChoicesProvider =
    NotifierProvider.family<ListChoicesNotifier, ListChoices, ListKey>(
      ListChoicesNotifier.new,
    );

/// A genre's or a studio's page's choices, kept while the page is open.
final browseChoicesProvider = NotifierProvider.autoDispose
    .family<ListChoicesNotifier, ListChoices, ListKey>(ListChoicesNotifier.new);

/// The choices for [list]: a tab's, kept for the sitting, or a genre's or a
/// studio's page's, kept while it's open.
NotifierProvider<ListChoicesNotifier, ListChoices> choicesProvider(
  ListKey list,
) => list.genre == null && list.studio == null
    ? tabChoicesProvider(list)
    : browseChoicesProvider(list);
