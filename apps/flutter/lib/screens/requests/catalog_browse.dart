import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart' show TextInputAction;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/format.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import '../library/filter_sheet.dart'
    show FilterChoiceChips, FilterSection, FilterToggleChips, RangeField;
import '../library/list_words.dart';
import '../library/title_grid.dart' show ListBarButton;
import 'catalog_cards.dart';
import 'follow_window.dart';
import 'request_sheet.dart';
import 'request_words.dart';
import 'requests_data.dart';
import 'requests_hub.dart';

/// All of TMDB's movies or shows, or the viewer's recommendations of them,
/// narrowed by filters and in the order the viewer picks, as the web's browse
/// pages under Discover: a grid that loads more as it scrolls, the filters in a
/// sheet as a library's are, and the sort in the bar's menu. Each Discover
/// row's heading opens one with the row's filters and sort. What each filter
/// offers comes from the server. Titles that are here are the library's cards;
/// the rest ask, as on Explore.

/// Whether a browse lists the viewer's recommendations, whose cards offer
/// "Not interested".
bool _recommends(CatalogFilters filters) => filters.recommended == true;

/// Best match only among recommendations, as the server has it.
bool _sortFits(String sort, CatalogFilters filters) =>
    sort != CatalogSort.forYou || _recommends(filters);

String _sortWord(String sort, AppLocalizations l) => switch (sort) {
  CatalogSort.forYou => l.webDiscoverBrowseSortForYou,
  CatalogSort.scoreHigh => l.webFiltersSortScoreHigh,
  CatalogSort.scoreLow => l.webFiltersSortScoreLow,
  CatalogSort.votes => l.webDiscoverBrowseSortVotes,
  CatalogSort.newest => l.webFiltersSortNewest,
  CatalogSort.oldest => l.webFiltersSortOldest,
  CatalogSort.nameAsc => l.webFiltersSortNameAsc,
  CatalogSort.nameDesc => l.webFiltersSortNameDesc,
  _ => l.webDiscoverBrowseSortPopular,
};

/// "Browse movies", "Browse shows".
String browseName(String kind, AppLocalizations l) =>
    kind == TitleKind.show ? l.webDiscoverBrowseShow : l.webDiscoverBrowseMovie;

/// How many filters are on, a range counting once.
int filterCount(CatalogFilters filters) =>
    (filters.genres?.length ?? 0) +
    [
      filters.yearFrom != null || filters.yearTo != null,
      filters.scoreMin != null || filters.scoreMax != null,
      filters.votesMin != null,
      filters.rating != null,
      filters.language != null,
      filters.runtimeMin != null || filters.runtimeMax != null,
      filters.recommended == true,
      filters.upcoming == true,
      filters.requestable == true,
    ].where((on) => on).length;

/// What a card says under its name, as the server says the list calls
/// for; else the year.
CardDetail? browseDetail(
  BuildContext context,
  String? detail,
  CatalogBrowseTitle item,
) {
  final l = AppLocalizations.of(context);
  final score = item.score;
  final year = item.year?.toString();
  if (detail == 'score' && score != null) {
    return scoreDetail(l, formatRating(score, l), year);
  }
  if (detail == 'releaseDate') {
    if (formatDay(item.releaseDate, l) case final day?) return CardDetail(day);
  }
  return year == null ? null : CardDetail(year);
}

/// [filters] with the fields given changed; a getter, so null can be set.
CatalogFilters _with(
  CatalogFilters filters, {
  List<int>? genres,
  ValueGetter<int?>? yearFrom,
  ValueGetter<int?>? yearTo,
  ValueGetter<double?>? scoreMin,
  ValueGetter<double?>? scoreMax,
  ValueGetter<int?>? votesMin,
  ValueGetter<String?>? rating,
  ValueGetter<String?>? language,
  ValueGetter<int?>? runtimeMin,
  ValueGetter<int?>? runtimeMax,
  ValueGetter<bool?>? recommended,
  ValueGetter<bool?>? upcoming,
  ValueGetter<bool?>? requestable,
}) => CatalogFilters(
  genres: genres ?? filters.genres,
  yearFrom: yearFrom == null ? filters.yearFrom : yearFrom(),
  yearTo: yearTo == null ? filters.yearTo : yearTo(),
  scoreMin: scoreMin == null ? filters.scoreMin : scoreMin(),
  scoreMax: scoreMax == null ? filters.scoreMax : scoreMax(),
  votesMin: votesMin == null ? filters.votesMin : votesMin(),
  rating: rating == null ? filters.rating : rating(),
  language: language == null ? filters.language : language(),
  runtimeMin: runtimeMin == null ? filters.runtimeMin : runtimeMin(),
  runtimeMax: runtimeMax == null ? filters.runtimeMax : runtimeMax(),
  recommended: recommended == null ? filters.recommended : recommended(),
  upcoming: upcoming == null ? filters.upcoming : upcoming(),
  requestable: requestable == null ? filters.requestable : requestable(),
);

/// What a browse is narrowed and ordered by, which the screen and its
/// filter sheet share.
typedef BrowseChoices = ({CatalogFilters filters, String sort});

/// Browsing [kind], with [filters] (`CatalogFilters` JSON) and [sort] from
/// a Discover row's heading, or none.
class CatalogBrowseScreen extends ConsumerStatefulWidget {
  const CatalogBrowseScreen({
    super.key,
    required this.kind,
    this.filters,
    this.sort,
  });

  final String kind;
  final String? filters;
  final String? sort;

  @override
  ConsumerState<CatalogBrowseScreen> createState() =>
      _CatalogBrowseScreenState();
}

class _CatalogBrowseScreenState extends ConsumerState<CatalogBrowseScreen> {
  late final _choices = ValueNotifier<BrowseChoices>((
    filters: parseFilters(widget.filters) ?? noFilters,
    sort: widget.sort ?? CatalogSort.popular,
  ));

  @override
  void initState() {
    super.initState();
    _choices.addListener(_changed);
  }

  void _changed() => setState(() {});

  @override
  void dispose() {
    _choices.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final kind = widget.kind;
    final options = ref.watch(browseOptionsProvider(kind));
    final ready = options.value?.enabled == true ? options.value : null;
    final choices = _choices.value;
    final Widget body;
    if (options.value case final value?) {
      body = value.enabled
          ? _BrowseGrid(kind: kind, choices: _choices)
          : Center(
              child: EmptyState(
                icon: Lucide.compass,
                title: l.webDiscoverOff,
                message: l.webDiscoverOffHint,
              ),
            );
    } else if (options.error case final error? when !options.isLoading) {
      body = Center(
        child: FailureState(
          title: l.browseFiltersFailed,
          error: error,
          onRetry: () => ref.invalidate(browseOptionsProvider(kind)),
        ),
      );
    } else {
      body = LoadingState(label: l.loadingInProgress);
    }
    final active = filterCount(choices.filters);
    return PageFrame(
      title: browseName(kind, l),
      onBack: () => context.pop(),
      backLabel: l.commonBack,
      actions: [
        if (ready != null) ...[
          ListBarButton(
            icon: Lucide.listFilter,
            label: active > 0 ? l.browseFiltersOn(active) : l.webFiltersTitle,
            active: active > 0,
            onPressed: () => _showFilters(context, kind, ready, _choices),
          ),
          Menu(
            side: MenuSide.end,
            trigger: (context, toggle, open, focusNode) => ListBarButton(
              icon: Lucide.arrowUpDown,
              label: l.browseSortCurrent(_sortWord(choices.sort, l)),
              focusNode: focusNode,
              onPressed: toggle,
            ),
            children: [
              for (final sort in ready.sorts)
                if (_sortFits(sort, choices.filters))
                  MenuItem(
                    label: _sortWord(sort, l),
                    selected: sort == choices.sort,
                    onPressed: () =>
                        _choices.value = (filters: choices.filters, sort: sort),
                  ),
            ],
          ),
        ],
      ],
      child: body,
    );
  }
}

/// Changes the filters, and with them a sort that no longer fits: best
/// match goes with the recommendations, and back to popular without them.
void _change(ValueNotifier<BrowseChoices> choices, CatalogFilters filters) {
  final sort = choices.value.sort;
  choices.value = (
    filters: filters,
    sort: _sortFits(sort, filters) ? sort : CatalogSort.popular,
  );
}

/// Load the next page once a card this close to the end is built.
const _nearEnd = 12;

class _BrowseGrid extends ConsumerStatefulWidget {
  const _BrowseGrid({required this.kind, required this.choices});

  final String kind;
  final ValueNotifier<BrowseChoices> choices;

  @override
  ConsumerState<_BrowseGrid> createState() => _BrowseGridState();
}

class _BrowseGridState extends ConsumerState<_BrowseGrid> {
  final _scroll = ScrollController();

  /// The cards built now, which pick the ones the live stream follows.
  final _shown = FollowWindow();
  BrowseKey? _key;
  bool _askedMore = false;

  @override
  void dispose() {
    _scroll.dispose();
    _shown.dispose();
    super.dispose();
  }

  void _more(BrowseKey key) {
    if (_askedMore) return;
    _askedMore = true;
    // Not while building: asking changes the provider's state.
    SchedulerBinding.instance.addPostFrameCallback((_) {
      _askedMore = false;
      if (mounted) ref.read(browsePagesProvider(key).notifier).more();
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final choices = widget.choices.value;
    final kind = widget.kind;
    final key = BrowseKey(kind, choices.filters, choices.sort);
    if (key != _key) {
      // A new browse starts at the top.
      if (_key != null && _scroll.hasClients) _scroll.jumpTo(0);
      _key = key;
    }
    final pages = ref.watch(browsePagesProvider(key));
    final recommended = _recommends(choices.filters);
    final hidden = recommended
        ? ref.watch(hiddenRecommendationsProvider)
        : const <String>{};
    final shown = [
      for (final item in pages.items)
        if (!hidden.contains(refKey(item.ref))) item,
    ];
    final filtered = filterCount(choices.filters) > 0;
    void clear() => _change(widget.choices, noFilters);
    final clearButton = MatineeButton(
      look: ButtonLook.outline,
      onPressed: clear,
      child: Text(l.browseClearFilters),
    );

    Widget first() {
      if (pages.error case final error?) {
        return FailureState(
          title: l.gridLoadFailed,
          error: error,
          onRetry: () => ref.read(browsePagesProvider(key).notifier).more(),
        );
      }
      if (pages.loading || pages.next != null) {
        return LoadingState(label: l.loadingInProgress);
      }
      if (recommended) {
        return EmptyState(
          icon: Lucide.compass,
          title: l.webDiscoverBrowseForYouNone,
          message: l.webDiscoverBrowseForYouHint,
          action: filtered ? clearButton : null,
        );
      }
      if (filtered) {
        return EmptyState(
          icon: Lucide.searchX,
          title: kind == TitleKind.show
              ? l.webDiscoverBrowseNoneShow
              : l.webDiscoverBrowseNoneMovie,
          message: l.webFiltersNoneHint,
          action: clearButton,
        );
      }
      return EmptyState(
        icon: Lucide.searchX,
        title: l.webDiscoverBrowseNothing,
      );
    }

    return ListenableBuilder(
      listenable: _shown,
      builder: (context, _) => FollowTitles(
        // The cards around the screen; library cards play, so only the
        // rest can change.
        titles: FollowedTitles([
          for (final item in _shown.slice(shown))
            if (item.title == null) CatalogInput(ref: item.ref),
        ]),
        child: CustomScrollView(
          controller: _scroll,
          slivers: [
            if (pages.stale)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    CardMetrics.gutter,
                    0,
                    CardMetrics.gutter,
                    16,
                  ),
                  child: Row(
                    spacing: 8,
                    children: [
                      KitIcon(
                        Lucide.cloudOff,
                        size: 16,
                        color: colors.mutedForeground,
                      ),
                      Expanded(
                        child: Text(
                          l.webDiscoverStale,
                          style: KitText.sm.style(
                            color: colors.mutedForeground,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (pages.items.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 48),
                    child: first(),
                  ),
                ),
              )
            else ...[
              const SliverToBoxAdapter(child: SizedBox(height: 4)),
              CardGrid(
                columns: posterColumns,
                aspectRatio: CardMetrics.poster,
                itemCount: shown.length,
                itemBuilder: (context, index) {
                  if (index >= shown.length - _nearEnd && pages.error == null) {
                    _more(key);
                  }
                  final item = shown[index];
                  return FollowedCard(
                    window: _shown,
                    index: index,
                    child: CatalogTitleCard.browse(
                      item,
                      detail: browseDetail(context, pages.detail, item),
                      recommended: recommended,
                    ),
                  );
                },
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Center(
                    child: switch (pages) {
                      BrowsePagesState(loading: true) => LoadingState(
                        label: l.loadingInProgress,
                      ),
                      BrowsePagesState(:final error?) => FailureState(
                        title: l.gridMoreFailed,
                        error: error,
                        onRetry: () =>
                            ref.read(browsePagesProvider(key).notifier).more(),
                      ),
                      BrowsePagesState(next: null) => Text(
                        l.webDiscoverEnd,
                        style: KitText.sm.style(color: colors.mutedForeground),
                      ),
                      _ => const SizedBox.shrink(),
                    },
                  ),
                ),
              ),
            ],
            SliverToBoxAdapter(
              child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 8),
            ),
          ],
        ),
      ),
    );
  }
}

/// The filters, in a sheet as the libraries' are: each change applies at
/// once, a range once its handle is let go.
void _showFilters(
  BuildContext context,
  String kind,
  CatalogBrowseOptions options,
  ValueNotifier<BrowseChoices> choices,
) {
  final l = AppLocalizations.of(context);
  Sheet.show<void>(
    context,
    dismissLabel: l.browseCloseFilters,
    builder: (context) => ValueListenableBuilder(
      valueListenable: choices,
      builder: (context, value, _) => Sheet(
        title: l.webFiltersTitle,
        footer: Row(
          children: [
            if (filterCount(value.filters) > 0)
              MatineeButton(
                look: ButtonLook.ghost,
                leading: Lucide.x,
                onPressed: () => _change(choices, noFilters),
                child: Text(l.browseClearFilters),
              ),
            const Spacer(),
            MatineeButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(l.webFiltersDone),
            ),
          ],
        ),
        child: _FilterPanel(
          kind: kind,
          options: options,
          choices: value,
          onChange: (filters) => _change(choices, filters),
        ),
      ),
    ),
  ).ignore();
}

FilterRange _span(CatalogRange range) =>
    FilterRange(min: range.min, max: range.max, step: range.step);

class _FilterPanel extends ConsumerWidget {
  const _FilterPanel({
    required this.kind,
    required this.options,
    required this.choices,
    required this.onChange,
  });

  final String kind;
  final CatalogBrowseOptions options;
  final BrowseChoices choices;
  final ValueChanged<CatalogFilters> onChange;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final filters = choices.filters;
    final sort = choices.sort;
    final floor = ref.watch(
      browsePagesProvider(BrowseKey(kind, filters, sort))
          .select((pages) => pages.voteFloor),
    );
    final ratings = options.ratings;
    final languages = options.languages;
    final language = languages
        .where((each) => each.id == filters.language)
        .firstOrNull;
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 24,
        children: [
          FilterSection(
            title: l.webDiscoverBrowseOnly,
            hint: l.webDiscoverBrowseOnlyHint,
            child: FilterToggleChips(
              choices: [
                (
                  value: 'recommended',
                  label: l.webDiscoverBrowseRecommended,
                  count: null,
                ),
                (
                  value: 'upcoming',
                  label: l.webDiscoverBrowseUpcoming,
                  count: null,
                ),
                (
                  value: 'requestable',
                  label: l.webDiscoverBrowseRequestable,
                  count: null,
                ),
              ],
              value: [
                if (filters.recommended == true) 'recommended',
                if (filters.upcoming == true) 'upcoming',
                if (filters.requestable == true) 'requestable',
              ],
              onChanged: (picked) => onChange(
                _with(
                  filters,
                  recommended: () =>
                      picked.contains('recommended') ? true : null,
                  upcoming: () => picked.contains('upcoming') ? true : null,
                  requestable: () =>
                      picked.contains('requestable') ? true : null,
                ),
              ),
            ),
          ),
          if (options.genres.isNotEmpty)
            FilterSection(
              title: l.webFiltersGenres,
              child: FilterToggleChips(
                choices: [
                  for (final genre in options.genres)
                    (value: '${genre.id}', label: genre.name, count: null),
                ],
                value: [for (final id in filters.genres ?? <int>[]) '$id'],
                onChanged: (picked) => onChange(
                  _with(
                    filters,
                    genres: [for (final id in picked) ?int.tryParse(id)],
                  ),
                ),
              ),
            ),
          RangeField(
            title: l.webFiltersYears,
            range: _span(options.years),
            low: filters.yearFrom?.toDouble(),
            high: filters.yearTo?.toDouble(),
            words: (low, high) => rangeText(
              low,
              high,
              yearText,
              l.webFiltersAnyYear,
              yearWords(l),
            ),
            onCommit: (low, high) => onChange(
              _with(
                filters,
                yearFrom: () => low?.round(),
                yearTo: () => high?.round(),
              ),
            ),
          ),
          RangeField(
            title: l.webFiltersScore,
            hint: l.webDiscoverBrowseScoreHint,
            range: _span(options.scores),
            low: filters.scoreMin,
            high: filters.scoreMax,
            words: (low, high) => rangeText(
              low,
              high,
              (value) => formatRating(value, l),
              l.webFiltersAnyScore,
              panelWords(l),
            ),
            onCommit: (low, high) => onChange(
              _with(filters, scoreMin: () => low, scoreMax: () => high),
            ),
          ),
          if (options.votes.isNotEmpty)
            FilterSection(
              title: l.webDiscoverBrowseVotes,
              hint: floor == null
                  ? null
                  : sort == CatalogSort.scoreHigh ||
                        sort == CatalogSort.scoreLow
                  ? l.webDiscoverBrowseFloorScore(formatCount(floor, l))
                  : l.webDiscoverBrowseFloorList(formatCount(floor, l)),
              child: FilterChoiceChips(
                anyLabel: l.webFiltersAny,
                choices: [
                  for (final votes in options.votes)
                    (
                      value: '$votes',
                      label: l.webDiscoverBrowseVotesStep(
                        formatCount(votes, l),
                      ),
                      count: null,
                    ),
                ],
                value: filters.votesMin?.toString(),
                onChanged: (votes) => onChange(
                  _with(
                    filters,
                    votesMin: () => votes == null ? null : int.tryParse(votes),
                  ),
                ),
              ),
            ),
          if (ratings != null && ratings.ratings.isNotEmpty)
            FilterSection(
              title: l.webFiltersRating,
              // The country's name needs the platform's words, which this
              // app doesn't ask for yet; its code says which system it is.
              hint: l.webFiltersRatingHint(ratings.country),
              child: FilterChoiceChips(
                anyLabel: l.webFiltersAny,
                choices: [
                  for (final rating in ratings.ratings)
                    (value: rating, label: rating, count: null),
                ],
                value: filters.rating,
                onChanged: (rating) =>
                    onChange(_with(filters, rating: () => rating)),
              ),
            ),
          if (languages.isNotEmpty)
            FilterSection(
              title: l.webFiltersLanguage,
              child: MatineeButton(
                look: ButtonLook.outline,
                trailing: Lucide.chevronDown,
                onPressed: () => _pickLanguage(
                  context,
                  languages,
                  filters.language,
                  (picked) => onChange(_with(filters, language: () => picked)),
                ),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    language?.name ?? l.webFiltersAnyLanguage,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ),
          RangeField(
            title: l.webFiltersRuntime,
            hint: kind == TitleKind.show
                ? l.webFiltersRuntimeHintShow
                : l.webFiltersRuntimeHintMovie,
            range: _span(options.runtime),
            low: filters.runtimeMin?.toDouble(),
            high: filters.runtimeMax?.toDouble(),
            words: (low, high) => rangeText(
              low,
              high,
              (value) => runtimeText(l, value.round()) ?? '0',
              l.webFiltersAnyLength,
              panelWords(l),
            ),
            onCommit: (low, high) => onChange(
              _with(
                filters,
                runtimeMin: () => low?.round(),
                runtimeMax: () => high?.round(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The original language, in a sheet of its own with a field that finds
/// one by name, Any language first.
void _pickLanguage(
  BuildContext context,
  List<CatalogChoice> languages,
  String? current,
  ValueChanged<String?> onPick,
) {
  final l = AppLocalizations.of(context);
  Sheet.show<void>(
    context,
    dismissLabel: l.commonCancel,
    builder: (context) => _LanguageSheet(
      languages: languages,
      current: current,
      onPick: (picked) {
        Navigator.of(context).pop();
        onPick(picked);
      },
    ),
  ).ignore();
}

class _LanguageSheet extends StatefulWidget {
  const _LanguageSheet({
    required this.languages,
    required this.current,
    required this.onPick,
  });

  final List<CatalogChoice> languages;
  final String? current;
  final ValueChanged<String?> onPick;

  @override
  State<_LanguageSheet> createState() => _LanguageSheetState();
}

class _LanguageSheetState extends State<_LanguageSheet> {
  final _query = TextEditingController();

  @override
  void initState() {
    super.initState();
    _query.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final query = _query.text.trim().toLowerCase();
    final shown = [
      for (final language in widget.languages)
        if (query.isEmpty || language.name.toLowerCase().contains(query))
          language,
    ];
    return Sheet(
      title: l.webFiltersLanguage,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 8,
        children: [
          MatineeTextField(
            controller: _query,
            placeholder: l.browseFindLanguage,
            leading: Lucide.search,
            textInputAction: TextInputAction.search,
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (query.isEmpty)
                RadioRow(
                  label: l.webFiltersAnyLanguage,
                  selected: widget.current == null,
                  onPressed: () => widget.onPick(null),
                ),
              for (final language in shown)
                RadioRow(
                  label: language.name,
                  selected: language.id == widget.current,
                  onPressed: () => widget.onPick(language.id),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
