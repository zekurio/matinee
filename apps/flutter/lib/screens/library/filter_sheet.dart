import 'dart:math' as math;

import 'package:flutter/services.dart' show TextInputAction;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/display_names.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../home/home_data.dart' show librariesProvider;
import 'list_choices.dart';
import 'list_words.dart';
import 'title_pages.dart';

/// A list's filters in a sheet: what the server offers for the list, each
/// change applied at once, a range once its handle is let go, with Clear
/// filters while any is on and Show titles to close. A phone gets it across the
/// bottom; a tablet the same sheet, no wider than [Sheet.widest].
Future<void> showTitleFilters(BuildContext context, {required ListKey list}) {
  final l = AppLocalizations.of(context);
  return Sheet.show<void>(
    context,
    dismissLabel: l.browseCloseFilters,
    builder: (context) => Sheet(
      title: l.webFiltersTitle,
      footer: _Footer(list: list),
      child: TitleFilterPanel(list: list),
    ),
  );
}

class _Footer extends ConsumerWidget {
  const _Footer({required this.list});

  final ListKey list;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final active = ref.watch(choicesProvider(list)).filterCount;
    return Row(
      children: [
        if (active > 0)
          MatineeButton(
            look: ButtonLook.ghost,
            leading: Lucide.x,
            onPressed: () =>
                ref.read(choicesProvider(list).notifier).clearFilters(),
            child: Text(l.browseClearFilters),
          ),
        const Spacer(),
        MatineeButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l.webFiltersDone),
        ),
      ],
    );
  }
}

/// The sheet's filters: what type or library narrows the list, then each
/// filter the server offers a choice in. The kind is the chosen type, or the
/// picked library's, for what runtime means.
class TitleFilterPanel extends ConsumerWidget {
  const TitleFilterPanel({super.key, required this.list});

  final ListKey list;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final choices = ref.watch(choicesProvider(list));
    final libraries = ref.watch(librariesProvider).value;
    final ofType = [
      for (final library in libraries ?? const <Library>[])
        if (choices.kind == null || library.kind == _libraryKind(choices.kind!))
          library,
    ];
    final pickedLibrary = ofType
        .where((library) => library.id == choices.libraryId)
        .firstOrNull;
    // A library the server no longer lists, or another kind's, is every
    // library.
    final libraryId = pickedLibrary?.id;
    final FilterScope scope = libraryId == null
        ? (
            libraryId: null,
            kind: choices.kind,
            genre: list.genre,
            studio: list.studio,
          )
        : (libraryId: libraryId, kind: null, genre: null, studio: null);
    final options = ref.watch(filterOptionsProvider(scope)).value;
    final filters = choices.filters;
    void change(ListFilters next) =>
        ref.read(choicesProvider(list).notifier).filters(next);
    final ratings = options?.ratings ?? const <RatingSystem>[];
    final countries = DisplayNames.watch(ref, DisplayNameKind.region, [
      for (final system in ratings) system.country,
    ], l.localeName);
    final languages = watchLanguageNames(ref, context, options);

    Widget ratingRow(
      RatingSystem system, {
      required String label,
      String? hint,
    }) {
      final show = system.kind == TitleKind.show;
      final current = show ? filters.showRating : filters.movieRating;
      return OptionRow(
        label: label,
        hint: hint,
        value: current?.rating ?? l.webFiltersAny,
        onPressed: () async {
          final picked = await OptionSheet.show(
            context,
            title: l.webFiltersRating,
            anyLabel: l.webFiltersAny,
            choices: [
              for (final each in system.ratings)
                (value: each.rating, label: each.rating, count: null),
            ],
            value: current?.rating,
          );
          if (picked == null) return;
          final rating = picked.value;
          final limit = rating == null
              ? null
              : (country: system.country, rating: rating);
          change(
            show
                ? filters.copyWith(showRating: () => limit)
                : filters.copyWith(movieRating: () => limit),
          );
        },
      );
    }

    final ratingHint = ratings.length == 1
        ? l.webFiltersRatingHint(countries.nameOf(ratings.single.country))
        : l.webFiltersRatingHintBoth;

    final directRows = <Widget>[
      OptionRow(
        label: l.webRequestsFilterKind,
        value: switch (choices.kind) {
          TitleKind.movie => l.browseKindMovie,
          TitleKind.show => l.browseKindShow,
          _ => l.browseKindAll,
        },
        onPressed: () async {
          final picked = await OptionSheet.show(
            context,
            title: l.webRequestsFilterKind,
            anyLabel: l.browseKindAll,
            choices: [
              (value: TitleKind.movie, label: l.browseKindMovie, count: null),
              (value: TitleKind.show, label: l.browseKindShow, count: null),
            ],
            value: choices.kind,
          );
          if (picked == null) return;
          _pickKind(ref, list, picked.value, libraries);
        },
      ),
      if (ofType.length > 1)
        OptionRow(
          label: l.browseLibrary,
          value: pickedLibrary?.name ?? l.browseLibraryAll,
          onPressed: () async {
            final picked = await OptionSheet.show(
              context,
              title: l.browseLibrary,
              anyLabel: l.browseLibraryAll,
              choices: [
                for (final library in ofType)
                  (
                    value: library.id,
                    label: library.name,
                    count: library.titleCount,
                  ),
              ],
              value: choices.libraryId,
            );
            if (picked == null) return;
            ref.read(choicesProvider(list).notifier).library(picked.value);
          },
        ),
      if (options != null && options.total > 0)
        OptionRow(
          label: l.webFiltersProgress,
          value: filters.watched == null
              ? l.webFiltersAny
              : watchWord(l, filters.watched!),
          onPressed: () async {
            final picked = await OptionSheet.show(
              context,
              title: l.webFiltersProgress,
              anyLabel: l.webFiltersAny,
              choices: [
                for (final (state, count) in [
                  (WatchFilter.unwatched, options.watched.unwatched),
                  (WatchFilter.inProgress, options.watched.inProgress),
                  (WatchFilter.watched, options.watched.watched),
                ])
                  (value: state, label: watchWord(l, state), count: count),
              ],
              value: filters.watched,
            );
            if (picked == null) return;
            change(filters.copyWith(watched: () => picked.value));
          },
        ),
    ];

    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 24,
        children: [
          // One choice after another reads as one list: the rows sit
          // together, and only what keeps a heading has room above it.
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: directRows,
          ),
          if (options == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: LoadingState(label: l.loadingInProgress),
            )
          else ...[
            if (options.genres.isNotEmpty)
              FilterSection(
                title: l.webFiltersGenres,
                child: MultiSelect(
                  choices: _facets(context, options.genres),
                  value: filters.genres,
                  onChanged: (genres) =>
                      change(filters.copyWith(genres: genres)),
                  placeholder: l.browseFindGenre,
                  label: l.webFiltersGenres,
                  empty: l.browseNoGenreMatch,
                  removeLabel: l.multiSelectRemove,
                ),
              ),
            if (options.studios.isNotEmpty)
              FilterSection(
                title: l.webFiltersStudios,
                child: MultiSelect(
                  choices: _facets(context, options.studios),
                  value: filters.studios,
                  onChanged: (studios) =>
                      change(filters.copyWith(studios: studios)),
                  placeholder: l.webFiltersFindStudio,
                  label: l.webFiltersStudios,
                  empty: l.webFiltersNoStudio,
                  removeLabel: l.multiSelectRemove,
                ),
              ),
            if (options.years case final years?)
              RangeField(
                title: l.webFiltersYears,
                range: years,
                low: filters.yearFrom?.toDouble(),
                high: filters.yearTo?.toDouble(),
                words: (low, high) => rangeText(
                  low,
                  high,
                  yearText,
                  l.webFiltersAnyYear,
                  yearWords(l),
                ),
                onCommit: (low, high) => change(
                  filters.copyWith(
                    yearFrom: () => low?.round(),
                    yearTo: () => high?.round(),
                  ),
                ),
              ),
            if (options.scores case final scores?)
              RangeField(
                title: l.webFiltersScore,
                hint: l.webFiltersScoreHint,
                range: scores,
                low: filters.scoreMin,
                high: filters.scoreMax,
                words: (low, high) => rangeText(
                  low,
                  high,
                  (value) => scoreText(context, value),
                  l.webFiltersAnyScore,
                  panelWords(l),
                ),
                onCommit: (low, high) => change(
                  filters.copyWith(scoreMin: () => low, scoreMax: () => high),
                ),
              ),
            if (ratings.isNotEmpty || options.languages.length > 1)
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (ratings.length == 1)
                    ratingRow(
                      ratings.single,
                      label: l.webFiltersRating,
                      hint: ratingHint,
                    )
                  else
                    for (final system in ratings)
                      ratingRow(
                        system,
                        label: system.kind == TitleKind.show
                            ? l.webFiltersRatingRowShow(
                                countries.nameOf(system.country),
                              )
                            : l.webFiltersRatingRowMovie(
                                countries.nameOf(system.country),
                              ),
                        hint: ratingHint,
                      ),
                  if (options.languages.length > 1)
                    OptionRow(
                      label: l.webFiltersLanguage,
                      value: switch (filters.language) {
                        final language? => languages.nameOf(language),
                        null => l.webFiltersAnyLanguage,
                      },
                      onPressed: () async {
                        final picked = await OptionSheet.show(
                          context,
                          title: l.webFiltersLanguage,
                          anyLabel: l.webFiltersAnyLanguage,
                          findPlaceholder: l.browseFindLanguage,
                          choices: [
                            for (final each in options.languages)
                              (
                                value: each.language,
                                label: languages.nameOf(each.language),
                                count: each.titleCount,
                              ),
                          ],
                          value: filters.language,
                        );
                        if (picked == null) return;
                        change(filters.copyWith(language: () => picked.value));
                      },
                    ),
                ],
              ),
            if (options.runtime case final runtime?)
              RangeField(
                title: l.webFiltersRuntime,
                range: runtime,
                low: filters.runtimeMin?.toDouble(),
                high: filters.runtimeMax?.toDouble(),
                words: (low, high) => rangeText(
                  low,
                  high,
                  (value) => runtimeText(l, value.round()) ?? '0',
                  l.webFiltersAnyLength,
                  panelWords(l),
                ),
                onCommit: (low, high) => change(
                  filters.copyWith(
                    runtimeMin: () => low?.round(),
                    runtimeMax: () => high?.round(),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  static List<MultiSelectChoice> _facets(
    BuildContext context,
    List<Facet> facets,
  ) => [
    for (final facet in facets)
      MultiSelectChoice(
        value: facet.name,
        label: facet.name,
        count: countText(context, facet.titleCount),
      ),
  ];
}

/// The library kind that holds each title kind.
String _libraryKind(String kind) =>
    kind == TitleKind.show ? LibraryKind.shows : LibraryKind.movies;

/// Sets the type, and lets go of a picked library of the other kind.
void _pickKind(
  WidgetRef ref,
  ListKey list,
  String? kind,
  List<Library>? libraries,
) {
  final notifier = ref.read(choicesProvider(list).notifier);
  notifier.kind(kind);
  if (kind == null || libraries == null) return;
  final picked = ref.read(choicesProvider(list)).libraryId;
  final library = libraries
      .where((library) => library.id == picked)
      .firstOrNull;
  if (library != null && library.kind != _libraryKind(kind)) {
    notifier.library(null);
  }
}

/// The names of the languages [options] offers, in the app's language.
DisplayNames watchLanguageNames(
  WidgetRef ref,
  BuildContext context,
  TitleFilterOptions? options,
) => DisplayNames.watch(ref, DisplayNameKind.language, [
  for (final each in options?.languages ?? const <LanguageCount>[])
    each.language,
], AppLocalizations.of(context).localeName);

/// A filter's name and what it's set to, which opens an [OptionSheet] to
/// pick another. The whole row is the tap target, and [hint] says how the
/// filter reads under the name.
class OptionRow extends StatelessWidget {
  const OptionRow({
    super.key,
    required this.label,
    required this.value,
    required this.onPressed,
    this.hint,
  });

  /// The filter's name, as the sections' headings have theirs.
  final String label;

  /// What it's set to now, at the row's end.
  final String value;

  /// A line about the filter, under its name.
  final String? hint;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final muted = KitText.xs.style(color: colors.mutedForeground);
    return PressIndication(
      onPressed: onPressed,
      // The name and its value are one button to a screen reader, as the
      // heading and value row used to read together.
      label: '$label, $value',
      shape: KitRadius.control,
      builder: (context, state) => ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: LayoutBuilder(
              builder: (context, constraints) => Row(
                spacing: 12,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: KitText.sm.style(
                            color: state == PressState.pressed
                                ? colors.mutedForeground
                                : colors.foreground,
                          ),
                        ),
                        if (hint case final hint?)
                          Text(
                            hint,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: muted,
                          ),
                      ],
                    ),
                  ),
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      maxWidth: constraints.maxWidth * .5,
                    ),
                    child: Text(
                      value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.end,
                      style: muted,
                    ),
                  ),
                  KitIcon(
                    Lucide.chevronRight,
                    size: 18,
                    color: colors.mutedForeground,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// What an [OptionSheet] gave back: a choice's value, or null for any.
typedef OptionPick = ({String? value});

/// A long list to pick one from, or none with Any, with a field that finds one
/// by name when [findPlaceholder] names one. It opens over the filters' sheet
/// and answers once a row is picked.
class OptionSheet extends StatefulWidget {
  const OptionSheet({
    super.key,
    required this.title,
    required this.anyLabel,
    required this.choices,
    required this.value,
    this.findPlaceholder,
  });

  final String title;
  final String anyLabel;
  final List<FilterChoice> choices;
  final String? value;
  final String? findPlaceholder;

  /// Opens it; null when it's dismissed without a pick.
  static Future<OptionPick?> show(
    BuildContext context, {
    required String title,
    required String anyLabel,
    required List<FilterChoice> choices,
    required String? value,
    String? findPlaceholder,
  }) => Sheet.show<OptionPick>(
    context,
    dismissLabel: AppLocalizations.of(context).commonCancel,
    builder: (context) => OptionSheet(
      title: title,
      anyLabel: anyLabel,
      choices: choices,
      value: value,
      findPlaceholder: findPlaceholder,
    ),
  );

  @override
  State<OptionSheet> createState() => _OptionSheetState();
}

class _OptionSheetState extends State<OptionSheet> {
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
    final query = _query.text.trim().toLowerCase();
    final find = widget.findPlaceholder;
    final shown = [
      for (final choice in widget.choices)
        if (query.isEmpty || choice.label.toLowerCase().contains(query)) choice,
    ];
    void pick(String? value) => Navigator.of(context).pop((value: value));
    return Sheet(
      title: widget.title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (find != null) ...[
            MatineeTextField(
              controller: _query,
              placeholder: find,
              leading: Lucide.search,
              textInputAction: TextInputAction.search,
            ),
            const SizedBox(height: 8),
          ],
          if (query.isEmpty)
            _PickRow(
              label: widget.anyLabel,
              selected: widget.value == null,
              onPressed: () => pick(null),
            ),
          for (final choice in shown)
            _PickRow(
              label: choice.label,
              count: switch (choice.count) {
                final count? => countText(context, count),
                null => null,
              },
              selected: choice.value == widget.value,
              onPressed: () => pick(choice.value),
            ),
        ],
      ),
    );
  }
}

/// One of an [OptionSheet]'s rows: the name, its count, and a tick on the
/// one picked.
class _PickRow extends StatelessWidget {
  const _PickRow({
    required this.label,
    required this.selected,
    required this.onPressed,
    this.count,
  });

  final String label;
  final String? count;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final count = this.count;
    return PressIndication(
      onPressed: onPressed,
      label: [label, ?count].join(', '),
      checked: selected,
      shape: KitRadius.control,
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Row(
              spacing: 12,
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: KitText.base.style(color: colors.foreground),
                  ),
                ),
                if (count != null)
                  Text(
                    count,
                    style: KitText.sm.style(color: colors.mutedForeground),
                  ),
                if (selected)
                  KitIcon(Lucide.check, size: 18, color: colors.accent),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A filter's heading, a line about it, what it's set to at the end, and
/// its control.
class FilterSection extends StatelessWidget {
  const FilterSection({
    super.key,
    required this.title,
    required this.child,
    this.hint,
    this.value,
  });

  final String title;
  final String? hint;
  final String? value;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final muted = KitText.xs.style(color: colors.mutedForeground);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 10,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          spacing: 12,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      title,
                      style: KitText.sm.style(
                        color: colors.foreground,
                        weight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (hint case final hint?) Text(hint, style: muted),
                ],
              ),
            ),
            if (value case final value?)
              Padding(
                // The space an [OptionRow]'s chevron takes, so every value
                // in the sheet ends in the same place.
                padding: const EdgeInsetsDirectional.only(end: 30),
                child: Text(value, style: muted),
              ),
          ],
        ),
        child,
      ],
    );
  }
}

/// A choice a filter offers: what it sets, its words, and how many titles
/// it has.
typedef FilterChoice = ({String value, String label, int? count});

/// Two handles on a range, each open at its end. What it says follows the
/// handles; the list changes once they're let go.
class RangeField extends StatefulWidget {
  const RangeField({
    super.key,
    required this.title,
    required this.range,
    required this.low,
    required this.high,
    required this.words,
    required this.onCommit,
    this.hint,
  });

  final String title;
  final String? hint;
  final FilterRange range;
  final double? low;
  final double? high;
  final String Function(double? low, double? high) words;
  final void Function(double? low, double? high) onCommit;

  @override
  State<RangeField> createState() => _RangeFieldState();
}

class _RangeFieldState extends State<RangeField> {
  late RangeValues _moving = _fromWidget();

  RangeValues _fromWidget() {
    final range = widget.range;
    return RangeValues(
      (widget.low ?? range.min).clamp(range.min, range.max),
      (widget.high ?? range.max).clamp(range.min, range.max),
    );
  }

  @override
  void didUpdateWidget(RangeField old) {
    super.didUpdateWidget(old);
    if (old.low != widget.low ||
        old.high != widget.high ||
        old.range.min != widget.range.min ||
        old.range.max != widget.range.max) {
      _moving = _fromWidget();
    }
  }

  /// The handles snapped to the steps, each null at its end of the span.
  (double?, double?) _open(RangeValues values) {
    final range = widget.range;
    double snap(double value) =>
        range.min + ((value - range.min) / range.step).round() * range.step;
    final low = snap(values.start);
    final high = snap(values.end);
    return (low <= range.min ? null : low, high >= range.max ? null : high);
  }

  @override
  Widget build(BuildContext context) {
    final range = widget.range;
    final (low, high) = _open(_moving);
    final said = widget.words(low, high);
    final steps = range.step <= 0
        ? null
        : math.max(1, ((range.max - range.min) / range.step).round());
    return FilterSection(
      title: widget.title,
      hint: widget.hint,
      value: said,
      child: range.max <= range.min
          ? const SizedBox.shrink()
          : RangeSlider(
              values: _moving,
              min: range.min,
              max: range.max,
              divisions: steps,
              label: widget.title,
              formatValue: (_) => said,
              onChanged: (values) => setState(() => _moving = values),
              onChangeEnd: (values) {
                final (a, b) = _open(values);
                widget.onCommit(a, b);
              },
            ),
    );
  }
}
