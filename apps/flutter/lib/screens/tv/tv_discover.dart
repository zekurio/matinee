import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import '../requests/discover.dart';
import '../requests/request_sheet.dart' show hiddenRecommendationsProvider;
import '../requests/request_words.dart';
import '../requests/requests_data.dart';
import '../requests/requests_hub.dart';
import '../requests/requests_rail.dart' show DiscoverRequests;
import 'tv_catalog.dart';
import 'tv_home.dart' show TvPageMessage, TvRowNotice;
import 'tv_media.dart';
import 'tv_requests.dart';
import 'tv_shell.dart' show TvBackdrop;

/// Discover on a TV, from the drawer: rows as Home has them, Recent requests
/// first, then the server's rows in its order, each loading on its own.

/// The rows of the page in its focus memory.
abstract final class _Rows {
  static const requests = 'requests';
  static const failed = 'failed';
  static const empty = 'empty';
  static const seeAll = 'see-all';
  static const search = 'search';
  static String rail(DiscoverRail rail) => 'rail-${railKey(rail)}';
}

const _posterHeight = TvCards.posterWidth * 1.5;

/// Recent requests' See all card, as tall as the request cards beside it.
const _seeAllWidth = 140.0;

/// Above the focused card in the rows: the list's top padding, a row's
/// heading, and the gap under it.
const _rowPivot = 12 + TvCards.titleHeight + TvCards.titleGap;

/// Fetch again on return after this long.
const _refreshAfter = Duration(minutes: 5);

/// Discover's page: its name and the focused card's name over its
/// backdrop, and under them Recent requests, the latest of everyone's for
/// whoever runs the queue or the viewer's own, whichever the server names,
/// each card with its state, then the server's rows. Recent requests ends
/// in a See all card that opens the overview, and shows whenever it has a
/// card. A row that failed says so with Try again; several say it once.
/// Recommended titles offer "Not interested" on a long press, and each row
/// that's the start of a browse ends in a See all card that opens it with
/// the row's filters and sort. Focus starts on the first card of the first
/// row; the header has nothing to focus, so Up from there stays.
class TvDiscoverScreen extends ConsumerStatefulWidget {
  const TvDiscoverScreen({super.key});

  @override
  ConsumerState<TvDiscoverScreen> createState() => _TvDiscoverScreenState();
}

class _TvDiscoverScreenState extends ConsumerState<TvDiscoverScreen> {
  final _memory = TvFocusMemory();
  FocusedItem? _focused;
  var _fetched = DateTime.now();

  /// Each row's first card, for focus the first time.
  final _firsts = <String, String>{};

  @override
  void dispose() {
    _memory.dispose();
    super.dispose();
  }

  /// What the line over the rows names: [item], or nothing for a See all
  /// card, whose row's heading is just under it.
  void _focus(FocusedItem? item) {
    if (identical(item, _focused)) return;
    setState(() => _focused = item);
  }

  void _retryAll(List<DiscoverRail> rails) {
    ref.invalidate(discoverRailsProvider);
    for (final rail in rails) {
      ref.invalidate(discoverRowProvider(RowKey(rail)));
    }
  }

  void _returned() {
    final now = DateTime.now();
    if (now.difference(_fetched) < _refreshAfter) return;
    _fetched = now;
    ref
      ..invalidate(discoverRailsProvider)
      ..invalidate(discoverRowProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final discover = ref.watch(discoverRailsProvider);
    final value = discover.value;
    final on = value?.enabled == true;
    final rails = on ? value!.rails : const <DiscoverRail>[];
    final loads = {
      for (final rail in rails)
        railKey(rail): ref.watch(discoverRowProvider(RowKey(rail))),
    };
    final hidden = ref.watch(hiddenRecommendationsProvider);
    final failed = [
      for (final rail in rails)
        if (loads[railKey(rail)]!.hasError && !loads[railKey(rail)]!.isLoading)
          rail,
    ];
    final which = on ? value!.requests : null;
    final requests = _requestsRow(l, which);
    final rows = <(String, Widget)>[?requests.row];

    Widget? message;
    if (discover.hasError && !discover.isLoading && value == null) {
      message = TvPageMessage(
        title: l.discoverFailed,
        message: describeFailure(l, discover.error!),
        onRetry: () => _retryAll(rails),
      );
    } else if (value != null && !value.enabled) {
      message = TvPageMessage(
        title: l.webDiscoverOff,
        message: l.webDiscoverOffHint,
      );
    } else if (rails.isNotEmpty && failed.length == rails.length) {
      if (requests.row == null) {
        message = TvPageMessage(
          title: l.discoverFailed,
          message: l.webDiscoverFailedHint,
          onRetry: () => _retryAll(rails),
        );
      } else {
        rows.add((
          _Rows.failed,
          TvRowNotice(
            headline: l.discoverFailed,
            message: l.webDiscoverFailedHint,
            onRetry: () => _retryAll(rails),
            retryNode: _memory.node(_Rows.failed, TvRowNotice.retryKey),
          ),
        ));
      }
    } else if (rails.isNotEmpty &&
        rails.every(
          (rail) => switch (loads[railKey(rail)]!.value) {
            final row? => railShown(rail, row, hidden).isEmpty,
            null => false,
          },
        )) {
      rows.add((_Rows.empty, _Empty(memory: _memory)));
    } else {
      // Several rows that failed say so once, rather than as a stack of
      // notices.
      final many = failed.length > 1;
      if (many) {
        rows.add((
          _Rows.failed,
          TvRowNotice(
            headline: l.webDiscoverRailsFailed(failed.length),
            onRetry: () {
              for (final rail in failed) {
                ref.invalidate(discoverRowProvider(RowKey(rail)));
              }
            },
            retryNode: _memory.node(_Rows.failed, TvRowNotice.retryKey),
          ),
        ));
      }
      for (final rail in rails) {
        if (many && failed.contains(rail)) continue;
        if (_railRow(l, rail, loads[railKey(rail)]!, hidden) case final row?) {
          rows.add((_Rows.rail(rail), row));
        }
      }
    }
    final order = [for (final (key, _) in rows) key];
    for (final key in _firsts.keys.toList()) {
      if (!order.contains(key)) _firsts.remove(key);
    }
    _memory.restore(context, () {
      // The Requests row shows only once loaded, and the rows once the
      // server named them, so wait for both: focus taken sooner would sit
      // in a row they then push down.
      if (discover.isLoading && value == null) return null;
      if (!requests.settled) return null;
      if (message != null) return null;
      if (_firsts[_memory.lastRow] case final first?) {
        return (_memory.lastRow!, first);
      }
      // The first row with a card, once every row above it has loaded:
      // focus taken in a later one would sit under a row that then
      // arrives above it.
      if (_firsts[_Rows.requests] case final first?) {
        return (_Rows.requests, first);
      }
      for (final rail in rails) {
        final key = _Rows.rail(rail);
        if (_firsts[key] case final first?) return (key, first);
        final load = loads[railKey(rail)]!;
        if (load.isLoading && !load.hasValue) return null;
      }
      for (final row in order) {
        if (_firsts[row] case final first?) return (row, first);
      }
      return null;
    });
    final stale = loads.values.any((load) => load.value?.stale ?? false);
    // Library cards play; only the rest can change.
    final followed = FollowedTitles([
      for (final rail in rails)
        if (loads[railKey(rail)]!.value case final row?)
          for (final item in railShown(rail, row, hidden))
            if (item.title == null) CatalogInput(ref: item.ref),
    ]);
    return ReturnWatcher(
      path: Routes.discover,
      onReturn: _returned,
      child: FollowTitles(
        titles: followed,
        child: TvBackdrop(
          sources: _focused?.backdrop ?? const [],
          child:
              message ??
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      start: TvPage.start,
                      end: TvPage.end + TvGrid.clockRoom,
                      top: TvGrid.top,
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      spacing: 16,
                      children: [
                        Text(
                          l.webDiscoverTitle,
                          style: TvType.headline.style(
                            color: colors.foreground,
                          ),
                        ),
                        if (stale)
                          Flexible(
                            child: Text(
                              l.webDiscoverStale,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TvType.caption.style(
                                color: colors.mutedForeground,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      start: TvPage.start,
                      end: TvPage.end,
                      top: TvGrid.lineGap,
                    ),
                    child: TvFocusLine(_focused),
                  ),
                  Expanded(
                    child: discover.isLoading && value == null
                        ? const TvLoading(top: 48)
                        : TvPinnedList(
                            pivot: _rowPivot,
                            fade: 12,
                            children: [
                              for (final (key, row) in rows)
                                KeyedSubtree(key: ValueKey(key), child: row),
                            ],
                          ),
                  ),
                ],
              ),
        ),
      ),
    );
  }

  /// The overview for [which], as `discover.rails` names it: everyone's
  /// requests, or the viewer's own.
  String _requestsRoute(String? which) =>
      which == DiscoverRequests.queue ? Routes.requestQueue : Routes.requests();

  /// Recent requests for [which], as `discover.rails` names it, and
  /// whether it's said what it has: nothing while its list loads, or once
  /// no card is left. For whoever runs the queue, the latest of it in every
  /// state, in the order the shared code gives; for anyone else, what
  /// `requests.mineLive` sends, in its order. What's held for an answer is
  /// out of it.
  ({(String, Widget)? row, bool settled}) _requestsRow(
    AppLocalizations l,
    String? which,
  ) {
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final List<(String, TvRequestCard Function(FocusNode))>? items;
    final Object? error;
    final VoidCallback retry;
    switch (which) {
      case DiscoverRequests.queue:
        final queue = ref.watch(
          requestsProvider.select((state) => state.queue),
        );
        final down = ref.watch(
          requestsProvider.select((state) => state.queueFailed),
        );
        items = queue == null
            ? null
            : [
                for (final entry in queueInOrder(queue, held: held))
                  (
                    entry.item.id,
                    (node) => TvRequestCard.queued(
                      entry,
                      focusNode: node,
                      onFocus: _focus,
                    ),
                  ),
              ];
        error = down && queue == null ? const _QueueDown() : null;
        retry = () => ref.read(requestsProvider.notifier).retryQueue();
      case DiscoverRequests.mine:
        final mine = ref.watch(myLiveRequestsProvider);
        items = mine.value == null
            ? null
            : [
                for (final item in mine.value!.items)
                  if (!held.contains(item.id))
                    (
                      item.id,
                      (node) => TvRequestCard.mine(
                        item,
                        focusNode: node,
                        onFocus: _focus,
                      ),
                    ),
              ];
        error = mine.hasError && !mine.hasValue ? mine.error : null;
        retry = () => ref.invalidate(myLiveRequestsProvider);
      default:
        _firsts.remove(_Rows.requests);
        return (row: null, settled: true);
    }
    final title = l.requestsRecent;
    final route = _requestsRoute(which);
    if (error != null) {
      _firsts.remove(_Rows.requests);
      return (
        row: (
          _Rows.requests,
          TvRowNotice(
            title: title,
            headline: l.webDiscoverRailFailed,
            message: error is _QueueDown ? null : describeFailure(l, error),
            onRetry: retry,
            retryNode: _memory.node(_Rows.requests, TvRowNotice.retryKey),
            height: TvInfoCards.height,
          ),
        ),
        settled: true,
      );
    }
    if (items == null) return (row: null, settled: false);
    final shown = items.take(recentRequests).toList();
    if (shown.isEmpty) {
      _firsts.remove(_Rows.requests);
      return (row: null, settled: true);
    }
    _firsts[_Rows.requests] = shown.first.$1;
    return (
      row: (
        _Rows.requests,
        TvRow(
          title: title,
          row: _Rows.requests,
          memory: _memory,
          height: TvInfoCards.height,
          itemCount: shown.length + 1,
          itemBuilder: (context, index) {
            if (index == shown.length) {
              return TvSeeAllCard(
                label: l.commonSeeAll,
                detail: title,
                width: _seeAllWidth,
                aspect: _seeAllWidth / TvInfoCards.height,
                focusNode: _memory.node(_Rows.requests, _Rows.seeAll),
                onFocused: () => _focus(null),
                onPressed: () => context.push(route),
              );
            }
            final (id, card) = shown[index];
            return KeyedSubtree(
              key: ValueKey(id),
              child: card(_memory.node(_Rows.requests, id)),
            );
          },
        ),
      ),
      settled: true,
    );
  }

  /// One of the server's rows: a spinner while it loads, why it failed
  /// with Try again, nothing when every title in it was left out, else its
  /// cards and the See all card for a row that's the start of a browse.
  Widget? _railRow(
    AppLocalizations l,
    DiscoverRail rail,
    AsyncValue<DiscoverRow> load,
    Set<String> hidden,
  ) {
    final key = _Rows.rail(rail);
    final title = railName(rail, l);
    final row = load.value;
    if (row == null) {
      _firsts.remove(key);
      if (load.hasError && !load.isLoading) {
        return TvRowNotice(
          title: title,
          headline: l.webDiscoverRailFailed,
          message: describeFailure(l, load.error!),
          onRetry: () => ref.invalidate(discoverRowProvider(RowKey(rail))),
          retryNode: _memory.node(key, TvRowNotice.retryKey),
          height: _posterHeight,
        );
      }
      return TvRowNotice(title: title, height: _posterHeight);
    }
    final items = railShown(rail, row, hidden);
    if (items.isEmpty) {
      _firsts.remove(key);
      return null;
    }
    _firsts[key] = refKey(items.first.ref);
    final browse = rail.browse;
    final recommended = recommendedRail(rail);
    // A row of one kind says only the year; one that holds both, or a
    // recommendation's without a browse, names each card's kind.
    final named = browse == null || browse.kinds.length > 1;
    return TvRow(
      title: title,
      row: key,
      memory: _memory,
      height: _posterHeight,
      itemCount: items.length + (browse == null ? 0 : 1),
      itemBuilder: (context, index) {
        if (index == items.length) {
          return TvSeeAllCard(
            label: l.commonSeeAll,
            detail: title,
            focusNode: _memory.node(key, _Rows.seeAll),
            onFocused: () => _focus(null),
            onPressed: () => context.push(
              Routes.catalogBrowse(
                browse!.kinds.firstOrNull ?? TitleKind.movie,
                filters: jsonEncode(browse.filters.toJson()),
                sort: browse.sort,
              ),
            ),
          );
        }
        final item = items[index];
        return TvCatalogPoster.browse(
          item,
          key: ValueKey(refKey(item.ref)),
          named: named,
          focusNode: _memory.node(key, refKey(item.ref)),
          onFocus: _focus,
          onLongPress: recommended
              ? () => unawaited(
                  showTvNotInterested(
                    context,
                    CatalogTitleSummary(
                      ref: item.ref,
                      name: item.name,
                      year: item.year,
                      poster: item.poster,
                      availability: item.availability,
                    ),
                  ),
                )
              : null,
        );
      },
    );
  }
}

/// Why the admin's row has no cards, which says nothing more.
final class _QueueDown implements Exception {
  const _QueueDown();
}

/// Discover has nothing to suggest: why, and Search, which finds the rest.
class _Empty extends StatelessWidget {
  const _Empty({required this.memory});

  final TvFocusMemory memory;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: TvPage.start,
        end: TvPage.end,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l.webDiscoverEmpty,
            style: TvType.headline.style(color: colors.foreground),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              l.webDiscoverEmptyHint,
              style: TvType.body.style(color: colors.mutedForeground),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 24),
            child: TvMemoryRow(
              memory: memory,
              row: _Rows.empty,
              child: TvButton(
                label: l.searchTitle,
                icon: Lucide.search,
                focusNode: memory.node(_Rows.empty, _Rows.search),
                onPressed: () => context.go(Routes.search),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
