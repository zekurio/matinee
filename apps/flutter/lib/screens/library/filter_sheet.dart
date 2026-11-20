import 'dart:math' as math;

import 'package:flutter/services.dart' show TextInputAction;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/display_names.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import 'list_choices.dart';
import 'list_words.dart';
import 'title_pages.dart';

/// A list's filters in a sheet, as the Kotlin app's `TitleFilterSheet`:
/// what the server offers for the list, each change applied at once, a
/// range once its handle is let go, with Clear filters while any is on and
/// Show titles to close. A phone gets it across the bottom; a tablet the
/// same sheet, no wider than [Sheet.widest].
Future<void> showTitleFilters(
  BuildContext context, {
  required ListKey list,
  required FilterScope scope,
  required String? kind,
}) {
  final l = AppLocalizations.of(context);
  return Sheet.show<void>(
    context,
    dismissLabel: l.browseCloseFilters,
    builder: (context) => Sheet(
      title: l.webFiltersTitle,
      footer: _Footer(list: list),
      child: TitleFilterPanel(list: list, scope: scope, kind: kind),
    ),
  );
}

/// How many studios show before the field that finds the rest.
const _studiosShown = 10;

class _Footer extends ConsumerWidget {
  const _Footer({required this.list});

  final ListKey list;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final active = ref.watch(choicesProvider(list)).filters.count;
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

/// The sheet's filters, each shown only when the server offers a choice
/// in it. [kind] is every title's kind when they're all one, for what
/// runtime means.
class TitleFilterPanel extends ConsumerWidget {
  const TitleFilterPanel({
    super.key,
    required this.list,
    required this.scope,
    required this.kind,
  });

  final ListKey list;
  final FilterScope scope;
  final String? kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final options = ref.watch(filterOptionsProvider(scope)).value;
    if (options == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: LoadingState(label: l.loadingInProgress),
      );
    }
    final filters = ref.watch(choicesProvider(list)).filters;
    void change(ListFilters next) =>
        ref.read(choicesProvider(list).notifier).filters(next);
    final ratings = options.ratings;
    final countries = DisplayNames.watch(ref, DisplayNameKind.region, [
      for (final system in ratings) system.country,
    ], l.localeName);
    final languages = watchLanguageNames(ref, context, options);
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 24,
        children: [
          if (options.total > 0)
            FilterSection(
              title: l.webFiltersProgress,
              child: FilterChoiceChips(
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
                onChanged: (state) =>
                    change(filters.copyWith(watched: () => state)),
              ),
            ),
          if (options.genres.isNotEmpty)
            FilterSection(
              title: l.webFiltersGenres,
              child: FilterToggleChips(
                choices: _facets(options.genres),
                value: filters.genres,
                onChanged: (genres) => change(filters.copyWith(genres: genres)),
              ),
            ),
          if (options.studios.isNotEmpty)
            FilterSection(
              title: l.webFiltersStudios,
              child: FilterToggleChips(
                choices: _facets(options.studios),
                value: filters.studios,
                onChanged: (studios) =>
                    change(filters.copyWith(studios: studios)),
                limit: _studiosShown,
                findPlaceholder: l.webFiltersFindStudio,
                noMatch: l.webFiltersNoStudio,
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
          if (ratings.isNotEmpty)
            FilterSection(
              title: l.webFiltersRating,
              hint: ratings.length == 1
                  ? l.webFiltersRatingHint(
                      countries.nameOf(ratings.single.country),
                    )
                  : l.webFiltersRatingHintBoth,
              child: ratings.length == 1
                  ? _RatingChips(
                      system: ratings.single,
                      filters: filters,
                      onChanged: change,
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      spacing: 12,
                      children: [
                        for (final system in ratings)
                          FilterSection(
                            title: system.kind == TitleKind.show
                                ? l.webFiltersRatingRowShow(
                                    countries.nameOf(system.country),
                                  )
                                : l.webFiltersRatingRowMovie(
                                    countries.nameOf(system.country),
                                  ),
                            small: true,
                            child: _RatingChips(
                              system: system,
                              filters: filters,
                              onChanged: change,
                            ),
                          ),
                      ],
                    ),
            ),
          if (options.languages.length > 1)
            FilterSection(
              title: l.webFiltersLanguage,
              child: OptionRow(
                label: switch (filters.language) {
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
            ),
          if (options.runtime case final runtime?)
            RangeField(
              title: l.webFiltersRuntime,
              // A show's runtime is an episode's.
              hint: switch (kind) {
                TitleKind.show => l.webFiltersRuntimeHintShow,
                TitleKind.movie => l.webFiltersRuntimeHintMovie,
                _ => l.webFiltersRuntimeHintBoth,
              },
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
      ),
    );
  }

  static List<FilterChoice> _facets(List<Facet> facets) => [
    for (final facet in facets)
      (value: facet.name, label: facet.name, count: facet.titleCount),
  ];
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

/// A row naming what's picked from a long list, which opens an
/// [OptionSheet] to pick another.
class OptionRow extends StatelessWidget {
  const OptionRow({super.key, required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      label: label,
      shape: KitRadius.control,
      builder: (context, state) => ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: KitText.base.style(
                  color: state == PressState.pressed
                      ? colors.mutedForeground
                      : colors.foreground,
                ),
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
    );
  }
}

/// What an [OptionSheet] gave back: a choice's value, or null for any.
typedef OptionPick = ({String? value});

/// A long list to pick one from, or none with Any, with a field that finds
/// one by name, as the Kotlin app's `OptionSheet`. It opens over the
/// filters' sheet and answers once a row is picked.
class OptionSheet extends StatefulWidget {
  const OptionSheet({
    super.key,
    required this.title,
    required this.anyLabel,
    required this.findPlaceholder,
    required this.choices,
    required this.value,
  });

  final String title;
  final String anyLabel;
  final String findPlaceholder;
  final List<FilterChoice> choices;
  final String? value;

  /// Opens it; null when it's dismissed without a pick.
  static Future<OptionPick?> show(
    BuildContext context, {
    required String title,
    required String anyLabel,
    required String findPlaceholder,
    required List<FilterChoice> choices,
    required String? value,
  }) => Sheet.show<OptionPick>(
    context,
    dismissLabel: AppLocalizations.of(context).commonCancel,
    builder: (context) => OptionSheet(
      title: title,
      anyLabel: anyLabel,
      findPlaceholder: findPlaceholder,
      choices: choices,
      value: value,
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
          MatineeTextField(
            controller: _query,
            placeholder: widget.findPlaceholder,
            leading: Lucide.search,
            textInputAction: TextInputAction.search,
          ),
          const SizedBox(height: 8),
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
/// its control. [small] is a part under a filter's own heading.
class FilterSection extends StatelessWidget {
  const FilterSection({
    super.key,
    required this.title,
    required this.child,
    this.hint,
    this.value,
    this.small = false,
  });

  final String title;
  final String? hint;
  final String? value;
  final bool small;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final muted = KitText.xs.style(color: colors.mutedForeground);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: small ? 8 : 10,
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
                    header: !small,
                    child: Text(
                      title,
                      style: small
                          ? KitText.xs.style(
                              color: colors.mutedForeground,
                              weight: FontWeight.w500,
                            )
                          : KitText.sm.style(
                              color: colors.foreground,
                              weight: FontWeight.w600,
                            ),
                    ),
                  ),
                  if (hint case final hint?) Text(hint, style: muted),
                ],
              ),
            ),
            if (value case final value?) Text(value, style: muted),
          ],
        ),
        child,
      ],
    );
  }
}

/// A chip's choice: what it sets, its words, and how many titles it has.
typedef FilterChoice = ({String value, String label, int? count});

/// One of a few values, or none: Any first, then each.
class FilterChoiceChips extends StatelessWidget {
  const FilterChoiceChips({
    super.key,
    required this.anyLabel,
    required this.choices,
    required this.value,
    required this.onChanged,
  });

  final String anyLabel;
  final List<FilterChoice> choices;
  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 6,
    runSpacing: 6,
    children: [
      ChoiceChip(
        label: anyLabel,
        selected: value == null,
        onPressed: () => onChanged(null),
      ),
      for (final choice in choices)
        ChoiceChip(
          label: choice.label,
          selected: choice.value == value,
          count: switch (choice.count) {
            final count? => countText(context, count),
            null => null,
          },
          onPressed: () => onChanged(choice.value),
        ),
    ],
  );
}

/// Any number of choices, each a chip that turns on and off. Past [limit]
/// choices a field finds the rest by name, and only the first [limit] that
/// match show, after those that are on.
class FilterToggleChips extends StatefulWidget {
  const FilterToggleChips({
    super.key,
    required this.choices,
    required this.value,
    required this.onChanged,
    this.limit,
    this.findPlaceholder,
    this.noMatch,
  });

  final List<FilterChoice> choices;
  final List<String> value;
  final ValueChanged<List<String>> onChanged;
  final int? limit;
  final String? findPlaceholder;
  final String? noMatch;

  @override
  State<FilterToggleChips> createState() => _FilterToggleChipsState();
}

class _FilterToggleChipsState extends State<FilterToggleChips> {
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
    final limit = widget.limit;
    final choices = widget.choices;
    final value = widget.value;
    final finding = limit != null && choices.length > limit;
    final query = _query.text.trim().toLowerCase();
    final List<FilterChoice> shown;
    if (finding) {
      final first = choices
          .where(
            (choice) =>
                query.isEmpty || choice.label.toLowerCase().contains(query),
          )
          .take(limit)
          .toList();
      shown = [
        for (final choice in choices)
          if (value.contains(choice.value) && !first.contains(choice)) choice,
        ...first,
      ];
    } else {
      shown = choices;
    }
    final colors = MatineeTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 10,
      children: [
        if (finding && widget.findPlaceholder != null)
          MatineeTextField(
            controller: _query,
            placeholder: widget.findPlaceholder,
            leading: Lucide.search,
            textInputAction: TextInputAction.search,
          ),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final choice in shown)
              ToggleChip(
                label: choice.label,
                checked: value.contains(choice.value),
                count: switch (choice.count) {
                  final count? => countText(context, count),
                  null => null,
                },
                onChanged: (on) => widget.onChanged([
                  for (final each in value)
                    if (each != choice.value) each,
                  if (on) choice.value,
                ]),
              ),
          ],
        ),
        if (shown.isEmpty && widget.noMatch != null)
          Text(
            widget.noMatch!,
            style: KitText.sm.style(color: colors.mutedForeground),
          ),
      ],
    );
  }
}

/// One kind's ratings as "up to" chips, Any first.
class _RatingChips extends StatelessWidget {
  const _RatingChips({
    required this.system,
    required this.filters,
    required this.onChanged,
  });

  final RatingSystem system;
  final ListFilters filters;
  final ValueChanged<ListFilters> onChanged;

  @override
  Widget build(BuildContext context) {
    final show = system.kind == TitleKind.show;
    final current = show ? filters.showRating : filters.movieRating;
    return FilterChoiceChips(
      anyLabel: AppLocalizations.of(context).webFiltersAny,
      choices: [
        for (final each in system.ratings)
          (value: each.rating, label: each.rating, count: null),
      ],
      value: current?.rating,
      onChanged: (rating) {
        final limit = rating == null
            ? null
            : (country: system.country, rating: rating);
        onChanged(
          show
              ? filters.copyWith(showRating: () => limit)
              : filters.copyWith(movieRating: () => limit),
        );
      },
    );
  }
}

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
