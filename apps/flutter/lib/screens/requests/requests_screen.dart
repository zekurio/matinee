import 'dart:async';

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
import 'request_filter.dart';
import 'request_words.dart';
import 'requests_data.dart';
import 'requests_hub.dart';

/// The requests pages, one list each with the state on every card rather
/// than tabs of states. With [queue], for whoever runs the queue: everyone's
/// requests, live from the stream the whole app follows, waiting first,
/// then needs attention, on the way, and done, a page of Done at a time.
/// Anyone else, and the queue's runner from Home's row, gets their own
/// requests in the server's order, in progress first, then finished. Each
/// has a Filter of states and kinds, which the server keeps to; it lasts
/// as long as the page.
class RequestsScreen extends ConsumerWidget {
  const RequestsScreen({super.key, this.queue = false});

  final bool queue;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      queue && ref.watch(canProvider(Permission.adminRequestRead))
      ? const _QueuePage()
      : const _MinePage();
}

/// How far from the end of what's loaded the next page is asked for.
const _nearEnd = 8;

/// The gap between cards, across and down.
const _gap = 16.0;

/// Cards in rows: as many as the web's request grid fits at its least width,
/// each filling its share, one on a phone and up to four across a big
/// tablet. Every card of a list is as tall as the next, its poster setting
/// it.
class _CardRows extends StatelessWidget {
  const _CardRows({required this.itemCount, required this.itemBuilder});

  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;

  @override
  Widget build(BuildContext context) => SliverPadding(
    padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
    sliver: SliverLayoutBuilder(
      builder: (context, constraints) {
        final count = requestColumns(constraints.crossAxisExtent);
        return SliverList.builder(
          itemCount: (itemCount + count - 1) ~/ count,
          itemBuilder: (context, row) => Padding(
            padding: EdgeInsets.only(top: row == 0 ? 0 : _gap),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
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

class _QueuePage extends ConsumerStatefulWidget {
  const _QueuePage();

  @override
  ConsumerState<_QueuePage> createState() => _QueuePageState();
}

class _QueuePageState extends ConsumerState<_QueuePage> {
  final _filter = ValueNotifier(RequestFilter.none);

  @override
  void initState() {
    super.initState();
    _filter.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _filter.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final filter = _filter.value;
    final held = ref.watch(requestsProvider.select((state) => state.held));
    // With no filter on, the queue the whole app follows; under one, its
    // own stream, which the server keeps to the filter.
    final RequestQueue? queue;
    final bool failed;
    final VoidCallback retry;
    if (filter.isEmpty) {
      queue = ref.watch(requestsProvider.select((state) => state.queue));
      failed = ref.watch(requestsProvider.select((state) => state.queueFailed));
      retry = () => ref.read(requestsProvider.notifier).retryQueue();
    } else {
      final live = ref.watch(filteredQueueProvider(filter));
      queue = live.value;
      failed = live.hasError;
      retry = () => ref.invalidate(filteredQueueProvider(filter));
    }
    // Add all acts on the waiting ones the filter shows.
    final waiting = [
      for (final item in queue?.waiting ?? const <AdminRequestItem>[])
        if (!held.contains(item.id)) item,
    ];
    final Widget body;
    if (queue == null) {
      body = failed
          ? _Middle(
              child: FailureState(
                title: l.requestsLoadFailed,
                error: const _QueueDown(),
                onRetry: retry,
              ),
            )
          : Center(child: LoadingState(label: l.loadingInProgress));
    } else {
      body = _QueueList(
        key: ValueKey(filter),
        queue: queue,
        held: held,
        filter: _filter,
      );
    }
    return PageFrame(
      title: l.webRequestsTitle,
      onBack: () => context.pop(),
      backLabel: l.commonBack,
      actions: [
        RequestFilterButton(filter: _filter),
        if (waiting.length > 1 &&
            ref.watch(canProvider(Permission.adminRequestApprove)))
          // The bar's end is set for icons; a button with words keeps
          // the gutter the back button has at the start.
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 4, end: 12),
            child: MatineeButton(
              look: ButtonLook.outline,
              size: ButtonSize.sm,
              leading: Lucide.listChecks,
              onPressed: () => unawaited(
                ref.read(requestsProvider.notifier).answerAll(l, waiting),
              ),
              child: Text(l.webRequestsAddAll(waiting.length)),
            ),
          ),
      ],
      child: body,
    );
  }
}

/// Why the overview has no queue, for [FailureState]'s words.
final class _QueueDown implements Exception {
  const _QueueDown();
}

/// The queue as one list, under the page's filter: the cards in the
/// server's order of its lists, each in the state the server gave it, Done
/// read on past what the live queue holds as its end shows.
class _QueueList extends ConsumerWidget {
  const _QueueList({
    super.key,
    required this.queue,
    required this.held,
    required this.filter,
  });

  final RequestQueue queue;
  final Set<String> held;
  final ValueNotifier<RequestFilter> filter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    // The live queue holds the newest of Done; the rest comes a page at a
    // time, only when there is more.
    final liveIsAll = queue.nextCursor == null;
    final provider = doneRequestsProvider(filter.value);
    final pages = liveIsAll ? null : ref.watch(provider);
    final done = doneInOrder(
      queue.done,
      liveIsAll: liveIsAll,
      paged: pages?.items ?? const [],
      pagedDone: pages?.done ?? true,
    );
    final entries = queueInOrder(queue, held: held, done: done.items);
    final notifier = pages == null ? null : ref.read(provider.notifier);
    // Nothing to build that would ask for Done's next page.
    if (entries.isEmpty && done.more && notifier != null) {
      _askNearEnd(context, 0, 0, notifier.more);
    }
    if (entries.isEmpty && !done.more) {
      return _Middle(
        child: filter.value.isEmpty
            ? EmptyState(
                icon: Lucide.inbox,
                title: l.webRequestsEmptyNone,
                message: l.webRequestsEmptyNoneHint,
              )
            : NoRequestsMatch(filter: filter),
      );
    }
    return CustomScrollView(
      slivers: [
        _CardRows(
          itemCount: entries.length,
          itemBuilder: (context, index) {
            if (done.more && notifier != null) {
              _askNearEnd(context, index, entries.length, notifier.more);
            }
            final item = entries[index];
            return QueueCard(
              key: ValueKey(item.id),
              item: item,
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

  /// Whether the end of the live page came near, which reads the older
  /// pages after it.
  var _older = false;

  /// What the list is kept to; a change starts it over.
  final _filter = ValueNotifier(RequestFilter.none);

  @override
  void initState() {
    super.initState();
    _filter.addListener(() => setState(() => _older = false));
  }

  @override
  void dispose() {
    _shown.dispose();
    _filter.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final filter = _filter.value;
    final firstProvider = filter.isEmpty
        ? myLiveRequestsProvider
        : myFilteredRequestsProvider(filter);
    final first = ref.watch(firstProvider);
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final page = first.value;
    final Widget body;
    if (page == null) {
      final error = first.error;
      body = error != null
          ? _Middle(
              child: FailureState(
                title: l.askedLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(firstProvider),
              ),
            )
          : Center(child: LoadingState(label: l.loadingInProgress));
    } else {
      // The server's list in its order: the live first page, then the
      // pages after it.
      final after = page.nextCursor;
      final olderProvider = after == null || !_older
          ? null
          : olderRequestsProvider((after: after, filter: filter));
      final older = olderProvider == null ? null : ref.watch(olderProvider);
      final seen = {for (final item in page.items) item.id};
      final items = [
        for (final item in page.items)
          if (!held.contains(item.id)) item,
        for (final item in older?.items ?? const <RequestItem>[])
          if (!held.contains(item.id) && !seen.contains(item.id)) item,
      ];
      final more = after != null && !(older?.done ?? false);
      void readMore() {
        if (olderProvider == null) {
          setState(() => _older = true);
        } else {
          ref.read(olderProvider.notifier).more();
        }
      }

      if (items.isEmpty && more) _askNearEnd(context, 0, 0, readMore);
      if (items.isEmpty && !more) {
        body = _Middle(
          child: filter.isEmpty
              ? EmptyState(
                  icon: Lucide.clock,
                  title: l.webAskMineEmpty,
                  message: l.webAskMineEmptyHint,
                )
              : NoRequestsMatch(filter: _filter),
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
            key: ValueKey(filter),
            slivers: [
              _CardRows(
                itemCount: items.length,
                itemBuilder: (context, index) {
                  if (more) _askNearEnd(context, index, items.length, readMore);
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
                  child: _More(
                    error: older?.error,
                    onRetry: () {
                      if (olderProvider != null) {
                        ref.read(olderProvider.notifier).retry();
                      }
                    },
                  ),
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
      actions: [RequestFilterButton(filter: _filter)],
      child: body,
    );
  }
}
