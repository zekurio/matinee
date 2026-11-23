import 'package:flutter/widgets.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../library/filter_sheet.dart'
    show FilterSection, OptionRow, OptionSheet;
import 'request_words.dart';
import 'requests_data.dart';

/// The Filter button of a list of requests, as the libraries' and the
/// catalog's browse have it: the filter's sheet, and how many filters are
/// on.
class RequestFilterButton extends StatelessWidget {
  const RequestFilterButton({super.key, required this.filter});

  final ValueNotifier<RequestFilter> filter;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return ValueListenableBuilder(
      valueListenable: filter,
      builder: (context, value, _) {
        final active = value.count;
        return PageBarButton(
          icon: Lucide.listFilter,
          label: active > 0 ? l.browseFiltersOn(active) : l.webFiltersTitle,
          count: active,
          onPressed: () => _showRequestFilters(context, filter),
        );
      },
    );
  }
}

/// The filter in a sheet, each change applied at once: the states, any
/// number of them on, with the badges' words, and movies or shows. None on
/// lists everything.
void _showRequestFilters(
  BuildContext context,
  ValueNotifier<RequestFilter> filter,
) {
  final l = AppLocalizations.of(context);
  Sheet.show<void>(
    context,
    dismissLabel: l.browseCloseFilters,
    builder: (context) => ValueListenableBuilder(
      valueListenable: filter,
      builder: (context, value, _) => Sheet(
        title: l.webFiltersTitle,
        footer: Row(
          children: [
            if (!value.isEmpty)
              MatineeButton(
                look: ButtonLook.ghost,
                leading: Lucide.x,
                onPressed: () => filter.value = RequestFilter.none,
                child: Text(l.browseClearFilters),
              ),
            const Spacer(),
            MatineeButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(l.webRequestsFilterShow),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 24,
            children: [
              FilterSection(
                title: l.webRequestsFilterState,
                child: MultiSelect(
                  choices: [
                    for (final state in RequestState.all)
                      MultiSelectChoice(
                        value: state,
                        label: requestStateWord(state, l),
                      ),
                  ],
                  value: value.states,
                  onChanged: (states) =>
                      filter.value = value.withStates(states),
                  placeholder: l.webRequestsFilterState,
                  label: l.webRequestsFilterState,
                  removeLabel: l.multiSelectRemove,
                ),
              ),
              OptionRow(
                label: l.webRequestsFilterKind,
                value: switch (value.kind) {
                  TitleKind.movie => l.browseKindMovie,
                  TitleKind.show => l.browseKindShow,
                  _ => l.webFiltersAny,
                },
                onPressed: () async {
                  final picked = await OptionSheet.show(
                    context,
                    title: l.webRequestsFilterKind,
                    anyLabel: l.webFiltersAny,
                    choices: [
                      (
                        value: TitleKind.movie,
                        label: l.browseKindMovie,
                        count: null,
                      ),
                      (
                        value: TitleKind.show,
                        label: l.browseKindShow,
                        count: null,
                      ),
                    ],
                    value: value.kind,
                  );
                  if (picked == null) return;
                  filter.value = value.withKind(picked.value);
                },
              ),
            ],
          ),
        ),
      ),
    ),
  ).ignore();
}

/// The list's message when the filter keeps nothing, with Clear filters.
class NoRequestsMatch extends StatelessWidget {
  const NoRequestsMatch({super.key, required this.filter});

  final ValueNotifier<RequestFilter> filter;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return EmptyState(
      icon: Lucide.listFilter,
      title: l.webRequestsFilterNone,
      message: l.webRequestsFilterNoneHint,
      action: MatineeButton(
        look: ButtonLook.outline,
        onPressed: () => filter.value = RequestFilter.none,
        child: Text(l.browseClearFilters),
      ),
    );
  }
}
