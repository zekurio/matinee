import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/avatar.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import '../../router.dart';
import 'catalog_cards.dart';
import 'discover.dart' show QueueList;
import 'request_sheet.dart';
import 'request_words.dart';
import 'requests_data.dart';
import 'requests_hub.dart';

/// The requests page. Without a list, what the viewer asked for, as the
/// Kotlin app's `AskedScreen`, newest first, "In progress" or "All", with
/// why a declined title isn't coming. With one of [QueueList]'s, for an
/// admin, the requests to answer and follow, as its `RequestsScreen`:
/// Waiting, Needs attention, On the way, and Done, live from the stream
/// the whole app follows. Anyone else gets their own requests.
class RequestsScreen extends ConsumerWidget {
  const RequestsScreen({super.key, this.list});

  final String? list;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final admin = ref.watch(isAdminProvider);
    final list = this.list;
    if (admin && list != null) {
      return _QueuePage(
        start: QueueList.all.contains(list) ? list : QueueList.waiting,
      );
    }
    return const _MinePage();
  }
}

/// How far from the end of what's loaded the next page is asked for.
const _nearEnd = 8;

class _MinePage extends ConsumerStatefulWidget {
  const _MinePage();

  @override
  ConsumerState<_MinePage> createState() => _MinePageState();
}

class _MinePageState extends ConsumerState<_MinePage> {
  String _filter = MineFilter.inProgress;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final provider = myRequestsProvider(_filter);
    final pages = ref.watch(provider);
    final items = pages.items;
    final error = pages.error;
    final Widget body;
    if (error != null && items.isEmpty) {
      body = Center(
        child: SingleChildScrollView(
          child: FailureState(
            title: l.askedLoadFailed,
            error: error,
            onRetry: () => ref.read(provider.notifier).retry(),
          ),
        ),
      );
    } else if (!pages.loaded) {
      body = Center(child: LoadingState(label: l.loadingInProgress));
    } else if (items.isEmpty) {
      body = Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
          child: EmptyState(
            icon: Lucide.clock,
            title: _filter == MineFilter.inProgress
                ? l.webAskMineEmptyInProgress
                : l.webAskMineEmpty,
            message: _filter == MineFilter.inProgress
                ? null
                : l.webAskMineEmptyHint,
          ),
        ),
      );
    } else {
      body = FollowTitles(
        titles: FollowedTitles([
          for (final item in items)
            CatalogInput(ref: item.title.ref, libraryId: item.library.id),
        ]),
        child: CustomScrollView(
          slivers: [
            CardGrid(
              columns: posterColumns,
              aspectRatio: CardMetrics.poster,
              itemCount: items.length,
              // Why a title was declined goes under its card, so a row
              // with one is taller than the rest.
              fitRows: true,
              itemBuilder: (context, index) {
                if (index >= items.length - _nearEnd && !pages.done) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (mounted) ref.read(provider.notifier).more();
                  });
                }
                final item = items[index];
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AskedCard(item: item),
                    _DeclinedNote(item: item),
                  ],
                );
              },
            ),
            if (!pages.done)
              SliverToBoxAdapter(
                child: _More(
                  error: error,
                  onRetry: () => ref.read(provider.notifier).retry(),
                ),
              ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: MediaQuery.paddingOf(context).bottom + 32,
              ),
            ),
          ],
        ),
      );
    }
    return PageFrame(
      title: l.webAskMineTitle,
      onBack: () => context.pop(),
      backLabel: l.commonBack,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(
              CardMetrics.gutter,
              0,
              CardMetrics.gutter,
              12,
            ),
            child: Row(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: l.webAskMineInProgress,
                  selected: _filter == MineFilter.inProgress,
                  onPressed: () =>
                      setState(() => _filter = MineFilter.inProgress),
                ),
                ChoiceChip(
                  label: l.webAskMineAll,
                  selected: _filter == MineFilter.all,
                  onPressed: () => setState(() => _filter = MineFilter.all),
                ),
              ],
            ),
          ),
          Expanded(child: body),
        ],
      ),
    );
  }
}

/// Why a declined title isn't coming, under its card, and under that the
/// note an admin left, each with two lines of its own, as the Kotlin
/// app's `DeclinedNote`.
class _DeclinedNote extends ConsumerWidget {
  const _DeclinedNote({required this.item});

  final RequestItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final availability = ref.watch(
      requestsProvider.select(
        (state) => state.availability(item.title.ref, item.availability),
      ),
    );
    final reason = availability.reason;
    if (reason == null || availability.state != AvailabilityState.unavailable) {
      return const SizedBox.shrink();
    }
    final note = reason.note?.trim();
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            declineText(reason, l),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: KitText.xs.style(color: colors.mutedForeground),
          ),
          if (note != null && note.isNotEmpty)
            Text(
              note,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: KitText.xs
                  .style(color: colors.foreground.withValues(alpha: .7))
                  .copyWith(fontStyle: FontStyle.italic),
            ),
        ],
      ),
    );
  }
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

String _listLabel(String list, AppLocalizations l) => switch (list) {
  QueueList.waiting => l.webRequestsListWaiting,
  QueueList.needsAttention => l.webRequestsListNeedsAttention,
  QueueList.onTheWay => l.webRequestsListOnTheWay,
  _ => l.webRequestsListDone,
};

String _emptyLabel(String list, AppLocalizations l) => switch (list) {
  QueueList.waiting => l.webRequestsEmptyWaiting,
  QueueList.needsAttention => l.webRequestsEmptyNeedsAttention,
  QueueList.onTheWay => l.webRequestsEmptyOnTheWay,
  _ => l.webRequestsEmptyDone,
};

class _QueuePage extends ConsumerStatefulWidget {
  const _QueuePage({required this.start});

  final String start;

  @override
  ConsumerState<_QueuePage> createState() => _QueuePageState();
}

class _QueuePageState extends ConsumerState<_QueuePage> {
  late String _list = widget.start;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final queue = ref.watch(requestsProvider.select((state) => state.queue));
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final Widget body;
    if (queue == null) {
      body = Center(child: LoadingState(label: l.loadingInProgress));
    } else {
      final waiting = [
        for (final item in queue.waiting)
          if (!held.contains(item.id)) item,
      ];
      final counts = {
        QueueList.waiting: waiting.length,
        QueueList.needsAttention: queue.counts.needsAttention,
        QueueList.onTheWay: queue.counts.onTheWay,
      };
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(
              CardMetrics.gutter,
              0,
              CardMetrics.gutter,
              8,
            ),
            child: Row(
              spacing: 8,
              children: [
                for (final list in QueueList.all)
                  ChoiceChip(
                    label: _listLabel(list, l),
                    // Done only grows, so it says no count.
                    count: switch (counts[list]) {
                      final count? when count > 0 => formatCount(count, l),
                      _ => null,
                    },
                    selected: _list == list,
                    onPressed: () => setState(() => _list = list),
                  ),
              ],
            ),
          ),
          Expanded(
            child: _list == QueueList.done
                ? const _DoneList()
                : _QueueRows(
                    list: _list,
                    rows: switch (_list) {
                      QueueList.waiting => waiting,
                      QueueList.needsAttention => queue.needsAttention,
                      _ => queue.onTheWay,
                    },
                  ),
          ),
        ],
      );
    }
    return PageFrame(
      title: l.webRequestsTitle,
      onBack: () => context.pop(),
      backLabel: l.commonBack,
      child: body,
    );
  }
}

/// A list's rows, or what it says when there are none.
class _QueueRows extends ConsumerWidget {
  const _QueueRows({
    required this.list,
    required this.rows,
    this.footer,
    this.onAnswered,
  });

  final String list;
  final List<AdminRequestItem> rows;
  final Widget? footer;

  /// An answer to a row was given, as an answered row leaving Done.
  final ValueChanged<AdminRequestItem>? onAnswered;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    if (rows.isEmpty) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
          child: EmptyState(icon: Lucide.inbox, title: _emptyLabel(list, l)),
        ),
      );
    }
    final all = list == QueueList.waiting && rows.length > 1;
    final footer = this.footer;
    return ListView(
      padding: EdgeInsets.fromLTRB(
        CardMetrics.gutter,
        0,
        CardMetrics.gutter,
        24 + MediaQuery.paddingOf(context).bottom,
      ),
      children: [
        if (all)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: MatineeButton(
              look: ButtonLook.outline,
              leading: Lucide.listChecks,
              onPressed: () => unawaited(
                ref.read(requestsProvider.notifier).answerAll(l, rows),
              ),
              child: Text(l.webRequestsAddAll(rows.length)),
            ),
          ),
        for (final (index, item) in rows.indexed) ...[
          if (index > 0) Container(height: 1, color: colors.border),
          QueueRow(
            key: ValueKey(item.id),
            item: item,
            list: list,
            onMenu: () => unawaited(
              _showRowMenu(context, ref, item, list, onAnswered: onAnswered),
            ),
          ),
        ],
        ?footer,
      ],
    );
  }
}

/// Done, a page at a time from its own call, the next as its end shows.
class _DoneList extends ConsumerWidget {
  const _DoneList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final pages = ref.watch(doneRequestsProvider);
    final notifier = ref.read(doneRequestsProvider.notifier);
    final error = pages.error;
    if (!pages.loaded) {
      if (error != null) {
        return Center(
          child: SingleChildScrollView(
            child: FailureState(
              title: l.requestsLoadFailed,
              error: error,
              onRetry: notifier.retry,
            ),
          ),
        );
      }
      return Center(child: LoadingState(label: l.loadingInProgress));
    }
    return _QueueRows(
      list: QueueList.done,
      rows: pages.items,
      // Done is read page by page, so an answered row leaves it here.
      onAnswered: (item) => notifier.drop(item.id),
      footer: pages.done
          ? null
          : _DoneMore(
              error: error,
              onMore: notifier.more,
              onRetry: notifier.retry,
            ),
    );
  }
}

/// The end of Done while more of it comes, which asks for the next page
/// once it's built.
class _DoneMore extends StatefulWidget {
  const _DoneMore({
    required this.error,
    required this.onMore,
    required this.onRetry,
  });

  final Object? error;
  final VoidCallback onMore;
  final VoidCallback onRetry;

  @override
  State<_DoneMore> createState() => _DoneMoreState();
}

class _DoneMoreState extends State<_DoneMore> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onMore();
    });
  }

  @override
  Widget build(BuildContext context) =>
      _More(error: widget.error, onRetry: widget.onRetry);
}

/// A request's title: its library page once it's here, its catalog page
/// while it isn't.
void _open(BuildContext context, AdminRequestItem item) {
  final here = item.availability.libraryTitleId;
  unawaited(
    context.push(
      here != null
          ? Routes.title(here)
          : catalogRoute(item.title.ref, library: item.library.id),
    ),
  );
}

/// "Films · Radarr": where a request goes, and what fills it.
String _whereText(AdminRequestItem item, AppLocalizations l) => [
  item.library.name,
  item.connection?.name ?? l.webRequestsNoConnection,
].join(' · ');

/// A row's menu: what the list allows, and its title's page.
Future<void> _showRowMenu(
  BuildContext context,
  WidgetRef ref,
  AdminRequestItem item,
  String list, {
  ValueChanged<AdminRequestItem>? onAnswered,
}) {
  final l = AppLocalizations.of(context);
  final hub = ref.read(requestsProvider.notifier);
  return Sheet.show<void>(
    context,
    dismissLabel: l.commonCancel,
    builder: (sheet) {
      void then(VoidCallback action) {
        Navigator.of(sheet).pop();
        action();
      }

      void reopen(QueueAnswer answer) => then(() {
        onAnswered?.call(item);
        unawaited(hub.answer(l, item, answer));
      });

      return Sheet(
        title: item.title.name,
        description: _whereText(item, l),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (list == QueueList.waiting) ...[
              SheetItem(
                icon: Lucide.check,
                label: l.webRequestsAdd,
                onPressed: () => then(
                  () => unawaited(hub.answer(l, item, const AddAnswer())),
                ),
              ),
              SheetItem(
                icon: Lucide.x,
                label: l.webRequestsDecline,
                onPressed: () =>
                    then(() => unawaited(showDeclineSheet(context, item))),
              ),
            ] else if (list == QueueList.needsAttention) ...[
              SheetItem(
                icon: Lucide.rotateCw,
                label: l.webRequestsRetry,
                onPressed: () => then(() => unawaited(hub.retry(l, item))),
              ),
              SheetItem(
                icon: Lucide.circleSlash,
                label: l.webRequestsGiveUp,
                onPressed: () => then(
                  () =>
                      unawaited(showDeclineSheet(context, item, giveUp: true)),
                ),
              ),
            ] else if (list == QueueList.onTheWay)
              SheetItem(
                icon: Lucide.circleSlash,
                label: l.webRequestsGiveUp,
                onPressed: () => then(
                  () =>
                      unawaited(showDeclineSheet(context, item, giveUp: true)),
                ),
              )
            else if (item.status == RequestStatus.declined) ...[
              SheetItem(
                icon: Lucide.check,
                label: l.webRequestsAddAfterAll,
                onPressed: () => reopen(const AddAfterAllAnswer()),
              ),
              SheetItem(
                icon: Lucide.lockOpen,
                label: l.webRequestsAllowAgain,
                onPressed: () => reopen(const AllowAgainAnswer()),
              ),
            ],
            SheetItem(
              icon: Lucide.info,
              label: l.webRequestsOpenTitle,
              onPressed: () => then(() => _open(context, item)),
            ),
          ],
        ),
      );
    },
  );
}

/// A request in the queue, as Downloads lists files: the poster, then the
/// title and what it is, then who requested it and where it goes, or how
/// it stands; Add or Retry at the end. A tap opens its menu.
class QueueRow extends ConsumerWidget {
  const QueueRow({
    super.key,
    required this.item,
    required this.list,
    required this.onMenu,
  });

  final AdminRequestItem item;
  final String list;
  final VoidCallback onMenu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final hub = ref.read(requestsProvider.notifier);
    final people = askers(item);
    final first = people.firstOrNull;
    final small = KitText.xs.style(color: colors.mutedForeground);
    final strong = KitText.xs.style(
      color: colors.foreground.withValues(alpha: .85),
    );
    final poster = item.title.poster;
    final Widget status = switch (list) {
      QueueList.waiting => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            spacing: 6,
            children: [
              if (first != null)
                Avatar(avatarId: first.avatarId, name: first.name, size: 16),
              Expanded(
                child: Text(
                  [
                    if (first != null)
                      [
                        people.length > 1
                            ? '${first.name} ${l.webRequestsOthersCount('${people.length - 1}')}'
                            : first.name,
                        ?relativeTime(first.createdAt, l),
                      ].join(' · '),
                    item.library.name,
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: strong,
                ),
              ),
            ],
          ),
          if (item.connection == null)
            Text(
              l.webRequestsNoConnection,
              maxLines: 1,
              style: KitText.xs.style(color: colors.danger),
            ),
        ],
      ),
      QueueList.needsAttention => Text(
        item.error ?? l.webRequestsAttentionUnknown,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: KitText.xs.style(color: colors.danger),
      ),
      QueueList.onTheWay => _Progress(item: item),
      _ => _Outcome(item: item),
    };
    return PressIndication(
      onPressed: onMenu,
      label: l.webRequestsMore(item.title.name),
      shape: KitRadius.control,
      builder: (context, state) => Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .04,
        ),
        child: Row(
          spacing: 14,
          children: [
            SizedBox(
              width: 40,
              child: ArtFrame(
                toneKey: refKey(item.title.ref),
                aspectRatio: CardMetrics.poster,
                children: [
                  if (poster != null) Picture([ArtSource(poster)]),
                ],
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    item.title.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.sm.style(
                      color: colors.foreground,
                      weight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    [
                      yearKind(item.title.year, item.title.ref.kind, l),
                      ?scopeText(item.scope, l),
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: small,
                  ),
                  status,
                ],
              ),
            ),
            if (list == QueueList.waiting)
              MatineeButton(
                look: ButtonLook.outline,
                size: ButtonSize.sm,
                leading: Lucide.check,
                label: l.webRequestsAddNamed(item.title.name),
                onPressed: () =>
                    unawaited(hub.answer(l, item, const AddAnswer())),
                child: Text(l.webRequestsAdd),
              )
            else if (list == QueueList.needsAttention)
              RoundIconButton(
                icon: Lucide.rotateCw,
                label: l.webRequestsRetryNamed(item.title.name),
                size: 40,
                iconSize: 18,
                color: colors.mutedForeground,
                background: const Color(0x00000000),
                onPressed: () => unawaited(hub.retry(l, item)),
              ),
          ],
        ),
      ),
    );
  }
}

/// How far along a request on its way is.
class _Progress extends StatelessWidget {
  const _Progress({required this.item});

  final AdminRequestItem item;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final availability = item.availability;
    final progress = availability.progress;
    final eta = availability.etaSeconds;
    final String status;
    if (availability.state == AvailabilityState.release) {
      final day = parseDay(availability.releaseDate);
      status = day == null
          ? l.webRequestsProgressNotOut
          : l.webRequestsProgressRelease(formatShortDay(day, l));
    } else if (progress != null) {
      status = [
        formatPercent(progress, l),
        if (eta != null) l.webRequestsProgressLeft(formatSpan(eta, l)),
      ].join(' · ');
    } else if (availability.stillLooking) {
      status = l.webRequestsProgressLooking;
    } else if (item.fulfilmentState == FulfilmentState.queued) {
      status = l.webRequestsProgressQueued;
    } else if (item.connection?.reportsProgress == false) {
      status = l.webRequestsProgressByHand;
    } else {
      status = l.webRequestsProgressSent;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (progress != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: ClipRRect(
              borderRadius: KitRadius.pill,
              child: SizedBox(
                height: 3,
                child: ColoredBox(
                  color: colors.secondary,
                  child: FractionallySizedBox(
                    alignment: AlignmentDirectional.centerStart,
                    widthFactor: progress.clamp(0, 1).toDouble(),
                    child: ColoredBox(color: colors.accent),
                  ),
                ),
              ),
            ),
          ),
        Text(
          [status, item.library.name].join(' · '),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: KitText.xs.style(
            color: colors.foreground.withValues(alpha: .85),
          ),
        ),
      ],
    );
  }
}

/// What became of a done request, with the note an admin left: arrived,
/// declined, or given up on.
class _Outcome extends StatelessWidget {
  const _Outcome({required this.item});

  final AdminRequestItem item;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final strong = KitText.xs.style(
      color: colors.foreground.withValues(alpha: .85),
    );
    if (item.status == RequestStatus.declined) {
      final gaveUp = item.reason == DeclineReason.notFound;
      final at = relativeTime(item.declinedAt, l);
      final reason = item.reason;
      final note = item.note;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            [
              switch ((gaveUp, at)) {
                (true, final at?) => l.webRequestsDoneGaveUp(at),
                (false, final at?) => l.webRequestsDoneDeclined(at),
                (true, null) => l.webRequestsDoneGaveUpUndated,
                (false, null) => l.webRequestsDoneDeclinedUndated,
              },
              if (reason != null) adminReasonText(reason, l),
            ].join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: strong,
          ),
          if (note != null)
            Text(
              note,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: KitText.xs
                  .style(color: colors.mutedForeground)
                  .copyWith(fontStyle: FontStyle.italic),
            ),
        ],
      );
    }
    final arrived = relativeTime(item.arrivedAt, l);
    if (arrived == null) return const SizedBox.shrink();
    return Text(
      [l.webRequestsDoneArrived(arrived), item.library.name].join(' · '),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: strong,
    );
  }
}
