import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/cards.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import 'filter_sheet.dart';
import 'list_choices.dart';
import 'list_words.dart';
import 'title_pages.dart';

/// Posters in as many columns as the width has room for, two on a phone,
/// under what [header] builds, loading the next page as the end comes
/// near: the Kotlin app's `PosterGrid`. While other choices load, the
/// titles from before stay, dimmed, as the web keeps them, so the page
/// doesn't jump to blank and back.
class TitleGrid extends ConsumerStatefulWidget {
  const TitleGrid({
    super.key,
    required this.request,
    required this.header,
    required this.empty,
    this.controller,
  });

  final TitleListRequest request;

  /// What heads the grid, as slivers, from the titles it shows.
  final List<Widget> Function(BuildContext context, TitlePagesState shown)
  header;

  /// What it says when nothing matches.
  final Widget empty;
  final ScrollController? controller;

  /// Load the next page once a card this close to the end is built.
  static const _nearEnd = 12;

  @override
  ConsumerState<TitleGrid> createState() => _TitleGridState();
}

class _TitleGridState extends ConsumerState<TitleGrid> {
  /// The last list that had an answer, shown while other choices load.
  TitlePagesState? _last;
  bool _askedMore = false;

  void _more() {
    if (_askedMore) return;
    _askedMore = true;
    // Not while building: asking changes the provider's state.
    SchedulerBinding.instance.addPostFrameCallback((_) {
      _askedMore = false;
      if (mounted) ref.read(titlePagesProvider(widget.request).notifier).more();
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final request = widget.request;
    final pages = ref.watch(titlePagesProvider(request));
    final waiting = pages.total == null && pages.loading;
    final last = _last;
    final dimmed = waiting && last != null;
    final shown = dimmed ? last : pages;
    if (pages.total != null) _last = pages;
    void retry() => ref.read(titlePagesProvider(request).notifier).retry();

    final items = shown.items;
    final Widget body;
    if (waiting && !dimmed) {
      body = const _SkeletonGrid();
    } else if (shown.error case final error? when items.isEmpty) {
      body = SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 48),
            child: FailureState(
              title: l.gridLoadFailed,
              error: error,
              onRetry: retry,
            ),
          ),
        ),
      );
    } else if (items.isEmpty) {
      body = SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 48),
            child: widget.empty,
          ),
        ),
      );
    } else {
      body = SliverOpacity(
        opacity: dimmed ? .5 : 1,
        sliver: CardGrid(
          columns: posterColumns,
          aspectRatio: CardMetrics.poster,
          itemCount: items.length,
          itemBuilder: (context, index) {
            if (!dimmed && index >= items.length - TitleGrid._nearEnd) {
              _more();
            }
            final title = items[index];
            return TitleCard.withDetail(
              title: title,
              detail: cardDetail(context, title, request.sort),
            );
          },
        ),
      );
    }

    return CustomScrollView(
      controller: widget.controller,
      slivers: [
        ...widget.header(context, shown),
        body,
        if (!dimmed && items.isNotEmpty)
          SliverToBoxAdapter(
            child: switch (shown) {
              TitlePagesState(:final error?) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: FailureState(
                  title: l.gridMoreFailed,
                  error: error,
                  onRetry: retry,
                ),
              ),
              TitlePagesState(loading: true) => Padding(
                padding: const EdgeInsets.all(24),
                child: LoadingState(label: l.loadingInProgress),
              ),
              _ => const SizedBox.shrink(),
            },
          ),
        SliverToBoxAdapter(
          child: SizedBox(height: 24 + MediaQuery.paddingOf(context).bottom),
        ),
      ],
    );
  }
}

/// Blank posters where the first page is coming.
class _SkeletonGrid extends StatelessWidget {
  const _SkeletonGrid();

  @override
  Widget build(BuildContext context) {
    final label = AppLocalizations.of(context).loadingInProgress;
    return SliverSemantics(
      label: label,
      sliver: CardGrid(
        columns: posterColumns,
        aspectRatio: CardMetrics.poster,
        itemCount: 12,
        itemBuilder: (context, index) => const AspectRatio(
          aspectRatio: CardMetrics.poster,
          child: SkeletonBox(radius: KitRadius.sm),
        ),
      ),
    );
  }
}

/// The filters in use as a row of chips that take themselves off, with
/// Clear all once there are two, across the page under its heading.
class ActiveFilterRow extends StatelessWidget {
  const ActiveFilterRow({
    super.key,
    required this.chips,
    required this.onClear,
  });

  final List<ActiveFilter> chips;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
        children: [
          for (final chip in chips)
            Padding(
              key: ValueKey(chip.key),
              padding: const EdgeInsetsDirectional.only(end: 6),
              child: RemovableChip(
                label: chip.label,
                removeLabel: l.browseRemoveFilter(chip.label),
                onRemove: chip.remove,
              ),
            ),
          if (chips.length > 1)
            Center(
              child: MatineeButton(
                look: ButtonLook.ghost,
                size: ButtonSize.sm,
                onPressed: onClear,
                child: Text(l.browseClearAll),
              ),
            ),
        ],
      ),
    );
  }
}

/// An icon to press at the end of a list's heading, 48 square, in the
/// accent while what it stands for is on.
class ListBarButton extends StatelessWidget {
  const ListBarButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.active = false,
    this.focusNode,
  });

  final String icon;
  final String label;
  final VoidCallback? onPressed;
  final bool active;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      label: label,
      focusNode: focusNode,
      shape: KitRadius.pill,
      builder: (context, state) => SizedBox.square(
        dimension: 48,
        child: Center(
          child: KitIcon(
            icon,
            size: 22,
            color: active
                ? colors.accent
                : state == PressState.pressed
                ? colors.mutedForeground
                : colors.foreground,
          ),
        ),
      ),
    );
  }
}

/// The Filter button, once the server says what the filters offer.
class FilterButton extends ConsumerWidget {
  const FilterButton({
    super.key,
    required this.list,
    required this.scope,
    required this.kind,
  });

  final ListKey list;
  final FilterScope scope;

  /// Every title's kind when they're all one.
  final String? kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    if (!ref.watch(filterOptionsProvider(scope)).hasValue) {
      return const SizedBox.shrink();
    }
    final active = ref.watch(choicesProvider(list)).filters.count;
    return ListBarButton(
      icon: Lucide.listFilter,
      label: active > 0 ? l.browseFiltersOn(active) : l.webFiltersTitle,
      active: active > 0,
      onPressed: () =>
          showTitleFilters(context, list: list, scope: scope, kind: kind),
    );
  }
}

/// The sort, in a menu: each sort the list has values for, both ways.
class SortButton extends ConsumerWidget {
  const SortButton({
    super.key,
    required this.list,
    required this.current,
    required this.offered,
  });

  final ListKey list;
  final TitleOrder current;

  /// The sorts the server has something to order by, once it says.
  final List<String>? offered;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final offered = this.offered;
    return Menu(
      // The last of the heading's buttons, at its end.
      side: MenuSide.end,
      trigger: (context, toggle, open, focusNode) => ListBarButton(
        icon: Lucide.arrowUpDown,
        label: l.browseSortCurrent(current.label(l)),
        focusNode: focusNode,
        onPressed: toggle,
      ),
      children: [
        for (final order in titleOrders)
          if (offered == null || offered.contains(order.sort))
            MenuItem(
              label: order.label(l),
              selected:
                  order.sort == current.sort && order.order == current.order,
              onPressed: () =>
                  ref.read(choicesProvider(list).notifier).order(order),
            ),
      ],
    );
  }
}

/// Every library of the kind, or one, as a menu behind the chosen one's
/// name, as the web has it in the page's subtitle.
class LibraryMenu extends StatelessWidget {
  const LibraryMenu({
    super.key,
    required this.libraries,
    required this.value,
    required this.onChanged,
  });

  final List<Library> libraries;
  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final current = libraries.where((library) => library.id == value);
    final name = current.isEmpty ? l.browseLibraryAll : current.first.name;
    return Menu(
      trigger: (context, toggle, open, focusNode) => PressIndication(
        onPressed: toggle,
        focusNode: focusNode,
        label: '${l.browseLibrary}: $name',
        shape: KitRadius.control,
        builder: (context, state) => ConstrainedBox(
          // A finger's height, without moving the text.
          constraints: const BoxConstraints(minHeight: 40),
          child: ExcludeSemantics(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              spacing: 2,
              children: [
                Flexible(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.sm.style(
                      color: state == PressState.idle && !open
                          ? colors.foreground.withValues(alpha: .85)
                          : colors.foreground,
                      weight: FontWeight.w500,
                    ),
                  ),
                ),
                KitIcon(Lucide.chevronDown, size: 14, color: colors.foreground),
              ],
            ),
          ),
        ),
      ),
      children: [
        MenuLabel(l.browseLibrary),
        MenuItem(
          label: l.browseLibraryAll,
          selected: current.isEmpty,
          onPressed: () => onChanged(null),
        ),
        for (final library in libraries)
          MenuItem(
            label: library.name,
            selected: library.id == value,
            onPressed: () => onChanged(library.id),
          ),
      ],
    );
  }
}
