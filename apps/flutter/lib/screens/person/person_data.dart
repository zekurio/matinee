import '../../query/server_data.dart';

/// Someone in the cast or crew, by the name the credits give and, when
/// the server matched them at TMDB, its id, which tells two of a name
/// apart.
typedef PersonKey = ({String name, String? tmdbId});

final personProvider = serverQueryFamily(
  (api, PersonKey key) => api.people.get(key.name, tmdbId: key.tmdbId),
);
