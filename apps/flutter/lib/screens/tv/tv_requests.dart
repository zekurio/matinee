import 'dart:async';

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/permissions.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/server_text.dart';
import '../../media/artwork.dart';
import '../../media/format.dart' show seasonName;
import '../../router.dart';
import '../requests/catalog_cards.dart';
import '../requests/discover.dart' show QueueList;
import '../requests/request_words.dart';
import '../requests/requests_data.dart';
import '../requests/requests_hub.dart';
import '../requests/requests_screen.dart'
    show outcomeText, progressText, queueEmptyLabel, queueListLabel, whereText;

/// Requests on a TV, as the Kotlin app's TV requests: the questions the TV
/// asks where the phone offers Undo, since a TV's toast can't take focus,
/// what Select on a request offers, and the requests page.

// ---------------------------------------------------------------------------
// The questions.

/// Asks before the viewer takes back their own request for [name], focus
/// on Keep request so a stray Select keeps it. True to cancel.
Future<bool> confirmTvCancel(BuildContext context, String name) async {
  final l = AppLocalizations.of(context);
  final sure = await showTvPanel<bool>(
    context,
    title: l.tvRequestsCancelTitle(name),
    description: l.tvRequestsCancelDescription,
    builder: (panel) => [
      TvListItem(
        title: l.webAskCancel,
        icon: Lucide.x,
        quiet: true,
        destructive: true,
        onPressed: () => Navigator.of(panel).pop(true),
      ),
      TvListItem(
        title: l.tvRequestsKeep,
        icon: Lucide.check,
        quiet: true,
        autofocus: true,
        onPressed: () => Navigator.of(panel).pop(false),
      ),
    ],
  );
  return sure ?? false;
}

/// Decline [item], with why: one of the server's reasons, which has focus
/// first, and a note for whoever asked, which the remote can pass by. With
/// [giveUp], the same question gives up on an accepted request, its reason
/// fixed, with focus on Cancel. The answer goes at once, since the
/// question stands in for Undo. True once it's given.
Future<bool> showTvDecline(
  BuildContext context,
  AdminRequestItem item, {
  bool giveUp = false,
}) async {
  final l = AppLocalizations.of(context);
  final keeps = item.connection;
  final answered = await showTvPanel<bool>(
    context,
    title: giveUp
        ? l.webRequestsGiveUpTitle(item.title.name)
        : l.webRequestsDeclineTitle(item.title.name),
    description: giveUp
        // A by-hand connection holds nothing to keep.
        ? keeps != null && keeps.reportsProgress
              ? l.webRequestsGiveUpKeeps(keeps.name)
              : l.webRequestsGiveUpTurnsUp
        : null,
    builder: (panel) => [_DeclineBody(item: item, giveUp: giveUp)],
  );
  return answered ?? false;
}

class _DeclineBody extends ConsumerStatefulWidget {
  const _DeclineBody({required this.item, required this.giveUp});

  final AdminRequestItem item;
  final bool giveUp;

  @override
  ConsumerState<_DeclineBody> createState() => _DeclineBodyState();
}

class _DeclineBodyState extends ConsumerState<_DeclineBody> {
  String? _reason;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _submit(AppLocalizations l) {
    final text = _note.text.trim();
    final note = text.isEmpty ? null : text;
    final QueueAnswer answer;
    if (widget.giveUp) {
      answer = GiveUpAnswer(note);
    } else {
      final reason = _reason;
      if (reason == null) return;
      answer = DeclineAnswer(reason, note);
    }
    final hub = ref.read(requestsProvider.notifier);
    Navigator.of(context).pop(true);
    unawaited(hub.answer(l, widget.item, answer, undo: false));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final item = widget.item;
    final giveUp = widget.giveUp;
    final askedBy = [for (final each in item.followers) each.name];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 4,
      children: [
        TvListHeading(l.webRequestsDeclineReason),
        // Only one reason fits giving up, so it's said, not offered.
        if (giveUp)
          TvListItem(
            title: adminReasonText(DeclineReason.notFound, l),
            quiet: true,
            checked: true,
            enabled: false,
            onPressed: null,
          )
        else
          for (final (index, code) in WaitingDeclineReason.all.indexed)
            TvListItem(
              title: adminReasonText(code, l),
              quiet: true,
              checked: _reason == code,
              autofocus: index == 0,
              onPressed: () => setState(() => _reason = code),
            ),
        TvListHeading(
          askedBy.isEmpty
              ? l.webRequestsDeclineNote
              : l.webRequestsDeclineNoteFor(formatList(askedBy, l)),
        ),
        TvTextField(
          controller: _note,
          placeholder: l.webRequestsDeclineNotePlaceholder,
        ),
        const SizedBox(height: 12),
        TvListItem(
          title: giveUp
              ? l.webRequestsGiveUpSubmit
              : l.webRequestsDeclineSubmit,
          icon: giveUp ? Lucide.circleSlash : Lucide.x,
          destructive: true,
          enabled: giveUp || _reason != null,
          onPressed: () => _submit(l),
        ),
        TvListItem(
          title: l.webRequestsDeclineCancel,
          icon: Lucide.arrowLeft,
          quiet: true,
          autofocus: giveUp,
          onPressed: () => Navigator.of(context).pop(false),
        ),
      ],
    );
  }
}

/// "Goes to": the libraries a waiting request could go to, the one it goes
/// to now ticked, each with what fills it. Kept by request, and only sent
/// with Add.
Future<void> showTvGoesTo(BuildContext context, AdminRequestItem item) async {
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final current = container.read(requestsProvider).goesTo(item).id;
  final picked = await showTvPicker<String>(
    context,
    title: l.webRequestsGoesToTitle,
    description: item.title.name,
    current: current,
    options: [
      for (final library in item.destinations)
        TvOption(
          library.id,
          library.name,
          detail: library.connection ?? l.webRequestsNoConnection,
        ),
    ],
  );
  if (picked == null) return;
  final selected = item.destinations.any(
    (each) => each.id == picked && each.selected,
  );
  container
      .read(requestsProvider.notifier)
      .move(item.id, selected ? null : picked);
}

/// What the connection reported about [item], label over value as the
/// server words them, each a row focus can rest on to read the rest.
Future<void> showTvDiagnostics(BuildContext context, AdminRequestItem item) {
  final l = AppLocalizations.of(context);
  return showTvPanel<void>(
    context,
    title: l.webRequestsDiagnostics,
    description: [item.title.name, ?item.connection?.name].join(' · '),
    builder: (panel) => [
      for (final entry in item.diagnostics)
        TvListItem(
          title: entry.label,
          subtitle: entry.value,
          subtitleLines: 4,
          quiet: true,
          onPressed: null,
        ),
    ],
  );
}

// ---------------------------------------------------------------------------
// What Select on a request offers.

/// A request's title: its library page once it's here, its catalog page
/// while it isn't.
String requestRoute(
  CatalogTitleSummary title,
  String library,
  Availability availability,
) {
  final here = availability.libraryTitleId;
  return here != null
      ? Routes.title(here)
      : catalogRoute(title.ref, library: library);
}

/// Whether the viewer may still take [item] back.
bool cancels(RequestItem item) =>
    item.availability.action == AvailabilityAction.cancel ||
    item.season?.action == AvailabilityAction.cancel;

/// What a card's panel goes on from once it closes: the root navigator's
/// overlay, which outlives the card. A live list can rebuild the card
/// under an open panel, and the next question shouldn't fail for it.
BuildContext _host(BuildContext context) =>
    Navigator.of(context, rootNavigator: true).overlay!.context;

/// One of the viewer's own requests: with nothing to take back, its title
/// at once; else a panel with Cancel request, which asks first, and Open
/// title. A cancel leaves the lists at once.
Future<void> openTvMine(BuildContext context, RequestItem item) async {
  final route = requestRoute(item.title, item.library.id, item.availability);
  if (!cancels(item)) {
    unawaited(context.push(route));
    return;
  }
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final router = GoRouter.of(context);
  final host = _host(context);
  final picked = await showTvPanel<_Pick>(
    context,
    title: item.title.name,
    description: yearKind(item.title.year, item.title.ref.kind, l),
    builder: (panel) => [
      TvListItem(
        title: l.webRequestsOpenTitle,
        icon: Lucide.info,
        quiet: true,
        autofocus: true,
        onPressed: () => Navigator.of(panel).pop(_Pick.open),
      ),
      TvListItem(
        title: l.webAskCancel,
        icon: Lucide.x,
        quiet: true,
        onPressed: () => Navigator.of(panel).pop(_Pick.cancel),
      ),
    ],
  );
  if (!host.mounted) return;
  switch (picked) {
    case _Pick.open:
      unawaited(router.push(route));
    case _Pick.cancel:
      if (!await confirmTvCancel(host, item.title.name)) return;
      unawaited(
        container
            .read(requestsProvider.notifier)
            .withdraw(l, item.id, item.title.name, undo: false),
      );
    default:
  }
}

enum _Pick {
  open,
  cancel,
  add,
  goesTo,
  decline,
  retry,
  giveUp,
  addAfterAll,
  allowAgain,
  diagnostics,
}

/// A request in [list] of an admin's queue: what the list allows, its
/// title's page, and what the connection reports. Add and the answers to a
/// declined request go at once; Decline and Give up ask first. [onAnswered]
/// runs once an answer is given, as an answered row leaving Done.
Future<void> openTvQueued(
  BuildContext context,
  AdminRequestItem item,
  String list, {
  VoidCallback? onAnswered,
}) async {
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final hub = container.read(requestsProvider.notifier);
  final state = container.read(requestsProvider);
  final router = GoRouter.of(context);
  final host = _host(context);
  Widget row(_Pick pick, String icon, String title, {String? value}) => Builder(
    builder: (panel) => TvListItem(
      title: title,
      icon: icon,
      quiet: true,
      trailing: value == null ? null : TvListValue(value),
      onPressed: () => Navigator.of(panel).pop(pick),
    ),
  );
  final picked = await showTvPanel<_Pick>(
    context,
    title: item.title.name,
    description: whereText(state, item, l),
    builder: (panel) => [
      if (list == QueueList.waiting) ...[
        row(_Pick.add, Lucide.check, l.webRequestsAdd),
        if (choosesLibrary(item))
          row(
            _Pick.goesTo,
            Lucide.libraryBig,
            l.webRequestsGoesToTitle,
            value: state.goesTo(item).name,
          ),
        row(_Pick.decline, Lucide.x, l.webRequestsDecline),
      ] else if (list == QueueList.needsAttention) ...[
        row(_Pick.retry, Lucide.rotateCw, l.webRequestsRetry),
        row(_Pick.giveUp, Lucide.circleSlash, l.webRequestsGiveUp),
      ] else if (list == QueueList.onTheWay)
        row(_Pick.giveUp, Lucide.circleSlash, l.webRequestsGiveUp)
      else if (item.status == RequestStatus.declined) ...[
        row(_Pick.addAfterAll, Lucide.check, l.webRequestsAddAfterAll),
        row(_Pick.allowAgain, Lucide.lockOpen, l.webRequestsAllowAgain),
      ],
      row(_Pick.open, Lucide.info, l.webRequestsOpenTitle),
      if (item.diagnostics.isNotEmpty)
        row(_Pick.diagnostics, Lucide.activity, l.webRequestsDiagnostics),
    ],
  );
  if (picked == null || !host.mounted) return;
  void answer(QueueAnswer answer) {
    onAnswered?.call();
    unawaited(hub.answer(l, item, answer, undo: false));
  }

  switch (picked) {
    case _Pick.add:
      answer(const AddAnswer());
    case _Pick.goesTo:
      await showTvGoesTo(host, item);
    case _Pick.decline:
      if (await showTvDecline(host, item)) onAnswered?.call();
    case _Pick.retry:
      unawaited(hub.retry(l, item));
    case _Pick.giveUp:
      if (await showTvDecline(host, item, giveUp: true)) {
        onAnswered?.call();
      }
    case _Pick.addAfterAll:
      answer(const AddAfterAllAnswer());
    case _Pick.allowAgain:
      answer(const AllowAgainAnswer());
    case _Pick.open:
      unawaited(
        router.push(
          requestRoute(item.title, item.library.id, item.availability),
        ),
      );
    case _Pick.diagnostics:
      await showTvDiagnostics(host, item);
    case _Pick.cancel:
  }
}

// ---------------------------------------------------------------------------
// The words a request's row and card say.

/// Where one of the viewer's requests stands, in the server's words: the
/// season it waits on, its state, and how long it has left.
String mineStateText(RequestItem item, Availability now, AppLocalizations l) {
  final season = item.season;
  final availability = season?.asTitle() ?? now;
  final String? state;
  if (availability.state == AvailabilityState.here) {
    state = l.webCatalogBadgeHere;
  } else if (availability.state == AvailabilityState.asked) {
    state = l.discoverRequestWaiting;
  } else {
    final word = stateWord(availability, percent: true);
    state = word == null ? null : stateText(word, l);
  }
  final eta = availability.etaSeconds;
  return [
    if (season != null) seasonName(season.number, l),
    ?state,
    if (availability.state == AvailabilityState.coming && eta != null)
      l.webRequestsProgressLeft(formatSpan(eta, l)),
  ].join(' · ');
}

/// Why a declined request isn't coming, and the note the admin left.
String? declinedText(Availability availability, AppLocalizations l) {
  final reason = availability.reason;
  if (reason == null || availability.state != AvailabilityState.unavailable) {
    return null;
  }
  final note = reason.note?.trim();
  return [
    declineText(reason, l),
    if (note != null && note.isNotEmpty) '“$note”',
  ].join(' ');
}

/// What a row of [list] says of [item] under its name: who asked and where
/// it goes, why it needs attention, how far along it is, or what became
/// of it.
String queueStatusText(
  RequestsState state,
  AdminRequestItem item,
  String list,
  AppLocalizations l,
) {
  switch (list) {
    case QueueList.waiting:
      final people = askers(item);
      final first = people.firstOrNull;
      final goes = state.goesTo(item);
      return [
        if (first != null)
          people.length > 1
              ? '${first.name} ${l.webRequestsOthersCount('${people.length - 1}')}'
              : first.name,
        if (first != null) ?relativeTime(first.createdAt, l),
        goes.name,
        if (goes.connection == null) l.webRequestsNoConnection,
      ].join(' · ');
    case QueueList.needsAttention:
      return item.error?.serverWords(l) ?? l.webRequestsAttentionUnknown;
    case QueueList.onTheWay:
      return [progressText(item, l), item.library.name].join(' · ');
    default:
      final note = item.status == RequestStatus.declined ? item.note : null;
      return [
        outcomeText(item, l) ?? '',
        if (note != null) '“$note”',
      ].join(' ');
  }
}

// ---------------------------------------------------------------------------
// The requests page.

/// The rows of the requests page in its focus memory.
abstract final class _Rows {
  static const tabs = 'tabs';
  static const list = 'list';
  static const addAll = 'add-all';
}

/// How tall a request's row is: room for its poster and three lines.
const _rowHeight = 96.0;

/// The requests page on a TV, from the Requests row's See all card. Without
/// a list, what the viewer asked for, "In progress" or "All", newest first,
/// with why a declined one isn't coming. With one of [QueueList]'s, for an
/// admin, the four lists, the first three live from the queue the whole
/// app follows and Done a page at a time. Each request is a row with its
/// poster; Select offers what can be done about it. Focus starts on the
/// first request, else the list's tab.
class TvRequestsScreen extends ConsumerStatefulWidget {
  const TvRequestsScreen({super.key, this.list});

  final String? list;

  @override
  ConsumerState<TvRequestsScreen> createState() => _TvRequestsScreenState();
}

class _TvRequestsScreenState extends ConsumerState<TvRequestsScreen> {
  final _memory = TvFocusMemory();
  final _scroll = ScrollController();
  late String _tab = _start();

  String _start() {
    final list = widget.list;
    if (list == null) return MineFilter.inProgress;
    return QueueList.all.contains(list) ? list : QueueList.waiting;
  }

  @override
  void dispose() {
    _memory.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _show(String tab) {
    if (tab == _tab) return;
    setState(() => _tab = tab);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    // Anyone who doesn't run the queue gets their own requests, whatever
    // the path, as the phone's page.
    final queue = widget.list != null && ref.watch(runsQueueProvider);
    final tabs = queue
        ? QueueList.all
        : const [MineFilter.inProgress, MineFilter.all];
    if (!tabs.contains(_tab)) _tab = tabs.first;
    final body = queue ? _queueBody(l) : _mineBody(l);
    // Up from the list lands on the tab it shows.
    _memory.startAt(_Rows.tabs, _tab);
    _memory.restore(context, () {
      final first = body.first;
      if (first != null) return (_Rows.list, first);
      return body.settled ? (_Rows.tabs, _tab) : null;
    });
    final counts = queue ? _counts() : const <String, int>{};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.only(
            start: TvPage.start,
            end: TvPage.end + TvGrid.clockRoom,
            top: TvGrid.top,
          ),
          child: Text(
            queue ? l.webRequestsTitle : l.webAskMineTitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TvType.headline.style(color: colors.foreground),
          ),
        ),
        Padding(
          padding: const EdgeInsetsDirectional.only(
            start: TvPage.start,
            end: TvPage.end,
            top: 16,
          ),
          child: TvMemoryRow(
            memory: _memory,
            row: _Rows.tabs,
            child: Row(
              spacing: 12,
              children: [
                for (final tab in tabs)
                  TvChip(
                    label: switch (tab) {
                      MineFilter.inProgress => l.webAskMineInProgress,
                      MineFilter.all => l.webAskMineAll,
                      // Done only grows, so it says no count.
                      _ => switch (counts[tab]) {
                        final count? when count > 0 =>
                          '${queueListLabel(tab, l)} · ${formatCount(count, l)}',
                        _ => queueListLabel(tab, l),
                      },
                    },
                    selected: tab == _tab,
                    focusNode: _memory.node(_Rows.tabs, tab),
                    onPressed: () => _show(tab),
                  ),
              ],
            ),
          ),
        ),
        Expanded(child: body.child),
      ],
    );
  }

  Map<String, int> _counts() {
    final state = ref.watch(requestsProvider);
    final queue = state.queue;
    if (queue == null) return const {};
    return {
      QueueList.waiting: queue.waiting
          .where((item) => !state.held.contains(item.id))
          .length,
      QueueList.needsAttention: queue.counts.needsAttention,
      QueueList.onTheWay: queue.counts.onTheWay,
    };
  }

  /// The viewer's requests, a page at a time.
  _Body _mineBody(AppLocalizations l) {
    final provider = myRequestsProvider(_tab);
    final pages = ref.watch(provider);
    final notifier = ref.read(provider.notifier);
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final items = [
      for (final item in pages.items)
        if (!held.contains(item.id)) item,
    ];
    final error = pages.error;
    if (error != null && items.isEmpty) {
      return _Body.settled(
        _Notice(
          headline: l.askedLoadFailed,
          message: describeFailure(l, error),
          onRetry: notifier.retry,
        ),
      );
    }
    if (!pages.loaded) return const _Body.loading();
    if (items.isEmpty) {
      return _Body.settled(
        _Notice(
          headline: _tab == MineFilter.inProgress
              ? l.webAskMineEmptyInProgress
              : l.webAskMineEmpty,
          message: _tab == MineFilter.inProgress ? null : l.webAskMineEmptyHint,
        ),
      );
    }
    return _Body(
      first: items.first.id,
      child: FollowTitles(
        titles: FollowedTitles([
          for (final item in items)
            CatalogInput(ref: item.title.ref, libraryId: item.library.id),
        ]),
        child: _List(
          memory: _memory,
          scroll: _scroll,
          itemCount: items.length,
          done: pages.done,
          error: error,
          onMore: notifier.more,
          onRetry: notifier.retry,
          itemBuilder: (context, index) => _MineRow(
            item: items[index],
            focusNode: _memory.node(_Rows.list, items[index].id),
          ),
        ),
      ),
    );
  }

  /// One of the admin's lists: the first three live, Done a page at a time.
  _Body _queueBody(AppLocalizations l) {
    final state = ref.watch(requestsProvider);
    final queue = state.queue;
    if (_tab == QueueList.done) return _doneBody(l);
    if (queue == null) {
      if (state.queueFailed) {
        return _Body.settled(
          _Notice(
            headline: l.requestsLoadFailed,
            onRetry: () => ref.read(requestsProvider.notifier).retryQueue(),
          ),
        );
      }
      return const _Body.loading();
    }
    final rows = switch (_tab) {
      QueueList.waiting => [
        for (final item in queue.waiting)
          if (!state.held.contains(item.id)) item,
      ],
      QueueList.needsAttention => [
        for (final item in queue.needsAttention)
          if (!state.held.contains(item.id)) item,
      ],
      _ => [
        for (final item in queue.onTheWay)
          if (!state.held.contains(item.id)) item,
      ],
    };
    return _queueRows(l, rows, done: true);
  }

  _Body _doneBody(AppLocalizations l) {
    final pages = ref.watch(doneRequestsProvider);
    final notifier = ref.read(doneRequestsProvider.notifier);
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final error = pages.error;
    if (!pages.loaded) {
      if (error != null) {
        return _Body.settled(
          _Notice(
            headline: l.requestsLoadFailed,
            message: describeFailure(l, error),
            onRetry: notifier.retry,
          ),
        );
      }
      return const _Body.loading();
    }
    return _queueRows(
      l,
      [
        for (final item in pages.items)
          if (!held.contains(item.id)) item,
      ],
      done: pages.done,
      error: error,
      onMore: notifier.more,
      onRetry: notifier.retry,
      // Done is read page by page, so an answered row leaves it here.
      onAnswered: (item) => notifier.drop(item.id),
    );
  }

  _Body _queueRows(
    AppLocalizations l,
    List<AdminRequestItem> rows, {
    required bool done,
    Object? error,
    VoidCallback? onMore,
    VoidCallback? onRetry,
    ValueChanged<AdminRequestItem>? onAnswered,
  }) {
    final list = _tab;
    if (rows.isEmpty) {
      return _Body.settled(_Notice(headline: queueEmptyLabel(list, l)));
    }
    // Add for all of them, as the phone's queue has over its rows. Like
    // Add, it asks nothing.
    final all = list == QueueList.waiting && rows.length > 1;
    return _Body(
      first: rows.first.id,
      child: _List(
        memory: _memory,
        scroll: _scroll,
        itemCount: rows.length,
        done: done,
        error: error,
        onMore: onMore,
        onRetry: onRetry,
        lead: all
            ? TvListItem(
                title: l.webRequestsAddAll(rows.length),
                icon: Lucide.listChecks,
                focusNode: _memory.node(_Rows.list, _Rows.addAll),
                onPressed: () => unawaited(
                  ref
                      .read(requestsProvider.notifier)
                      .answerAll(l, rows, undo: false),
                ),
              )
            : null,
        itemBuilder: (context, index) {
          final item = rows[index];
          return _QueueRow(
            item: item,
            list: list,
            focusNode: _memory.node(_Rows.list, item.id),
            onAnswered: onAnswered == null ? null : () => onAnswered(item),
          );
        },
      ),
    );
  }
}

/// What a list shows: its rows, with the key of the first for focus, or a
/// notice; [settled] once it's said what it has.
class _Body {
  const _Body({required this.child, this.first}) : settled = true;

  const _Body.settled(this.child) : first = null, settled = true;

  const _Body.loading()
    : child = const TvLoading(top: 48),
      first = null,
      settled = false;

  final Widget child;
  final String? first;
  final bool settled;
}

/// A list's notice, under its tabs.
class _Notice extends StatelessWidget {
  const _Notice({required this.headline, this.message, this.onRetry});

  final String headline;
  final String? message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsetsDirectional.only(
      start: TvPage.start,
      end: TvPage.end,
    ),
    child: Align(
      alignment: AlignmentDirectional.topStart,
      child: TvNotice(
        headline: headline,
        message: message,
        onRetry: onRetry,
        retryLabel: AppLocalizations.of(context).commonRetry,
      ),
    ),
  );
}

/// The rows, one under the other, scrolled to keep the focused one clear
/// of the overscan. As its end nears, [onMore] asks for the next page;
/// a page that didn't come says so with Try again.
class _List extends StatelessWidget {
  const _List({
    required this.memory,
    required this.scroll,
    required this.itemCount,
    required this.itemBuilder,
    required this.done,
    this.error,
    this.onMore,
    this.onRetry,
    this.lead,
  });

  final TvFocusMemory memory;
  final ScrollController scroll;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final bool done;
  final Object? error;
  final VoidCallback? onMore;
  final VoidCallback? onRetry;
  final Widget? lead;

  /// How close to the end of what's loaded the next page is asked for.
  static const _nearEnd = 6;

  /// Between rows.
  static const _gap = 6.0;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final error = this.error;
    final lead = this.lead;
    final more = onMore;
    Widget side(Widget child) => Padding(
      padding: const EdgeInsetsDirectional.only(
        start: TvPage.start - TvListItems.inset,
        end: TvPage.end,
      ),
      child: child,
    );
    return TvMemoryRow(
      memory: memory,
      row: _Rows.list,
      child: TvFollowFocus(
        controller: scroll,
        rule: TvFollowFocus.clear(start: 24, end: Overscan.vertical + 24),
        sectionTop: _gap,
        child: TvRowsScroll(
          controller: scroll,
          gap: _gap,
          top: 20,
          rows: [
            if (lead != null) side(lead),
            for (var at = 0; at < itemCount; at++)
              side(
                // Built as the list reaches it, so nearing the end of
                // what's loaded asks for the next page.
                Builder(
                  builder: (context) {
                    if (at >= itemCount - _nearEnd &&
                        !done &&
                        error == null &&
                        more != null) {
                      SchedulerBinding.instance.addPostFrameCallback(
                        (_) => more(),
                      );
                    }
                    return itemBuilder(context, at);
                  },
                ),
              ),
            if (!done)
              side(
                error == null
                    ? const TvLoading(size: 28, top: 8)
                    : TvNotice(
                        headline: l.listMoreFailed,
                        message: describeFailure(l, error),
                        onRetry: onRetry,
                        retryLabel: l.commonRetry,
                        top: 8,
                      ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A request's poster at the start of its row.
class _RowPoster extends StatelessWidget {
  const _RowPoster({required this.title});

  final CatalogTitleSummary title;

  @override
  Widget build(BuildContext context) {
    final poster = title.poster;
    return SizedBox(
      width: 48,
      child: ArtFrame(
        toneKey: refKey(title.ref),
        aspectRatio: 2 / 3,
        children: [
          if (poster != null) Picture([ArtSource(poster)]),
        ],
      ),
    );
  }
}

/// One of the viewer's requests: its poster, its name, what it is, and
/// where it stands, with why a declined one isn't coming.
class _MineRow extends ConsumerWidget {
  const _MineRow({required this.item, required this.focusNode});

  final RequestItem item;
  final FocusNode focusNode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final title = item.title;
    final now = liveAvailability(ref, title.ref, item.availability);
    final lines = [
      [
        yearKind(title.year, title.ref.kind, l),
        ?scopeText(item.scope, l),
      ].join(' · '),
      mineStateText(item, now, l),
      ?declinedText(now, l),
    ].where((line) => line.isNotEmpty);
    return TvListItem(
      title: title.name,
      subtitle: lines.join('\n'),
      subtitleLines: 3,
      leading: _RowPoster(title: title),
      minHeight: _rowHeight,
      quiet: true,
      focusNode: focusNode,
      onPressed: () => unawaited(openTvMine(context, item)),
    );
  }
}

/// A request in an admin's list: its poster, its name, what it is, and who
/// asked, where it stands, or what became of it.
class _QueueRow extends ConsumerWidget {
  const _QueueRow({
    required this.item,
    required this.list,
    required this.focusNode,
    this.onAnswered,
  });

  final AdminRequestItem item;
  final String list;
  final FocusNode focusNode;
  final VoidCallback? onAnswered;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final state = ref.watch(requestsProvider);
    final title = item.title;
    return TvListItem(
      title: title.name,
      subtitle: [
        [
          yearKind(title.year, title.ref.kind, l),
          ?scopeText(item.scope, l),
        ].join(' · '),
        queueStatusText(state, item, list, l),
      ].where((line) => line.isNotEmpty).join('\n'),
      subtitleLines: 3,
      leading: _RowPoster(title: title),
      minHeight: _rowHeight,
      quiet: true,
      focusNode: focusNode,
      onPressed: () =>
          unawaited(openTvQueued(context, item, list, onAnswered: onAnswered)),
    );
  }
}
