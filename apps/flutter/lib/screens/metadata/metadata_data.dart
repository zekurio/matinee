import '../../api/matinee_api.dart';
import '../../query/server_data.dart';

export '../../media/metadata_items.dart' show libraryMetadataProvider;

/// What the identify and image pages read, with the library's provider from
/// `lib/media/metadata_items.dart`. For admins only; the server turns anyone
/// else away.

/// A search of the library's provider, for identify.
typedef MatchSearch = ({String titleId, String query, int? year});

final matchesProvider = serverQueryFamily(
  (api, MatchSearch search) => api.titles.findMatches(
    search.titleId,
    query: search.query,
    year: search.year,
  ),
);

/// A title's, a season's, or an episode's images, by where they are.
typedef ImagesKey = ({String titleId, int? season, int? episode});

ImagesKey imagesKey(ImageTarget target) =>
    (titleId: target.titleId, season: target.season, episode: target.episode);

final itemImagesProvider = serverQueryFamily(
  (api, ImagesKey key) =>
      api.titles.images(key.titleId, season: key.season, episode: key.episode),
);

/// What the provider has for one slot, in the library's language or all.
typedef RemoteImagesKey = ({ImagesKey target, String slot, bool allLanguages});

final remoteImagesProvider = serverQueryFamily(
  (api, RemoteImagesKey key) => api.titles.remoteImages(
    key.target.titleId,
    key.slot,
    season: key.target.season,
    episode: key.target.episode,
    allLanguages: key.allLanguages,
  ),
);
