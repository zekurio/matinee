import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../query/server_data.dart';
import 'list_choices.dart';

/// What Shows, Movies, and Browse read: a page of titles at a time from
/// `titles.browse`, which takes the kind across every library, or one
/// library, with the filters and the order; and what each filter offers
/// from `titles.filterOptions`.

/// The titles a filter's choices are drawn from, as the contract's
/// `TitleScope`.
typedef FilterScope = ({
  String? libraryId,
  String? kind,
  String? genre,
  String? studio,
});

final filterOptionsProvider = serverQueryFamily(
  (api, FilterScope scope) => api.titles.filterOptions(
    libraryId: scope.libraryId,
    kind: scope.kind,
    genre: scope.genre,
    studio: scope.studio,
  ),
);

/// One list as the server is asked for it.
@immutable
final class TitleListRequest {
  const TitleListRequest({
    this.kind,
    this.libraryId,
    this.genre,
    this.studio,
    required this.sort,
    this.order,
    required this.filters,
    this.query,
  });

  final String? kind;
  final String? libraryId;
  final String? genre;
  final String? studio;
  final String sort;

  /// Null for the server's own order for [sort].
  final String? order;
  final ListFilters filters;

  /// What a search typed, as the TV's Movies and Shows narrow by.
  final String? query;

  @override
  bool operator ==(Object other) =>
      other is TitleListRequest &&
      other.kind == kind &&
      other.libraryId == libraryId &&
      other.genre == genre &&
      other.studio == studio &&
      other.sort == sort &&
      other.order == order &&
      other.filters == filters &&
      other.query == query;

  @override
  int get hashCode =>
      Object.hash(kind, libraryId, genre, studio, sort, order, filters, query);
}

/// The titles loaded so far, and how the next page is going.
@immutable
final class TitlePagesState {
  const TitlePagesState({
    this.items = const [],
    this.total,
    this.kinds,
    this.loading = false,
    this.error,
  });

  final List<TitleSummary> items;

  /// How many match on every page; null until the first page comes.
  final int? total;

  /// How many match of each kind with the kind left out, for Browse's
  /// kind chips.
  final BrowsedTitlesKinds? kinds;
  final bool loading;

  /// Why the last page didn't come; the list waits for Try again.
  final Object? error;

  bool get done {
    final total = this.total;
    return total != null && items.length >= total;
  }
}

/// How many titles a page asks for, as the web's and the Kotlin app's.
const titlePageSize = 60;

/// The most the contract lets one page hold.
const _largestPage = 200;

/// A list the server hands out a page at a time, as the Kotlin app's
/// `TitlePages`. The first page loads at once; [more] asks for the next,
/// and does nothing while one is coming, after the last, or after a
/// failure, which waits for [retry].
final class TitlePages extends Notifier<TitlePagesState> {
  TitlePages(this.request);

  final TitleListRequest request;
  MatineeApi? _api;

  /// Bumped by [refresh], so an answer for what it replaced is dropped.
  int _generation = 0;
  bool _refreshing = false;

  @override
  TitlePagesState build() {
    final api = _api = ref.watch(apiProvider);
    _refreshing = false;
    if (api == null) return const TitlePagesState(error: NotConnected());
    unawaited(_load(++_generation, 0));
    return const TitlePagesState(loading: true);
  }

  Future<BrowsedTitles> _page(int offset, int limit) => _api!.titles.browse(
    query: request.query,
    kind: request.kind,
    libraryId: request.libraryId,
    filters: request.filters.toApi(
      genre: request.genre,
      studio: request.studio,
    ),
    sort: request.sort,
    order: request.order,
    limit: limit,
    offset: offset,
  );

  /// Asks for the page at [offset], after what's loaded. Called from
  /// build too, so it changes nothing before the answer comes.
  Future<void> _load(int generation, int offset) async {
    try {
      final page = await _page(offset, titlePageSize);
      if (!ref.mounted || generation != _generation) return;
      // Titles can shift between pages as the library changes; one that
      // moved onto this page from the last isn't shown twice.
      final seen = {for (final title in state.items) title.id};
      state = TitlePagesState(
        items: [
          ...state.items,
          for (final title in page.items)
            if (seen.add(title.id)) title,
        ],
        // An empty page ends the list even if the count said more.
        total: page.items.isEmpty ? state.items.length : page.total,
        kinds: page.kinds,
      );
    } on Object catch (cause) {
      if (!ref.mounted || generation != _generation) return;
      state = TitlePagesState(
        items: state.items,
        total: state.total,
        kinds: state.kinds,
        error: cause,
      );
    }
  }

  void more() {
    final now = state;
    if (now.loading || now.done || now.error != null || _refreshing) return;
    if (_api == null) return;
    state = TitlePagesState(
      items: now.items,
      total: now.total,
      kinds: now.kinds,
      loading: true,
    );
    unawaited(_load(_generation, now.items.length));
  }

  /// After a failure, asks for the page again.
  void retry() {
    final now = state;
    if (now.error == null || _api == null) return;
    if (now.items.isEmpty) {
      ref.invalidateSelf();
      return;
    }
    state = TitlePagesState(
      items: now.items,
      total: now.total,
      kinds: now.kinds,
    );
    more();
  }

  /// Fetches again what's loaded, keeping it on screen until the new
  /// pages come, so the grid stays where it was: marks and new titles show
  /// without starting over. A failure leaves what's there.
  Future<void> refresh() async {
    final now = state;
    if (_api == null || _refreshing) return;
    if (now.items.isEmpty) {
      if (!now.loading) ref.invalidateSelf();
      return;
    }
    if (now.loading) return;
    _refreshing = true;
    final generation = ++_generation;
    final wanted = math.max(now.items.length, titlePageSize);
    final items = <TitleSummary>[];
    final seen = <String>{};
    BrowsedTitles? last;
    try {
      while (items.length < wanted) {
        final page = await _page(
          items.length,
          math.min(_largestPage, wanted - items.length),
        );
        if (!ref.mounted || generation != _generation) return;
        last = page;
        items.addAll([
          for (final title in page.items)
            if (seen.add(title.id)) title,
        ]);
        if (page.items.isEmpty || items.length >= page.total) break;
      }
      state = TitlePagesState(
        items: items,
        total: last == null || last.items.isEmpty ? items.length : last.total,
        kinds: last?.kinds ?? now.kinds,
      );
    } on Object {
      // Kept as it was: the grid has titles, and the next return tries again.
    } finally {
      if (ref.mounted && generation == _generation) _refreshing = false;
    }
  }
}

/// A list's pages, for as long as a screen shows that list: other choices
/// are another list, and this one goes once nothing watches it.
final titlePagesProvider = NotifierProvider.autoDispose
    .family<TitlePages, TitlePagesState, TitleListRequest>(TitlePages.new);
