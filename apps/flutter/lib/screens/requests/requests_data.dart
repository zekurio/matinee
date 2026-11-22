import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../query/server_data.dart';
import '../title/title_data.dart' show titleProvider;
import 'request_words.dart';
import 'requests_hub.dart';

/// What Explore, the catalog's pages, and the requests page read. Each read
/// that holds a request's state fetches again when an ask, a cancel, or an
/// answer moves [requestsVersionProvider], including while its page is covered.

/// A catalog title as a route names it, and the library it's opened for.
typedef CatalogKey = ({
  String kind,
  String provider,
  String providerId,
  String? libraryId,
});

CatalogRef refOf(CatalogKey key) => CatalogRef(
  kind: key.kind,
  provider: key.provider,
  providerId: key.providerId,
);

CatalogKey keyOf(CatalogRef ref, {String? libraryId}) => (
  kind: ref.kind,
  provider: ref.provider,
  providerId: ref.providerId,
  libraryId: libraryId,
);

/// Whether Discover is on for this viewer, its rows, and the kinds it
/// browses.
final discoverRailsProvider = serverQuery((api) => api.discover.rails());

/// Tells rows apart, for keys and their reads: there can be several
/// "Because you watched".
String railKey(DiscoverRail rail) => switch (rail.seed) {
  final seed? => '${rail.id}:${refKey(seed.ref)}',
  null => rail.id,
};

/// One Discover row, equal by [railKey].
@immutable
final class RowKey {
  const RowKey(this.rail);

  final DiscoverRail rail;

  @override
  bool operator ==(Object other) =>
      other is RowKey && railKey(other.rail) == railKey(rail);

  @override
  int get hashCode => railKey(rail).hashCode;
}

/// The first page of a Discover row.
final discoverRowProvider = serverQueryFamily(
  (api, RowKey key) => api.discover.row(id: key.rail.id, seed: key.rail.seed),
);

/// What the catalog found for a text, apart from the library's search.
final catalogSearchProvider = serverQueryFamily(
  (api, String text) => api.catalog.search(query: text),
);

/// A catalog title's page.
final catalogDetailsProvider = FutureProvider.autoDispose
    .family<CatalogTitleDetail, CatalogKey>((ref, key) {
      ref.watch(requestsVersionProvider);
      return serverApi(ref).catalog
          .details(CatalogInput(ref: refOf(key), libraryId: key.libraryId));
    }, retry: (_, _) => null);

/// The rows related to a catalog title, or a library title the server
/// matched.
final relatedRailsProvider = serverQueryFamily(
  (api, CatalogKey key) => api.catalog.related(
    CatalogInput(ref: refOf(key), libraryId: key.libraryId),
  ),
);

final relatedTitlesProvider = serverQueryFamily(
  (api, ({CatalogKey key, String rail}) row) => api.catalog.relatedTitles(
    ref: refOf(row.key),
    libraryId: row.key.libraryId,
    rail: row.rail,
  ),
);

/// What each filter of a catalog browse offers, for a kind.
final browseOptionsProvider = serverQueryFamily(
  (api, String kind) => api.discover.browseOptions(kind: kind),
);

/// How often, and how far apart, a failed load of a show's gaps tries
/// again: a title that just arrived may not be matched to its provider yet.
const _gapRetries = 3;
const _gapRetryStep = Duration(seconds: 5);

/// What the server lacks of a show in the library, as its provider lists
/// it. A failed load tries again a few times, and when one of those
/// succeeds the title is fetched again too, which has its details by then.
/// Null when the provider can't say, so the page shows only what's here.
final showGapsProvider = FutureProvider.autoDispose
    .family<CatalogMissingSeasonsOutput?, String>((ref, titleId) async {
      ref.watch(requestsVersionProvider);
      final api = serverApi(ref);
      for (var failures = 0; ; failures++) {
        try {
          final gaps = await api.catalog.missingSeasons(titleId: titleId);
          if (failures > 0 && ref.mounted) {
            ref.invalidate(titleProvider(titleId));
          }
          return gaps;
        } on Object {
          if (failures >= _gapRetries || !ref.mounted) return null;
          // A wait the page's leaving cuts short.
          final waited = Completer<void>();
          final timer = Timer(_gapRetryStep * (failures + 1), waited.complete);
          ref.onDispose(() {
            timer.cancel();
            if (!waited.isCompleted) waited.complete();
          });
          await waited.future;
          if (!ref.mounted) return null;
        }
      }
    }, retry: (_, _) => null);

/// A page at a time of a list the server pages by cursor.
@immutable
final class CursorPages<T> {
  const CursorPages({
    this.items = const [],
    this.cursor,
    this.loaded = false,
    this.done = false,
    this.loading = false,
    this.error,
  });

  final List<T> items;
  final String? cursor;

  /// The first page came.
  final bool loaded;

  /// The last page came.
  final bool done;
  final bool loading;

  /// Why the last page didn't come; the list waits for [retry].
  final Object? error;
}

/// A list paged by cursor, the first page at once, the next on [more].
abstract class CursorList<T> extends Notifier<CursorPages<T>> {
  MatineeApi? _api;
  int _generation = 0;

  Future<(List<T>, String?)> page(MatineeApi api, String? cursor);
  String id(T item);

  /// What moves the list back to its first page.
  void watch() {}

  @override
  CursorPages<T> build() {
    watch();
    final api = _api = ref.watch(apiProvider);
    if (api == null) return const CursorPages(error: NotConnected());
    unawaited(_load(++_generation, null, const []));
    return const CursorPages(loading: true);
  }

  Future<void> _load(int generation, String? cursor, List<T> before) async {
    try {
      final (items, next) = await page(_api!, cursor);
      if (!ref.mounted || generation != _generation) return;
      final seen = {for (final item in before) id(item)};
      state = CursorPages(
        items: [
          ...before,
          for (final item in items)
            if (seen.add(id(item))) item,
        ],
        cursor: next,
        loaded: true,
        done: next == null,
      );
    } on Object catch (cause) {
      if (!ref.mounted || generation != _generation) return;
      state = CursorPages(
        items: before,
        cursor: state.cursor,
        loaded: state.loaded,
        error: cause,
      );
    }
  }

  void more() {
    final now = state;
    if (now.loading || now.done || now.error != null || _api == null) return;
    state = CursorPages(
      items: now.items,
      cursor: now.cursor,
      loaded: now.loaded,
      loading: true,
    );
    unawaited(_load(_generation, now.cursor, now.items));
  }

  void retry() {
    final now = state;
    if (now.error == null) return;
    if (!now.loaded) {
      ref.invalidateSelf();
      return;
    }
    state = CursorPages(items: now.items, cursor: now.cursor, loaded: true);
    more();
  }

  /// Takes [itemId] out of the list, as an answered request out of Done.
  void drop(String itemId) {
    final now = state;
    state = CursorPages(
      items: [
        for (final item in now.items)
          if (id(item) != itemId) item,
      ],
      cursor: now.cursor,
      loaded: now.loaded,
      done: now.done,
      loading: now.loading,
      error: now.error,
    );
  }
}

/// What the viewer asked for: on its way and lately come or answered
/// (`inProgress`), or all of it.
abstract final class MineFilter {
  static const inProgress = 'inProgress';
  static const all = 'all';
}

final class MyRequests extends CursorList<RequestItem> {
  MyRequests(this.filter);

  /// A [MineFilter].
  final String filter;

  @override
  void watch() => ref.watch(requestsVersionProvider);

  @override
  Future<(List<RequestItem>, String?)> page(
    MatineeApi api,
    String? cursor,
  ) async {
    final page = await api.requests.mine(
      cursor: cursor,
      limit: 40,
      filter: filter,
    );
    return (page.items, page.nextCursor);
  }

  @override
  String id(RequestItem item) => item.id;
}

final myRequestsProvider = NotifierProvider.autoDispose
    .family<MyRequests, CursorPages<RequestItem>, String>(MyRequests.new);

/// The profile's "My requests": the latest of everything the viewer asked for.
/// Fetched again when an ask, a cancel, or an answer changes it.
final profileAskedProvider = FutureProvider.autoDispose<RequestPage>((ref) {
  ref.watch(requestsVersionProvider);
  return serverApi(ref).requests.mine(limit: 24, filter: MineFilter.all);
}, retry: (_, _) => null);

/// An admin's Done, a page at a time from its own call, newest first.
final class DoneRequests extends CursorList<AdminRequestItem> {
  @override
  Future<(List<AdminRequestItem>, String?)> page(
    MatineeApi api,
    String? cursor,
  ) async {
    final page = await api.admin.requests.queue(cursor: cursor, limit: 20);
    return (page.done, page.nextCursor);
  }

  @override
  String id(AdminRequestItem item) => item.id;
}

final doneRequestsProvider =
    NotifierProvider.autoDispose<DoneRequests, CursorPages<AdminRequestItem>>(
      DoneRequests.new,
    );

/// No filters on: what a browse starts from without a row's.
const noFilters = CatalogFilters();

/// The filters as JSON, which tells two sets apart.
String filtersKey(CatalogFilters filters) => jsonEncode(filters.toJson());

/// The filters a route carries as JSON, or none when they don't parse.
CatalogFilters? parseFilters(String? json) {
  if (json == null) return null;
  try {
    return CatalogFilters.fromJson(jsonDecode(json));
  } on Object {
    return null;
  }
}

/// One catalog browse as the server is asked for it.
@immutable
final class BrowseKey {
  BrowseKey(this.kind, this.filters, this.sort)
    : _filters = filtersKey(filters);

  final String kind;
  final CatalogFilters filters;
  final String sort;
  final String _filters;

  @override
  bool operator ==(Object other) =>
      other is BrowseKey &&
      other.kind == kind &&
      other.sort == sort &&
      other._filters == _filters;

  @override
  int get hashCode => Object.hash(kind, sort, _filters);
}

/// The titles a browse has loaded so far, and how the next page is going.
@immutable
final class BrowsePagesState {
  const BrowsePagesState({
    this.items = const [],
    this.next = 1,
    this.loading = false,
    this.error,
    this.stale = false,
    this.detail,
    this.voteFloor,
  });

  final List<CatalogBrowseTitle> items;

  /// The page to ask for next; null after the last.
  final int? next;
  final bool loading;
  final Object? error;

  /// Some of it came from the server's copy while TMDB was away.
  final bool stale;

  /// What the cards say under their names, as the server says the list
  /// calls for: "score" or "releaseDate".
  final String? detail;

  /// The votes the server asks of the list while no minimum is chosen, for
  /// the filters.
  final int? voteFloor;

  BrowsePagesState copyWith({
    List<CatalogBrowseTitle>? items,
    ValueGetter<int?>? next,
    bool? loading,
    ValueGetter<Object?>? error,
    bool? stale,
    ValueGetter<String?>? detail,
    ValueGetter<int?>? voteFloor,
  }) => BrowsePagesState(
    items: items ?? this.items,
    next: next == null ? this.next : next(),
    loading: loading ?? this.loading,
    error: error == null ? this.error : error(),
    stale: stale ?? this.stale,
    detail: detail == null ? this.detail : detail(),
    voteFloor: voteFloor == null ? this.voteFloor : voteFloor(),
  );
}

/// A catalog browse, a page at a time.
final class CatalogBrowsePages extends Notifier<BrowsePagesState> {
  CatalogBrowsePages(this.key);

  final BrowseKey key;
  MatineeApi? _api;

  @override
  BrowsePagesState build() {
    final api = _api = ref.watch(apiProvider);
    if (api == null) return const BrowsePagesState(error: NotConnected());
    unawaited(Future.microtask(more));
    return const BrowsePagesState();
  }

  void more() {
    final now = state;
    final page = now.next;
    final api = _api;
    if (!ref.mounted || now.loading || page == null || api == null) return;
    state = now.copyWith(loading: true, error: () => null);
    unawaited(_load(api, page));
  }

  Future<void> _load(MatineeApi api, int page) async {
    try {
      final answer = await api.discover.browse(
        CatalogBrowseInput(
          kind: key.kind,
          filters: key.filters,
          sort: key.sort,
          page: page,
        ),
      );
      if (!ref.mounted) return;
      final seen = {for (final item in state.items) refKey(item.ref)};
      state = state.copyWith(
        items: [
          ...state.items,
          for (final item in answer.items)
            if (seen.add(refKey(item.ref))) item,
        ],
        next: () => answer.nextPage,
        loading: false,
        stale: state.stale || answer.stale,
        detail: () => answer.detail,
        voteFloor: () => answer.voteFloor,
      );
    } on Object catch (cause) {
      if (!ref.mounted) return;
      state = state.copyWith(loading: false, error: () => cause);
    }
  }
}

final browsePagesProvider = NotifierProvider.autoDispose
    .family<CatalogBrowsePages, BrowsePagesState, BrowseKey>(
      CatalogBrowsePages.new,
    );
