import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/cards.dart';
import '../../media/layout.dart';
import '../../router.dart';
import 'catalog_browse.dart' show browseDetail;
import 'catalog_cards.dart';
import 'request_sheet.dart';
import 'request_words.dart';
import 'requests_data.dart';
import 'requests_hub.dart';

/// Explore, for when there's nothing in mind yet, as the Kotlin app's
/// `Discover.kt` under its search field: rows of titles under the empty
/// field, in the order the server sends them, each loading on its own.
/// Each row but "Because you watched" is the start of a browse, which its
/// heading opens with the row's filters and sort. Nothing of it shows when
/// the server says Discover is off.

/// How many cards a row shows. Its heading leads to the rest.
const _railCards = 20;

/// "Popular movies", or "Because you watched Dune".
String railName(DiscoverRail rail, AppLocalizations l) => switch (rail.id) {
  DiscoverRailId.popularFilms => l.webDiscoverRailPopularFilms,
  DiscoverRailId.popularShows => l.webDiscoverRailPopularShows,
  DiscoverRailId.forYou => l.webDiscoverRailForYou,
  DiscoverRailId.becauseWatched => l.webDiscoverRailBecauseWatched(
    rail.seed?.name ?? '',
  ),
  _ => l.webDiscoverRailComingSoon,
};

/// Whether the row holds the viewer's recommendations, whose cards offer
/// "Not interested".
bool _recommended(DiscoverRail rail) =>
    rail.id == DiscoverRailId.forYou ||
    rail.id == DiscoverRailId.becauseWatched;

/// The rows' cards, without the recommendations this sitting hid.
List<CatalogBrowseTitle> _shown(
  DiscoverRail rail,
  DiscoverRow row,
  Set<String> hidden,
) => [
  for (final item in row.items)
    if (!_recommended(rail) || !hidden.contains(refKey(item.ref))) item,
].take(_railCards).toList();

/// Under the empty search field: [leading], then Discover's rows when the
/// server has Discover on, or why there are none. [leading] is what heads
/// Explore, an admin's way to the requests that wait on them for now; a
/// row of request cards goes there too, before the rows, once the server
/// sends them.
class Explore extends ConsumerWidget {
  const Explore({super.key, this.leading = const []});

  /// Slivers before the rows.
  final List<Widget> leading;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final discover = ref.watch(discoverRailsProvider);
    final rails = discover.value?.enabled == true
        ? discover.value!.rails
        : const <DiscoverRail>[];
    final rows = {
      for (final rail in rails)
        railKey(rail): ref.watch(discoverRowProvider(RowKey(rail))),
    };
    final hidden = ref.watch(hiddenRecommendationsProvider);
    final failed = [
      for (final rail in rails)
        if (rows[railKey(rail)]!.hasError && !rows[railKey(rail)]!.isLoading)
          rail,
    ];
    void retryAll() {
      ref.invalidate(discoverRailsProvider);
      for (final rail in rails) {
        ref.invalidate(discoverRowProvider(RowKey(rail)));
      }
    }

    final List<Widget> body;
    if (discover.hasError && !discover.isLoading && !discover.hasValue) {
      body = [_Message(child: _DiscoverFailed(onRetry: retryAll))];
    } else if (rails.isNotEmpty && failed.length == rails.length) {
      body = [_Message(child: _DiscoverFailed(onRetry: retryAll))];
    } else if (rails.isNotEmpty &&
        rails.every(
          (rail) => switch (rows[railKey(rail)]!.value) {
            final row? => _shown(rail, row, hidden).isEmpty,
            null => false,
          },
        )) {
      body = [
        _Message(
          child: EmptyState(
            icon: Lucide.compass,
            title: l.webDiscoverEmpty,
            message: l.webDiscoverEmptyHint,
          ),
        ),
      ];
    } else {
      final stale = rows.values.any((row) => row.value?.stale ?? false);
      // Several rows that failed say so once, rather than as a stack of
      // empty boxes.
      final many = failed.length > 1;
      body = [
        if (stale)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                CardMetrics.gutter,
                0,
                CardMetrics.gutter,
                24,
              ),
              child: Text(
                l.webDiscoverStale,
                style: KitText.sm.style(
                  color: MatineeTheme.of(context).mutedForeground,
                ),
              ),
            ),
          ),
        if (many)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: ErrorState(
                title: l.webDiscoverRailsFailed(failed.length),
                retryLabel: l.commonRetry,
                onRetry: () {
                  for (final rail in failed) {
                    ref.invalidate(discoverRowProvider(RowKey(rail)));
                  }
                },
              ),
            ),
          ),
        for (final rail in rails)
          if (!many || !failed.contains(rail))
            SliverToBoxAdapter(child: _DiscoverRow(rail: rail)),
      ];
    }
    // Library cards play; only the rest can change.
    final followed = FollowedTitles([
      for (final rail in rails)
        if (rows[railKey(rail)]!.value case final row?)
          for (final item in _shown(rail, row, hidden))
            if (item.title == null) CatalogInput(ref: item.ref),
    ]);
    return FollowTitles(
      titles: followed,
      child: CustomScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        slivers: [
          const SliverToBoxAdapter(child: SizedBox(height: 8)),
          ...leading,
          ...body,
          SliverToBoxAdapter(
            child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 24),
          ),
        ],
      ),
    );
  }
}

/// A whole-list message, in the middle of the room under the field.
class _Message extends StatelessWidget {
  const _Message({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => SliverToBoxAdapter(
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Center(child: child),
    ),
  );
}

/// Discover's whole answer couldn't be had: the catalog is down and
/// nothing was kept.
class _DiscoverFailed extends StatelessWidget {
  const _DiscoverFailed({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return ErrorState(
      icon: Lucide.cloudOff,
      title: l.discoverFailed,
      message: l.webDiscoverFailedHint,
      retryLabel: l.commonRetry,
      onRetry: onRetry,
    );
  }
}

/// One row: blank cards while it loads, a line with Try again when it
/// failed, nothing when every title in it is here already, else its cards
/// under a heading that opens its browse.
class _DiscoverRow extends ConsumerWidget {
  const _DiscoverRow({required this.rail});

  final DiscoverRail rail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final title = railName(rail, l);
    final key = RowKey(rail);
    final row = ref.watch(discoverRowProvider(key));
    final size = railCardSize(context, RailArt.poster);
    final Widget child;
    if (row.value case final value?) {
      final items = _shown(
        rail,
        value,
        ref.watch(hiddenRecommendationsProvider),
      );
      if (items.isEmpty) return const SizedBox.shrink();
      // The heading opens the row's browse, of its first kind, as the
      // web's does. A row without one has none.
      final browse = rail.browse;
      // A row of one kind says only the year; one that holds both, or
      // a recommendation's without a browse, names each card's kind.
      child = NamedKinds(
        named: browse == null || browse.kinds.length > 1,
        child: Rail(
          title: title,
          itemWidth: size.width,
          itemHeight: size.height,
          itemCount: items.length,
          onSeeAll: browse == null
              ? null
              : () => context.push(
                  Routes.catalogBrowse(
                    browse.kinds.firstOrNull ?? TitleKind.movie,
                    filters: jsonEncode(browse.filters.toJson()),
                    sort: browse.sort,
                  ),
                ),
          seeAllLabel: l.commonSeeAll,
          itemBuilder: (context, index) {
            final item = items[index];
            return CatalogTitleCard.browse(
              item,
              // Without a date or a score to say, the year, and the kind
              // where the row can hold both.
              detail: value.detail == null
                  ? null
                  : browseDetail(context, value.detail, item),
              recommended: _recommended(rail),
            );
          },
        ),
      );
    } else if (row.hasError && !row.isLoading) {
      child = RailFailed(
        title: title,
        error: row.error!,
        onRetry: () => ref.invalidate(discoverRowProvider(key)),
      );
    } else {
      child = RailSkeleton(
        label: l.loadingInProgress,
        title: title,
        itemWidth: size.width,
        aspectRatio: CardMetrics.poster,
      );
    }
    return Padding(padding: const EdgeInsets.only(bottom: 24), child: child);
  }
}

/// A row that didn't load, in its place: its heading over why, with Try
/// again.
class RailFailed extends StatelessWidget {
  const RailFailed({
    super.key,
    required this.title,
    required this.error,
    required this.onRetry,
  });

  final String title;
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 8,
        children: [
          SectionTitle(title: title),
          Row(
            spacing: 12,
            children: [
              Expanded(
                child: Text(
                  l.webDiscoverRailFailed,
                  style: KitText.sm.style(color: colors.mutedForeground),
                ),
              ),
              MatineeButton(
                look: ButtonLook.outline,
                size: ButtonSize.sm,
                onPressed: onRetry,
                child: Text(l.commonRetry),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// For an admin, the way to the requests, with how many need them; where
/// the row of request cards goes once the server sends it.
class RequestsLink extends ConsumerWidget {
  const RequestsLink({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final needsYou = ref.watch(
      requestsProvider.select((state) => state.needsYou),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        CardMetrics.gutter - 8,
        0,
        CardMetrics.gutter - 8,
        16,
      ),
      child: PressIndication(
        onPressed: () => context.push(Routes.requests(QueueList.waiting)),
        label: needsYou > 0
            ? l.webRequestsMenuWaiting(needsYou)
            : l.webRequestsTitle,
        shape: KitRadius.control,
        builder: (context, state) => ExcludeSemantics(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: KitRadius.control,
              color: colors.foreground.withValues(
                alpha: state == PressState.idle ? 0 : .06,
              ),
            ),
            child: Row(
              spacing: 12,
              children: [
                KitIcon(Lucide.inbox, color: colors.mutedForeground),
                Expanded(
                  child: Text(
                    l.webRequestsTitle,
                    style: KitText.base.style(
                      color: colors.foreground,
                      weight: FontWeight.w500,
                    ),
                  ),
                ),
                if (needsYou > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 1,
                    ),
                    decoration: BoxDecoration(
                      color: colors.accent,
                      borderRadius: KitRadius.pill,
                    ),
                    child: Text(
                      formatCount(needsYou, l),
                      style: KitText.xs.style(
                        color: colors.accentForeground,
                        weight: FontWeight.w600,
                      ),
                    ),
                  ),
                KitIcon(Lucide.chevronRight, color: colors.mutedForeground),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The admin's lists, by the names their routes take.
abstract final class QueueList {
  static const waiting = 'waiting';
  static const needsAttention = 'needsAttention';
  static const onTheWay = 'onTheWay';
  static const done = 'done';

  static const all = [waiting, needsAttention, onTheWay, done];
}
