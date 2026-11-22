import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/layout.dart';
import '../../router.dart';
import 'discover.dart' show RailFailed;
import 'request_cards.dart';
import 'request_words.dart';
import 'requests_data.dart';
import 'requests_hub.dart';

/// Explore's first row, "Recent requests", as the web's `requests-rail.tsx`
/// and Seerr's: for whoever runs the queue, the latest of it in every state,
/// waiting first, each card with its state's actions; for anyone else their
/// own requests as `requests.mineLive` sends them, with Cancel. Which one
/// `discover.rails` names in `requests`. It follows its list even while
/// that's empty and shows only once there are cards, so the first request
/// appears without a reload. Both lists come from streams of their own, so
/// the row stays when the catalog's rows are down. The heading opens the
/// requests overview, or the person's own requests.

/// The row for [which], `"queue"` or `"mine"`, as `DiscoverRails.requests`
/// says. Nothing for anything else, as an older server's missing field.
class RequestsRail extends StatelessWidget {
  const RequestsRail({super.key, required this.which});

  final String? which;

  @override
  Widget build(BuildContext context) => switch (which) {
    DiscoverRequests.queue => const _QueueRequests(),
    DiscoverRequests.mine => const _OwnRequests(),
    _ => const SizedBox.shrink(),
  };
}

/// What `DiscoverRails.requests` names.
abstract final class DiscoverRequests {
  static const queue = 'queue';
  static const mine = 'mine';
}

/// The queue the hub streams for the whole app, in its lists' order, the
/// newest [recentRequests] of it. One answered leaves at once, and the row
/// with the last. The heading opens the overview.
class _QueueRequests extends ConsumerWidget {
  const _QueueRequests();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.watch(requestsProvider.select((state) => state.queue));
    final failed = ref.watch(
      requestsProvider.select((state) => state.queueFailed),
    );
    return _RequestsRow<QueuedRequest>(
      // Held ones are left out by the row.
      items: queue == null ? null : queueInOrder(queue),
      id: (entry) => entry.item.id,
      onSeeAll: () => context.push(Routes.requestQueue),
      error: failed && queue == null ? const _QueueDown() : null,
      onRetry: () => ref.read(requestsProvider.notifier).retryQueue(),
      card: (entry) => QueueCard(item: entry.item, state: entry.state),
    );
  }
}

/// Why the admin's row has no cards, for [RailFailed]'s words.
final class _QueueDown implements Exception {
  const _QueueDown();
}

/// The viewer's own requests, live from `requests.mineLive`, in its order,
/// each as the server says it stands. The heading opens My requests.
class _OwnRequests extends ConsumerWidget {
  const _OwnRequests();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mine = ref.watch(myLiveRequestsProvider);
    return _RequestsRow<RequestItem>(
      items: mine.value?.items,
      id: (item) => item.id,
      onSeeAll: () => context.push(Routes.requests()),
      error: mine.hasError && !mine.hasValue ? mine.error : null,
      onRetry: () => ref.invalidate(myLiveRequestsProvider),
      card: (item) => OwnRequestCard(item: item),
    );
  }
}

/// The frame both rows share: the heading, which opens the full list, and
/// the cards, or blank ones while [items] load (null), or the heading over
/// why with Try again; nothing once no card is left. What's held for Undo
/// is out of the row, which stays built under Explore as long as Discover
/// names it, so the toast's Undo outlives the last card.
class _RequestsRow<T> extends ConsumerWidget {
  const _RequestsRow({
    required this.items,
    required this.id,
    required this.onSeeAll,
    required this.error,
    required this.onRetry,
    required this.card,
  });

  final List<T>? items;
  final String Function(T item) id;
  final VoidCallback onSeeAll;
  final Object? error;
  final VoidCallback onRetry;
  final Widget Function(T item) card;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final title = l.requestsRecent;
    final width = requestCardWidth(MediaQuery.sizeOf(context));
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final error = this.error;
    final items = this.items;
    final Widget child;
    if (error != null) {
      child = RailFailed(title: title, error: error, onRetry: onRetry);
    } else if (items == null) {
      child = _RowSkeleton(title: title, width: width);
    } else {
      final shown = [
        for (final item in items)
          if (!held.contains(id(item))) item,
      ].take(recentRequests).toList();
      if (shown.isEmpty) return const SizedBox.shrink();
      child = Rail(
        title: title,
        onSeeAll: onSeeAll,
        seeAllLabel: l.commonSeeAll,
        itemWidth: width,
        itemHeight: null,
        itemCount: shown.length,
        itemBuilder: (context, index) => KeyedSubtree(
          key: ValueKey(id(shown[index])),
          child: card(shown[index]),
        ),
      );
    }
    return Padding(padding: const EdgeInsets.only(bottom: 24), child: child);
  }
}

/// The row while its list loads: the heading over three blank cards.
class _RowSkeleton extends StatelessWidget {
  const _RowSkeleton({required this.title, required this.width});

  final String title;
  final double width;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return Semantics(
      label: l.loadingInProgress,
      container: true,
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: CardMetrics.gutter,
              ),
              child: SectionTitle(title: title),
            ),
            const SizedBox(height: 12),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(
                horizontal: CardMetrics.gutter,
              ),
              child: Row(
                spacing: CardMetrics.gap,
                children: [
                  for (var i = 0; i < 3; i++)
                    Container(
                      width: width,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        borderRadius: const BorderRadius.all(
                          Radius.circular(KitRadius.xl),
                        ),
                        border: Border.all(color: colors.border),
                      ),
                      child: const Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: 12,
                        children: [
                          SkeletonBox(
                            width: requestPosterWidth,
                            height: requestPosterWidth * 1.5,
                          ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              spacing: 8,
                              children: [
                                SkeletonBox(width: 60, height: 12),
                                SkeletonBox(width: 150, height: 16),
                                SkeletonBox(width: 90, height: 16),
                                SkeletonBox(width: 110, height: 24),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
