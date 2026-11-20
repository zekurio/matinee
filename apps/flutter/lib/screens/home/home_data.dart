import 'package:flutter/foundation.dart';

import '../../api/matinee_api.dart';
import '../../query/server_data.dart';

/// What Home reads, as the Kotlin app's `HomeLoaders`: the libraries,
/// Continue watching, Next up, the featured titles, the recommendation
/// rows, each library's newest titles, and what the viewer asked for,
/// followed live.

final librariesProvider = serverQuery((api) => api.libraries.list());

final continueWatchingProvider = serverQuery(
  (api) => api.home.continueWatching(limit: 20),
);

final nextUpProvider = serverQuery(
  (api) async => [
    for (final entry in await api.home.nextUp(limit: 20)) entry.item,
  ],
);

/// Picked at random by the server, so Home doesn't fetch it again on its
/// own: it would swap the titles under the person.
final featuredProvider = serverQuery((api) => api.home.featured());

final recommendationsProvider = serverQuery(
  (api) => api.recommendations.home(),
);

/// A library's newest titles.
final shelfProvider = serverQueryFamily(
  (api, String library) => api.media.shelf(library, limit: 12),
);

/// What's on its way, and what came or was answered in the last three
/// days: Home's "My requests".
final askedProvider = serverQuery(
  (api) => api.requests.mine(limit: 24, filter: 'inProgress'),
);

/// The requested titles' state as it moves, by [refKey]: the server sends
/// all of them on each connect, then the ones that change.
final askedLiveProvider = serverStreamFamily((api, FollowedTitles titles) {
  final known = <String, RequestsLiveEvent>{};
  return api.requests.live(titles: titles.inputs).map((events) {
    for (final event in events) {
      known[refKey(event.ref)] = event;
    }
    return Map<String, RequestsLiveEvent>.unmodifiable(known);
  });
});

/// Tells catalog titles apart, as the Kotlin app's `CatalogRef.key`.
String refKey(CatalogRef ref) =>
    '${ref.kind}:${ref.provider}:${ref.providerId}';

/// The titles one live stream follows, at most the 100 the contract takes,
/// equal when they're the same titles, so a refetch that finds the same
/// requests keeps the stream it has.
@immutable
final class FollowedTitles {
  FollowedTitles(List<RequestItem> items)
    : inputs = _distinct([
        for (final item in items)
          CatalogInput(ref: item.title.ref, libraryId: item.library.id),
      ]);

  final List<CatalogInput> inputs;

  static List<CatalogInput> _distinct(List<CatalogInput> inputs) {
    final seen = <String>{};
    return [
      for (final input in inputs)
        if (seen.add(refKey(input.ref))) input,
    ].take(100).toList();
  }

  List<String> get _keys => [for (final input in inputs) refKey(input.ref)];

  @override
  bool operator ==(Object other) =>
      other is FollowedTitles && listEquals(other._keys, _keys);

  @override
  int get hashCode => Object.hashAll(_keys);
}
