import 'dart:async';

import 'package:flutter/services.dart';
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
import '../../media/format.dart' show seasonName;
import '../../router.dart';
import '../requests/catalog_cards.dart';
import '../requests/discover.dart' show QueueList;
import '../requests/request_words.dart';
import '../requests/requests_data.dart';
import '../requests/requests_hub.dart';
import '../requests/requests_screen.dart'
    show outcomeText, progressText, queueEmptyLabel, queueListLabel, whereText;
import 'tv_browse.dart' show TvGridHeader;
import 'tv_media.dart';

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

/// Who asked for [item], the first and how many more, and when the first
/// did: nothing when nobody's left asking.
List<String> askedText(AdminRequestItem item, AppLocalizations l) {
  final people = askers(item);
  final first = people.firstOrNull;
  if (first == null) return const [];
  return [
    people.length > 1
        ? '${first.name} ${l.webRequestsOthersCount('${people.length - 1}')}'
        : first.name,
    ?relativeTime(first.createdAt, l),
  ];
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
      final goes = state.goesTo(item);
      return [
        ...askedText(item, l),
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

/// The rows of the requests page in its focus memory, beside the grid's
/// own [TvGrid.row].
abstract final class _Rows {
  static const tabs = 'tabs';
  static const addAll = 'add-all';
}

/// The requests page on a TV, from the Requests row's See all card or
/// Discover's Requests chip. Without a list, what the viewer asked for,
/// "In progress" or "All", newest first. With one of [QueueList]'s, for
/// whoever runs the queue, the four lists, the first three live from the
/// queue the whole app follows and Done a page at a time. Each list is a
/// grid of the Requests row's cards under the tabs, which stay put; the
/// line over it names the focused one with what its list says of it, and
/// Select offers what can be done about it. Up from the first row and Left
/// from the first column go to the tab shown, and Down from the tabs comes
/// back to the card left. Focus starts on the first request, else the
/// list's tab.
class TvRequestsScreen extends ConsumerStatefulWidget {
  const TvRequestsScreen({super.key, this.list});

  final String? list;

  @override
  ConsumerState<TvRequestsScreen> createState() => _TvRequestsScreenState();
}

class _TvRequestsScreenState extends ConsumerState<TvRequestsScreen> {
  final _memory = TvFocusMemory();
  late String _tab = _start();
  FocusedItem? _focused;

  String _start() {
    final list = widget.list;
    if (list == null) return MineFilter.inProgress;
    return QueueList.all.contains(list) ? list : QueueList.waiting;
  }

  @override
  void dispose() {
    _memory.dispose();
    super.dispose();
  }

  void _show(String tab) {
    if (tab == _tab) return;
    // A card of the last list isn't one to come back to.
    _memory.rowItems.remove(TvGrid.row);
    setState(() {
      _tab = tab;
      _focused = null;
    });
  }

  void _focus(FocusedItem item) {
    if (identical(item, _focused)) return;
    setState(() => _focused = item);
  }

  /// [card], at [index] in the grid: Up from the first row and Left from
  /// the first column go to the tab shown, rather than past the grid.
  Widget _edges(int index, Widget card) => Focus(
    canRequestFocus: false,
    skipTraversal: true,
    onKeyEvent: (node, event) {
      if (event is! KeyDownEvent && event is! KeyRepeatEvent) {
        return KeyEventResult.ignored;
      }
      final key = event.logicalKey;
      final edge =
          (key == LogicalKeyboardKey.arrowUp && index < TvGrid.columns) ||
          (key == LogicalKeyboardKey.arrowLeft && index % TvGrid.columns == 0);
      if (!edge) return KeyEventResult.ignored;
      _memory.node(_Rows.tabs, _tab).requestFocus();
      return KeyEventResult.handled;
    },
    child: card,
  );

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    // Anyone who doesn't run the queue gets their own requests, whatever
    // the path, as the phone's page.
    final queue = widget.list != null && ref.watch(runsQueueProvider);
    final tabs = queue
        ? QueueList.all
        : const [MineFilter.inProgress, MineFilter.all];
    if (!tabs.contains(_tab)) _tab = tabs.first;
    final body = queue ? _queueBody(l) : _mineBody(l);
    final cards = body.cards;
    // Up from the grid lands on the tab it shows.
    _memory.startAt(_Rows.tabs, _tab);
    _memory.restore(context, () {
      if (cards.isNotEmpty) return (TvGrid.row, cards.first.id);
      return body.settled ? (_Rows.tabs, _tab) : null;
    });
    final counts = queue ? _counts() : const <String, int>{};
    // Add for all of them, as the phone's queue has over its rows. Like
    // Add, it asks nothing.
    final all = queue && _tab == QueueList.waiting && cards.length > 1;
    final grid = TvPosterGrid(
      memory: _memory,
      itemCount: cards.length,
      cellAspect: 2 / 3,
      pinHeader: true,
      scrollKey: _tab,
      header: TvGridHeader(
        title: queue ? l.webRequestsTitle : l.webAskMineTitle,
        detail: null,
        controls: [
          TvMemoryRow(
            memory: _memory,
            row: _Rows.tabs,
            child: Row(
              mainAxisSize: MainAxisSize.min,
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
                // In the tabs' row, so Right from the last tab reaches it.
                if (all)
                  TvButton(
                    label: l.webRequestsAddAll(cards.length),
                    icon: Lucide.listChecks,
                    focusNode: _memory.node(_Rows.tabs, _Rows.addAll),
                    onPressed: () => unawaited(
                      ref.read(requestsProvider.notifier).answerAll(l, [
                        for (final card in cards) ?card.queued,
                      ], undo: false),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
      line: TvFocusLine(_focused),
      lineHeight: tvFocusLineHeight,
      onNearEnd: body.more,
      footer: body.footer,
      itemBuilder: (context, index) {
        final card = cards[index];
        return KeyedSubtree(
          key: ValueKey(card.id),
          child: _edges(
            index,
            card.focused(_memory.node(TvGrid.row, card.id), _focus),
          ),
        );
      },
    );
    // Wrapped whatever the state, so the grid keeps its place as a list
    // loads.
    return FollowTitles(
      titles: body.followed ?? FollowedTitles(const []),
      child: grid,
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
      return _Body.notice(
        TvNotice(
          headline: l.askedLoadFailed,
          message: describeFailure(l, error),
          onRetry: notifier.retry,
          retryLabel: l.commonRetry,
        ),
      );
    }
    if (!pages.loaded) return const _Body.loading();
    if (items.isEmpty) {
      return _Body.notice(
        TvNotice(
          headline: _tab == MineFilter.inProgress
              ? l.webAskMineEmptyInProgress
              : l.webAskMineEmpty,
          message: _tab == MineFilter.inProgress ? null : l.webAskMineEmptyHint,
        ),
      );
    }
    return _Body.cards(
      l,
      [for (final item in items) TvRequestPoster.mine(item, width: null)],
      done: pages.done,
      error: error,
      onMore: notifier.more,
      onRetry: notifier.retry,
      followed: FollowedTitles([
        for (final item in items)
          CatalogInput(ref: item.title.ref, libraryId: item.library.id),
      ]),
    );
  }

  /// One of the queue's lists: the first three live, Done a page at a time.
  _Body _queueBody(AppLocalizations l) {
    final state = ref.watch(requestsProvider);
    final queue = state.queue;
    if (_tab == QueueList.done) return _doneBody(l);
    if (queue == null) {
      if (state.queueFailed) {
        return _Body.notice(
          TvNotice(
            headline: l.requestsLoadFailed,
            onRetry: () => ref.read(requestsProvider.notifier).retryQueue(),
            retryLabel: l.commonRetry,
          ),
        );
      }
      return const _Body.loading();
    }
    final rows = switch (_tab) {
      QueueList.waiting => queue.waiting,
      QueueList.needsAttention => queue.needsAttention,
      _ => queue.onTheWay,
    };
    return _queueCards(l, [
      for (final item in rows)
        if (!state.held.contains(item.id)) item,
    ], done: true);
  }

  _Body _doneBody(AppLocalizations l) {
    final pages = ref.watch(doneRequestsProvider);
    final notifier = ref.read(doneRequestsProvider.notifier);
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final error = pages.error;
    if (!pages.loaded) {
      if (error != null) {
        return _Body.notice(
          TvNotice(
            headline: l.requestsLoadFailed,
            message: describeFailure(l, error),
            onRetry: notifier.retry,
            retryLabel: l.commonRetry,
          ),
        );
      }
      return const _Body.loading();
    }
    return _queueCards(
      l,
      [
        for (final item in pages.items)
          if (!held.contains(item.id)) item,
      ],
      done: pages.done,
      error: error,
      onMore: notifier.more,
      onRetry: notifier.retry,
      // Done is read page by page, so an answered one leaves it here.
      onAnswered: (item) => notifier.drop(item.id),
    );
  }

  _Body _queueCards(
    AppLocalizations l,
    List<AdminRequestItem> items, {
    required bool done,
    Object? error,
    VoidCallback? onMore,
    VoidCallback? onRetry,
    ValueChanged<AdminRequestItem>? onAnswered,
  }) {
    final list = _tab;
    if (items.isEmpty) {
      return _Body.notice(TvNotice(headline: queueEmptyLabel(list, l)));
    }
    return _Body.cards(
      l,
      [
        for (final item in items)
          TvRequestPoster.queued(
            item,
            list: list,
            width: null,
            onAnswered: onAnswered == null ? null : () => onAnswered(item),
          ),
      ],
      done: done,
      error: error,
      onMore: onMore,
      onRetry: onRetry,
    );
  }
}

/// What a list shows: its cards, with what goes under them and asks for
/// more, or a notice in their place; [settled] once it's said what it has.
class _Body {
  /// [cards] of a list, with a spinner under them while a page comes, or
  /// why one didn't, with Try again.
  _Body.cards(
    AppLocalizations l,
    this.cards, {
    required bool done,
    Object? error,
    VoidCallback? onMore,
    VoidCallback? onRetry,
    this.followed,
  }) : settled = true,
       more = done || error != null ? null : onMore,
       footer = done
           ? null
           : error == null
           ? const TvLoading(size: 28, top: 16)
           : TvNotice(
               headline: l.listMoreFailed,
               message: describeFailure(l, error),
               onRetry: onRetry,
               retryLabel: l.commonRetry,
               top: 8,
             );

  const _Body.notice(Widget this.footer)
    : cards = const [],
      settled = true,
      more = null,
      followed = null;

  const _Body.loading()
    : cards = const [],
      footer = const TvLoading(top: 76),
      settled = false,
      more = null,
      followed = null;

  final List<TvRequestPoster> cards;
  final Widget? footer;
  final VoidCallback? more;
  final FollowedTitles? followed;
  final bool settled;
}

// ---------------------------------------------------------------------------
// A request's card.

/// A request as a poster with its state in the corner, in Discover's
/// Requests row and the requests page's grid: one of the queue's in
/// [list], or one of the viewer's own. Focus tells [onFocus] its name and
/// what its list says of it; Select offers what can be done about it.
class TvRequestPoster extends ConsumerWidget {
  const TvRequestPoster.queued(
    AdminRequestItem this.queued, {
    super.key,
    this.list = QueueList.waiting,
    this.onAnswered,
    this.width = TvCards.posterWidth,
    this.focusNode,
    this.onFocus,
  }) : mine = null;

  const TvRequestPoster.mine(
    RequestItem this.mine, {
    super.key,
    this.width = TvCards.posterWidth,
    this.focusNode,
    this.onFocus,
  }) : queued = null,
       list = QueueList.waiting,
       onAnswered = null;

  const TvRequestPoster._({
    super.key,
    required this.queued,
    required this.mine,
    required this.list,
    required this.onAnswered,
    required this.width,
    required this.focusNode,
    required this.onFocus,
  });

  final AdminRequestItem? queued;
  final RequestItem? mine;

  /// The queue's list [queued] is in.
  final String list;

  /// Runs once an answer is given, as one leaving Done.
  final VoidCallback? onAnswered;

  /// A row's card width; null fills a grid's cell.
  final double? width;
  final FocusNode? focusNode;
  final ValueChanged<FocusedItem>? onFocus;

  /// The request's id.
  String get id => queued?.id ?? mine!.id;

  /// This card with [node], telling [onFocus] what it is.
  TvRequestPoster focused(FocusNode node, ValueChanged<FocusedItem> onFocus) =>
      TvRequestPoster._(
        key: key,
        queued: queued,
        mine: mine,
        list: list,
        onAnswered: onAnswered,
        width: width,
        focusNode: node,
        onFocus: onFocus,
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final onFocus = this.onFocus;
    if (queued case final item?) {
      final title = item.title;
      final state = ref.watch(requestsProvider);
      final facts = [
        yearKind(title.year, title.ref.kind, l),
        ?scopeText(item.scope, l),
        queueStatusText(state, item, list, l),
        // Waiting's status starts with who asked; the rest say it after.
        if (list != QueueList.waiting) ...askedText(item, l),
      ].where((fact) => fact.isNotEmpty).toList();
      return TvPosterCard(
        name: title.name,
        poster: title.poster,
        width: width,
        focusNode: focusNode,
        label: [title.name, ...facts].join(', '),
        corner: CatalogBadge(availability: item.availability, size: 28),
        onPressed: () => unawaited(
          openTvQueued(context, item, list, onAnswered: onAnswered),
        ),
        onFocused: onFocus == null
            ? null
            : () => onFocus(FocusedItem(name: title.name, facts: facts)),
      );
    }
    final item = mine!;
    final title = item.title;
    final now = liveAvailability(ref, title.ref, item.availability);
    final shown = item.season?.asTitle() ?? now;
    final facts = [
      yearKind(title.year, title.ref.kind, l),
      ?scopeText(item.scope, l),
      mineStateText(item, now, l),
      ?declinedText(now, l),
    ].where((fact) => fact.isNotEmpty).toList();
    return TvPosterCard(
      name: title.name,
      poster: title.poster,
      width: width,
      focusNode: focusNode,
      label: [title.name, ...facts].join(', '),
      corner: CatalogBadge(availability: shown, size: 28),
      onPressed: () => unawaited(openTvMine(context, item)),
      onFocused: onFocus == null
          ? null
          : () => onFocus(FocusedItem(name: title.name, facts: facts)),
    );
  }
}
