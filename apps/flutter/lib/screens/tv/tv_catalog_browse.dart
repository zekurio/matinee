import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/format.dart';
import '../library/list_words.dart';
import '../requests/catalog_browse.dart';
import '../requests/request_sheet.dart';
import '../requests/request_words.dart';
import '../requests/requests_data.dart';
import '../requests/requests_hub.dart';
import 'tv_browse.dart' show TvGridHeader, tvGridControls;
import 'tv_catalog.dart';
import 'tv_home.dart' show TvPageMessage;
import 'tv_media.dart';
import 'tv_shell.dart' show TvBackdrop;

/// All of the catalog's movies or shows, or the viewer's recommendations
/// of them, on a TV, as the phone's browse: a grid under its name and its
/// controls, Sort and Filters, which step away once focus goes past the
/// first row; it scrolls by whole rows and loads more as the end nears.
/// What each filter offers comes from the server. A Discover row's See all
/// card opens it with the row's filters and sort. Focus starts on the
/// first title, else on Sort.
class TvCatalogBrowseScreen extends ConsumerStatefulWidget {
  const TvCatalogBrowseScreen({
    super.key,
    required this.kind,
    this.filters,
    this.sort,
  });

  final String kind;

  /// `CatalogFilters` JSON, from a Discover row.
  final String? filters;
  final String? sort;

  @override
  ConsumerState<TvCatalogBrowseScreen> createState() =>
      _TvCatalogBrowseScreenState();
}

/// The controls' keys in the page's focus memory.
abstract final class _Controls {
  static const sort = 'sort';
  static const filters = 'filters';
}

/// How many titles either side of the focused one the live stream follows.
const _followed = 48;

class _TvCatalogBrowseScreenState extends ConsumerState<TvCatalogBrowseScreen> {
  final _memory = TvFocusMemory();
  late final _choices = ValueNotifier<BrowseChoices>((
    filters: parseFilters(widget.filters) ?? noFilters,
    sort: widget.sort ?? CatalogSort.popular,
  ));
  FocusedItem? _focused;

  /// The focused title's place, around which the stream follows.
  int _at = 0;

  @override
  void initState() {
    super.initState();
    _choices.addListener(_changed);
  }

  /// Another order or filter: the line named a title that may have moved.
  void _changed() => setState(() {
    _focused = null;
    _at = 0;
  });

  @override
  void dispose() {
    _choices.dispose();
    _memory.dispose();
    super.dispose();
  }

  Future<void> _pickSort(CatalogBrowseOptions options) async {
    final l = AppLocalizations.of(context);
    final choices = _choices.value;
    final picked = await showTvPicker<String>(
      context,
      title: l.librarySort,
      current: choices.sort,
      options: [
        for (final sort in options.sorts)
          if (sortFits(sort, choices.filters))
            TvOption(sort, sortWord(sort, l)),
      ],
    );
    if (picked != null && mounted) {
      _choices.value = (filters: _choices.value.filters, sort: picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final kind = widget.kind;
    final load = ref.watch(browseOptionsProvider(kind));
    final options = load.value;
    if (options == null) {
      if (load.error case final cause? when !load.isLoading) {
        return TvPageMessage(
          title: l.browseFiltersFailed,
          message: describeFailure(l, cause),
          onRetry: () => ref.invalidate(browseOptionsProvider(kind)),
        );
      }
      return const TvLoading(top: 120);
    }
    if (!options.enabled) {
      return TvPageMessage(
        title: l.webDiscoverOff,
        message: l.webDiscoverOffHint,
      );
    }
    final choices = _choices.value;
    final key = BrowseKey(kind, choices.filters, choices.sort);
    final pages = ref.watch(browsePagesProvider(key));
    final notifier = ref.read(browsePagesProvider(key).notifier);
    final recommended = recommends(choices.filters);
    final hidden = recommended
        ? ref.watch(hiddenRecommendationsProvider)
        : const <String>{};
    final shown = [
      for (final item in pages.items)
        if (!hidden.contains(refKey(item.ref))) item,
    ];
    final settled =
        pages.error != null || (!pages.loading && pages.next == null);
    _memory.restore(context, () {
      if (shown.firstOrNull case final first?) {
        return (TvGrid.row, refKey(first.ref));
      }
      // Nothing to show: the controls, so the drawer and the filters stay
      // in reach.
      return settled ? (tvGridControls, _Controls.sort) : null;
    });
    final active = filterCount(choices.filters);
    final onPicture = TvFocus.restOnPicture(MatineeTheme.of(context));
    final from = math.max(0, _at - _followed);
    return TvBackdrop(
      sources: _focused?.backdrop ?? const [],
      child: FollowTitles(
        // The titles around the focused one; library titles play, so only
        // the rest can change.
        titles: FollowedTitles([
          for (final item in shown.skip(from).take(_followed * 2))
            if (item.title == null) CatalogInput(ref: item.ref),
        ]),
        child: TvPosterGrid(
          memory: _memory,
          itemCount: shown.length,
          cellAspect: 2 / 3,
          header: TvGridHeader(
            title: browseName(kind, l),
            detail: pages.stale ? l.webDiscoverStale : null,
            controls: [
              TvButton(
                label: l.browseSortCurrent(sortWord(choices.sort, l)),
                icon: Lucide.arrowUpDown,
                trailingIcon: Lucide.chevronDown,
                rest: onPicture,
                focusNode: _memory.node(tvGridControls, _Controls.sort),
                onPressed: () => unawaited(_pickSort(options)),
              ),
              TvButton(
                label: active > 0
                    ? l.browseFiltersOn(active)
                    : l.webFiltersTitle,
                icon: Lucide.listFilter,
                trailingIcon: Lucide.chevronDown,
                active: active > 0,
                rest: active > 0 ? null : onPicture,
                focusNode: _memory.node(tvGridControls, _Controls.filters),
                onPressed: () => unawaited(
                  showTvBrowseFilters(context, kind, options, _choices),
                ),
              ),
            ],
          ),
          line: TvFocusLine(_focused),
          lineHeight: tvFocusLineHeight,
          onNearEnd: notifier.more,
          scrollKey: '${filtersKey(choices.filters)}-${choices.sort}',
          footer: _footer(l, pages, shown.isEmpty, choices, notifier.more),
          itemBuilder: (context, index) {
            final item = shown[index];
            return TvCatalogPoster.browse(
              item,
              key: ValueKey(refKey(item.ref)),
              width: null,
              named: false,
              focusNode: _memory.node(TvGrid.row, refKey(item.ref)),
              onFocus: (info) => setState(() {
                _focused = info;
                _at = index;
              }),
              onLongPress: recommended
                  ? () => unawaited(
                      showTvNotInterested(
                        context,
                        CatalogTitleSummary(
                          ref: item.ref,
                          name: item.name,
                          year: item.year,
                          poster: item.poster,
                          availability: item.availability,
                        ),
                      ),
                    )
                  : null,
            );
          },
        ),
      ),
    );
  }

  /// Under the grid: why a page didn't come, with Try again, a spinner
  /// while one comes, that it's the whole list, or what an empty one
  /// means, with Clear filters where filters left nothing.
  Widget? _footer(
    AppLocalizations l,
    BrowsePagesState pages,
    bool none,
    BrowseChoices choices,
    VoidCallback more,
  ) {
    final colors = MatineeTheme.of(context);
    if (pages.error case final error?) {
      return TvNotice(
        headline: none ? l.tvGridFailed : l.tvGridMoreFailed,
        message: describeFailure(l, error),
        onRetry: more,
        retryLabel: l.commonRetry,
        top: none ? 28 : 8,
      );
    }
    if (pages.loading || pages.next != null) {
      return TvLoading(size: none ? 32 : 28, top: none ? 76 : 16);
    }
    if (!none) {
      return Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 16),
        child: Text(
          l.webDiscoverEnd,
          style: TvType.caption.style(color: colors.mutedForeground),
        ),
      );
    }
    final filtered = filterCount(choices.filters) > 0;
    void clear() => changeChoices(_choices, noFilters);
    if (recommends(choices.filters)) {
      return TvNotice(
        headline: l.webDiscoverBrowseForYouNone,
        message: l.webDiscoverBrowseForYouHint,
        onRetry: filtered ? clear : null,
        retryLabel: l.browseClearFilters,
      );
    }
    if (filtered) {
      return TvNotice(
        headline: widget.kind == TitleKind.show
            ? l.webDiscoverBrowseNoneShow
            : l.webDiscoverBrowseNoneMovie,
        message: l.webFiltersNoneHint,
        onRetry: clear,
        retryLabel: l.browseClearFilters,
      );
    }
    return TvNotice(headline: l.webDiscoverBrowseNothing);
  }
}

/// The filters in the TV's side panel: the switches for what to list
/// only, the genres in a panel of their own, each end of a range a row
/// that Left and Right step, and the rest as choices. A switch or a choice
/// applies at once; a range once it's left alone a moment, or as the panel
/// closes.
Future<void> showTvBrowseFilters(
  BuildContext context,
  String kind,
  CatalogBrowseOptions options,
  ValueNotifier<BrowseChoices> choices,
) {
  final l = AppLocalizations.of(context);
  return showTvPanel<void>(
    context,
    title: l.webFiltersTitle,
    builder: (panel) => [
      _FilterBody(kind: kind, options: options, choices: choices),
    ],
  );
}

/// How long a range waits after its last step before it applies.
const _settle = Duration(milliseconds: 700);

/// A range's two ends, as the steps leave them before they apply.
typedef _Span = ({double? low, double? high});

class _FilterBody extends ConsumerStatefulWidget {
  const _FilterBody({
    required this.kind,
    required this.options,
    required this.choices,
  });

  final String kind;
  final CatalogBrowseOptions options;
  final ValueNotifier<BrowseChoices> choices;

  @override
  ConsumerState<_FilterBody> createState() => _FilterBodyState();
}

/// The ranges by name.
enum _Range { years, score, runtime }

class _FilterBodyState extends ConsumerState<_FilterBody> {
  /// Ranges stepped but not yet applied.
  final _drafts = <_Range, _Span>{};
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    widget.choices.addListener(_changed);
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.choices.removeListener(_changed);
    _timer?.cancel();
    // As the panel closes, once the tree it leaves is done.
    final filters = _stepped();
    if (filters != null) {
      final choices = widget.choices;
      scheduleMicrotask(() => changeChoices(choices, filters));
    }
    super.dispose();
  }

  CatalogFilters get _filters => widget.choices.value.filters;

  void _change(CatalogFilters filters) =>
      changeChoices(widget.choices, filters);

  /// Applies the ranges stepped since the last time.
  void _commit() {
    if (_stepped() case final filters?) _change(filters);
  }

  /// The filters with the ranges stepped since the last time, which it
  /// forgets; null when none were.
  CatalogFilters? _stepped() {
    if (_drafts.isEmpty) return null;
    var filters = _filters;
    for (final MapEntry(key: range, value: span) in _drafts.entries) {
      filters = switch (range) {
        _Range.years => withFilters(
          filters,
          yearFrom: () => span.low?.round(),
          yearTo: () => span.high?.round(),
        ),
        _Range.score => withFilters(
          filters,
          scoreMin: () => span.low,
          scoreMax: () => span.high,
        ),
        _Range.runtime => withFilters(
          filters,
          runtimeMin: () => span.low?.round(),
          runtimeMax: () => span.high?.round(),
        ),
      };
    }
    _drafts.clear();
    return filters;
  }

  _Span _span(_Range range) =>
      _drafts[range] ??
      switch (range) {
        _Range.years => (
          low: _filters.yearFrom?.toDouble(),
          high: _filters.yearTo?.toDouble(),
        ),
        _Range.score => (low: _filters.scoreMin, high: _filters.scoreMax),
        _Range.runtime => (
          low: _filters.runtimeMin?.toDouble(),
          high: _filters.runtimeMax?.toDouble(),
        ),
      };

  CatalogRange _bounds(_Range range) => switch (range) {
    _Range.years => widget.options.years,
    _Range.score => widget.options.scores,
    _Range.runtime => widget.options.runtime,
  };

  /// One step of a range's [low] or high end: from Any, a step in starts
  /// at the range's end; past its end, it's Any again. The two ends never
  /// cross.
  void _step(_Range range, {required bool low, required int by}) {
    final bounds = _bounds(range);
    final span = _span(range);
    double? next(double? value, double? other) {
      if (value == null) {
        // Any: a step inwards starts from the range's own end.
        if (low && by > 0) return bounds.min;
        if (!low && by < 0) return bounds.max;
        return null;
      }
      final moved = value + by * bounds.step;
      if (moved < bounds.min || moved > bounds.max) return null;
      if (other != null && (low ? moved > other : moved < other)) return value;
      return moved;
    }

    setState(() {
      _drafts[range] = low
          ? (low: next(span.low, span.high), high: span.high)
          : (low: span.low, high: next(span.high, span.low));
    });
    _timer?.cancel();
    _timer = Timer(_settle, () {
      if (mounted) setState(_commit);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final filters = _filters;
    final options = widget.options;
    final ratings = options.ratings;
    final languages = options.languages;
    final genres = [
      for (final genre in options.genres)
        if (filters.genres?.contains(genre.id) ?? false) genre.name,
    ];
    final language = languages
        .where((each) => each.id == filters.language)
        .firstOrNull;
    Widget toggle(String label, bool on, CatalogFilters Function(bool) set) =>
        TvListItem(
          title: label,
          quiet: true,
          trailing: TvListSwitch(checked: on),
          onPressed: () => _change(set(!on)),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 4,
      children: [
        TvListHeading(l.webDiscoverBrowseOnly),
        toggle(
          l.webDiscoverBrowseRecommended,
          filters.recommended == true,
          (on) => withFilters(filters, recommended: () => on ? true : null),
        ),
        toggle(
          l.webDiscoverBrowseUpcoming,
          filters.upcoming == true,
          (on) => withFilters(filters, upcoming: () => on ? true : null),
        ),
        toggle(
          l.webDiscoverBrowseRequestable,
          filters.requestable == true,
          (on) => withFilters(filters, requestable: () => on ? true : null),
        ),
        if (options.genres.isNotEmpty) ...[
          TvListHeading(l.webFiltersGenres),
          TvListItem(
            title: genres.isEmpty ? l.libraryAnyGenre : genres.join(', '),
            icon: Lucide.listFilter,
            quiet: true,
            trailing: const TvListValue(''),
            onPressed: () => unawaited(_pickGenres()),
          ),
        ],
        ..._range(
          l,
          _Range.years,
          l.webFiltersYears,
          yearText,
          l.webFiltersAnyYear,
          yearWords(l),
        ),
        ..._range(
          l,
          _Range.score,
          l.webFiltersScore,
          (value) => formatRating(value, l),
          l.webFiltersAnyScore,
          panelWords(l),
        ),
        if (options.votes.isNotEmpty) ...[
          TvListHeading(l.webDiscoverBrowseVotes),
          _choice<int?>(
            title: l.webDiscoverBrowseVotes,
            current: filters.votesMin,
            options: [
              TvOption(null, l.webFiltersAny),
              for (final votes in options.votes)
                TvOption(
                  votes,
                  l.webDiscoverBrowseVotesStep(formatCount(votes, l)),
                ),
            ],
            onPick: (votes) =>
                _change(withFilters(filters, votesMin: () => votes)),
          ),
        ],
        if (ratings != null && ratings.ratings.isNotEmpty) ...[
          TvListHeading(l.webFiltersRating),
          _choice<String?>(
            title: l.webFiltersRating,
            description: l.webFiltersRatingHint(ratings.country),
            current: filters.rating,
            options: [
              TvOption(null, l.webFiltersAny),
              for (final rating in ratings.ratings) TvOption(rating, rating),
            ],
            onPick: (rating) =>
                _change(withFilters(filters, rating: () => rating)),
          ),
        ],
        if (languages.isNotEmpty) ...[
          TvListHeading(l.webFiltersLanguage),
          _choice<String?>(
            title: l.webFiltersLanguage,
            current: language?.id,
            options: [
              TvOption(null, l.webFiltersAnyLanguage),
              for (final each in languages) TvOption(each.id, each.name),
            ],
            onPick: (picked) =>
                _change(withFilters(filters, language: () => picked)),
          ),
        ],
        ..._range(
          l,
          _Range.runtime,
          l.webFiltersRuntime,
          (value) => runtimeText(l, value.round()) ?? '0',
          l.webFiltersAnyLength,
          panelWords(l),
        ),
        if (filterCount(filters) > 0) ...[
          const SizedBox(height: 12),
          TvListItem(
            title: l.browseClearFilters,
            icon: Lucide.x,
            quiet: true,
            onPressed: () {
              _timer?.cancel();
              _drafts.clear();
              _change(noFilters);
            },
          ),
        ],
      ],
    );
  }

  /// A range under its heading, which says what it's set to, and its two
  /// ends, each a row Left and Right step.
  List<Widget> _range(
    AppLocalizations l,
    _Range range,
    String title,
    String Function(double value) format,
    String any,
    RangeWords words,
  ) {
    final span = _span(range);
    return [
      TvListHeading(
        '$title · ${rangeText(span.low, span.high, format, any, words)}',
      ),
      TvStepRow(
        label: l.webFiltersLowest,
        value: span.low == null ? l.webFiltersAny : format(span.low!),
        onStep: (by) => _step(range, low: true, by: by),
      ),
      TvStepRow(
        label: l.webFiltersHighest,
        value: span.high == null ? l.webFiltersAny : format(span.high!),
        onStep: (by) => _step(range, low: false, by: by),
      ),
    ];
  }

  /// A choice of one, its value at the row's end, picked in a panel.
  Widget _choice<T>({
    required String title,
    required T current,
    required List<TvOption<T>> options,
    required ValueChanged<T> onPick,
    String? description,
  }) {
    final shown = options
        .where((option) => option.value == current)
        .firstOrNull;
    return TvListItem(
      title: shown?.label ?? options.first.label,
      quiet: true,
      trailing: const TvListValue(''),
      onPressed: () async {
        final picked = await showTvPanel<TvOption<T>>(
          context,
          title: title,
          description: description,
          builder: (panel) => [
            for (final option in options)
              TvListItem(
                title: option.label,
                quiet: true,
                checked: option.value == current,
                autofocus: option.value == current,
                onPressed: () => Navigator.of(panel).pop(option),
              ),
          ],
        );
        if (picked != null && picked.value != current && mounted) {
          onPick(picked.value);
        }
      },
    );
  }

  /// The genres, each with a box, in a panel of their own; each change
  /// applies at once.
  Future<void> _pickGenres() {
    final l = AppLocalizations.of(context);
    final choices = widget.choices;
    final genres = widget.options.genres;
    return showTvPanel<void>(
      context,
      title: l.webFiltersGenres,
      builder: (panel) => [
        ValueListenableBuilder(
          valueListenable: choices,
          builder: (context, value, _) {
            final picked = value.filters.genres ?? const <int>[];
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 4,
              children: [
                for (final genre in genres)
                  TvListItem(
                    title: genre.name,
                    quiet: true,
                    leading: TvCheckBox(checked: picked.contains(genre.id)),
                    onPressed: () => changeChoices(
                      choices,
                      withFilters(
                        value.filters,
                        genres: picked.contains(genre.id)
                            ? [
                                for (final id in picked)
                                  if (id != genre.id) id,
                              ]
                            : [...picked, genre.id],
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}
