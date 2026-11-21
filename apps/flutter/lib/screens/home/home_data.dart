import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../query/server_data.dart';
import '../requests/requests_hub.dart' show requestsVersionProvider;

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
/// Fetched again when an ask, a cancel, or an answer changes what's on
/// its way.
final askedProvider = FutureProvider.autoDispose<RequestPage>((ref) {
  ref.watch(requestsVersionProvider);
  return serverApi(ref).requests.mine(limit: 24, filter: 'inProgress');
}, retry: (_, _) => null);
