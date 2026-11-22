import '../../query/server_data.dart';

/// What Home reads: the libraries, Continue watching, Next up, the featured
/// titles, the recommendation rows, and each library's newest titles.

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
