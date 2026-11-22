import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/permissions.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import 'follow_window.dart';
import 'request_cards.dart';
import 'request_words.dart';
import 'requests_data.dart';
import 'requests_hub.dart';

/// The requests pages, one list each with the state on every card rather
/// than tabs of states. With [queue], for whoever runs the queue: everyone's
/// requests, live from the stream the whole app follows, waiting first,
/// then needs attention, on the way, and done, a page of Done at a time.
/// Anyone else, and the queue's runner from Home's row, gets their own
/// requests, what's still going first.
class RequestsScreen extends ConsumerWidget {
  const RequestsScreen({super.key, this.queue = false});

  final bool queue;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      queue && ref.watch(runsQueueProvider)
      ? const _QueuePage()
      : const _MinePage();
}

/// How far from the end of what's loaded the next page is asked for.
const _nearEnd = 8;

/// The gap between cards, across and down.
const _gap = 16.0;

/// Cards in rows: one column on a phone, two on a tablet upright, three
/// on its side, each row as tall as its tallest card, so the actions line
/// up along the foot.
class _CardRows extends StatelessWidget {
  const _CardRows({required this.itemCount, required this.itemBuilder});

  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;

  @override
  Widget build(BuildContext context) => SliverPadding(
    padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
    sliver: SliverLayoutBuilder(
      builder: (context, constraints) {
        final count = math.max(1, wideColumns(constraints.crossAxisExtent));
        return SliverList.builder(
          itemCount: (itemCount + count - 1) ~/ count,
          itemBuilder: (context, row) => Padding(
            padding: EdgeInsets.only(top: row == 0 ? 0 : _gap),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: _gap,
                children: [
                  for (var column = 0; column < count; column++)
                    Expanded(
                      child: row * count + column < itemCount
                          ? itemBuilder(context, row * count + column)
                          : const SizedBox.shrink(),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    ),
  );
}

/// A whole-page message in the middle of the room.
class _Middle extends StatelessWidget {
  const _Middle({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
      child: child,
    ),
  );
}

/// The end of a list while more of it comes: a spinner, or why the next
/// page didn't come, with Try again.
class _More extends StatelessWidget {
  const _More({required this.error, required this.onRetry});

  final Object? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Center(
        child: error == null
            ? const Spinner(size: 24)
            : ErrorState(
                title: l.listMoreFailed,
                retryLabel: l.commonRetry,
                onRetry: onRetry,
              ),
      ),
    );
  }
}

/// Asks for [more] after this frame when [index] is near the end of
/// [count], as a lazy list builds its last cards, or at once for an empty
/// list that has more.
void _askNearEnd(
  BuildContext context,
  int index,
  int count,
  VoidCallback more,
) {
  if (index < count - _nearEnd) return;
  WidgetsBinding.instance.addPostFrameCallback((_) {
    if (context.mounted) more();
  });
}

/// Room under the last card for the system's bar.
Widget _bottom(BuildContext context) => SliverToBoxAdapter(
  child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 32),
);

// The overview.

class _QueuePage extends ConsumerWidget {
  const _QueuePage();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final queue = ref.watch(requestsProvider.select((state) => state.queue));
    final failed = ref.watch(
      requestsProvider.select((state) => state.queueFailed),
    );
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final Widget body;
    if (queue == null) {
      body = failed
          ? _Middle(
              child: FailureState(
                title: l.requestsLoadFailed,
                error: const _QueueDown(),
                onRetry: () => ref.read(requestsProvider.notifier).retryQueue(),
              ),
            )
          : Center(child: LoadingState(label: l.loadingInProgress));
    } else {
      body = _QueueList(queue: queue, held: held);
    }
    return PageFrame(
      title: l.webRequestsTitle,
      onBack: () => context.pop(),
      backLabel: l.commonBack,
      child: body,
    );
  }
}

/// Why the overview has no queue, for [FailureState]'s words.
final class _QueueDown implements Exception {
  const _QueueDown();
}

/// The queue as one list: a line of what's in it, Add all while more than
/// one waits, then the cards in the server's order of its lists, Done
/// read on past what the live queue holds as its end shows.
class _QueueList extends ConsumerWidget {
  const _QueueList({required this.queue, required this.held});

  final RequestQueue queue;
  final Set<String> held;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    // The live queue holds the newest of Done; the rest comes a page at a
    // time, only when there is more.
    final liveIsAll = queue.nextCursor == null;
    final pages = liveIsAll ? null : ref.watch(doneRequestsProvider);
    final done = doneInOrder(
      queue.done,
      liveIsAll: liveIsAll,
      paged: pages?.items ?? const [],
      pagedDone: pages?.done ?? true,
    );
    final entries = queueInOrder(queue, held: held, done: done.items);
    final waiting = [
      for (final entry in entries)
        if (entry.state == RequestState.waiting) entry.item,
    ];
    int left(List<AdminRequestItem> list) =>
        list.where((item) => !held.contains(item.id)).length;
    final counts = [
      if (waiting.isNotEmpty) l.requestsCountWaiting(waiting.length),
      if (left(queue.needsAttention) case final n when n > 0)
        l.requestsCountNeedsAttention(n),
      if (left(queue.onTheWay) case final n when n > 0)
        l.requestsCountOnTheWay(n),
      if (queue.counts.done > 0) l.requestsCountDone(queue.counts.done),
    ];
    final notifier = pages == null
        ? null
        : ref.read(doneRequestsProvider.notifier);
    // Nothing to build that would ask for Done's next page.
    if (entries.isEmpty && done.more && notifier != null) {
      _askNearEnd(context, 0, 0, notifier.more);
    }
    if (entries.isEmpty && !done.more) {
      return _Middle(
        child: EmptyState(
          icon: Lucide.inbox,
          title: l.requestsOverviewEmpty,
          message: l.requestsOverviewEmptyHint,
        ),
      );
    }
    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            CardMetrics.gutter,
            0,
            CardMetrics.gutter,
            16,
          ),
          sliver: SliverToBoxAdapter(
            child: Row(
              spacing: 12,
              children: [
                Expanded(
                  child: Text(
                    counts.join(' · '),
                    style: KitText.sm.style(color: colors.mutedForeground),
                  ),
                ),
                if (waiting.length > 1)
                  MatineeButton(
                    look: ButtonLook.outline,
                    size: ButtonSize.sm,
                    leading: Lucide.listChecks,
                    onPressed: () => unawaited(
                      ref.read(requestsProvider.notifier).answerAll(l, waiting),
                    ),
                    child: Text(l.webRequestsAddAll(waiting.length)),
                  ),
              ],
            ),
          ),
        ),
        _CardRows(
          itemCount: entries.length,
          itemBuilder: (context, index) {
            if (done.more && notifier != null) {
              _askNearEnd(context, index, entries.length, notifier.more);
            }
            final entry = entries[index];
            return QueueCard(
              key: ValueKey(entry.item.id),
              item: entry.item,
              state: entry.state,
              // Done's pages keep what they read, so an answered request
              // leaves them here.
              onAnswered: notifier == null
                  ? null
                  : (item) => notifier.drop(item.id),
            );
          },
        ),
        if (done.more && notifier != null)
          SliverToBoxAdapter(
            child: _More(error: pages?.error, onRetry: notifier.retry),
          ),
        _bottom(context),
      ],
    );
  }
}

// A person's own requests.

class _MinePage extends ConsumerStatefulWidget {
  const _MinePage();

  @override
  ConsumerState<_MinePage> createState() => _MinePageState();
}

class _MinePageState extends ConsumerState<_MinePage> {
  /// The cards built now, which pick the ones the live stream follows:
  /// a long list holds more than one stream takes.
  final _shown = FollowWindow();

  /// The pages last loaded, shown while an ask, a cancel, or an answer
  /// reads them again, so the list doesn't blink to a spinner.
  CursorPages<RequestItem>? _lastGoing;
  CursorPages<RequestItem>? _lastAll;

  @override
  void dispose() {
    _shown.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final goingProvider = myRequestsProvider(MineFilter.inProgress);
    final allProvider = myRequestsProvider(MineFilter.all);
    var going = ref.watch(goingProvider);
    var all = ref.watch(allProvider);
    if (going.loaded) {
      _lastGoing = going;
    } else if (going.error == null) {
      going = _lastGoing ?? going;
    }
    if (all.loaded) {
      _lastAll = all;
    } else if (all.error == null) {
      all = _lastAll ?? all;
    }
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final Widget body;
    if (!going.loaded) {
      final error = going.error;
      body = error != null
          ? _Middle(
              child: FailureState(
                title: l.askedLoadFailed,
                error: error,
                onRetry: () => ref.read(goingProvider.notifier).retry(),
              ),
            )
          : Center(child: LoadingState(label: l.loadingInProgress));
    } else {
      // What's still going, from the server's list of those in progress,
      // which also has what settled lately; then everything else, newest
      // first, from the whole list.
      final still = [
        for (final item in going.items)
          if (!held.contains(item.id) &&
              !(ownState(item.season?.asTitle() ?? item.availability)
                      ?.finished ??
                  false))
            item,
      ];
      final first = {for (final item in still) item.id};
      final items = [
        ...still,
        if (going.done)
          for (final item in all.items)
            if (!held.contains(item.id) && !first.contains(item.id)) item,
      ];
      final (pages, notifier) = going.done
          ? (all, ref.read(allProvider.notifier))
          : (going, ref.read(goingProvider.notifier));
      final more = !pages.done;
      if (items.isEmpty && !more) {
        body = _Middle(
          child: EmptyState(
            icon: Lucide.clock,
            title: l.webAskMineEmpty,
            message: l.webAskMineEmptyHint,
          ),
        );
      } else {
        body = ListenableBuilder(
          listenable: _shown,
          builder: (context, child) => FollowTitles(
            titles: FollowedTitles([
              for (final item in _shown.slice(items))
                CatalogInput(ref: item.title.ref, libraryId: item.library.id),
            ]),
            child: child!,
          ),
          child: CustomScrollView(
            slivers: [
              _CardRows(
                itemCount: items.length,
                itemBuilder: (context, index) {
                  if (more) {
                    _askNearEnd(context, index, items.length, notifier.more);
                  }
                  final item = items[index];
                  return FollowedCard(
                    key: ValueKey(item.id),
                    window: _shown,
                    index: index,
                    child: OwnRequestCard(item: item, live: true),
                  );
                },
              ),
              if (more)
                SliverToBoxAdapter(
                  child: _More(error: pages.error, onRetry: notifier.retry),
                ),
              _bottom(context),
            ],
          ),
        );
      }
    }
    return PageFrame(
      title: l.webAskMineTitle,
      onBack: () => context.pop(),
      backLabel: l.commonBack,
      child: body,
    );
  }
}
