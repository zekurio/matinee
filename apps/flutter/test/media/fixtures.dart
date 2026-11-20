import 'package:matinee/api/matinee_api.dart';

/// The JSON the server sends for media, with only what a test cares about
/// to fill in.

JsonMap artJson(String id, {String? blurhash}) => {
  'id': id,
  'placeholder': blurhash == null
      ? null
      : {'blurhash': blurhash, 'aspectRatio': 1.5},
};

JsonMap titleJson(
  String id, {
  String kind = 'movie',
  String? name,
  int? year = 2016,
  String? poster,
  String? backdrop,
  List<String> genres = const [],
  bool watched = false,
  String? overview,
  double? rating,
  String? contentRating,
}) => {
  'id': id,
  'libraryId': 'lib-$kind',
  'kind': kind,
  'name': name ?? 'Title $id',
  'year': year,
  'overview': overview,
  'images': {
    'poster': poster == null ? null : artJson(poster),
    'backdrop': backdrop == null ? null : artJson(backdrop),
    'logo': null,
  },
  'genres': genres,
  'rating': rating,
  'contentRating': contentRating,
  'runtimeMinutes': null,
  'originalLanguage': null,
  'favorite': false,
  'watched': watched,
};

JsonMap itemJson(
  String id, {
  JsonMap? title,
  String? showName,
  String? episodeTitle,
  int? season,
  int? episode,
  double? duration = 3600,
  double? position,
  bool completed = false,
  String? still,
}) {
  final show = title ?? titleJson('t-$id');
  return {
    'id': id,
    'libraryId': show['libraryId'],
    'fileTitle': 'file $id',
    'label': {
      'show': showName ?? show['name'],
      'showName': showName ?? show['name'],
      'year': '${show['year']}',
      'showKey': show['id'],
      'title': episodeTitle,
      'untitled': false,
      'episodeNumber': episode,
      'code': null,
      'shortCode': null,
      'group': 'season',
      'groupLabel': <Object?>[],
    },
    'title': show,
    'seasonNumber': season,
    'episodeNumber': episode,
    'episode': season == null
        ? null
        : {
            'name': episodeTitle,
            'overview': null,
            'airDate': null,
            'runtimeMinutes': null,
            'still': still == null ? null : artJson(still),
          },
    'relativePath': 'a/$id.mkv',
    'container': 'mkv',
    'mimeType': 'video/x-matroska',
    'sizeBytes': 1,
    'modifiedAt': '2026-01-01T00:00:00.000Z',
    'durationSeconds': duration,
    'probe': null,
    'progress': position == null && !completed
        ? null
        : {
            'positionSeconds': position ?? 0,
            'completed': completed,
            'updatedAt': '2026-01-01T00:00:00.000Z',
          },
    'favorite': false,
  };
}

JsonMap libraryJson(String id, {String name = 'Movies', int items = 3}) => {
  'id': id,
  'name': name,
  'kind': 'movies',
  'paths': ['/media/$id'],
  'itemCount': items,
  'titleCount': items,
  'metadataProvider': null,
  'metadataLanguage': 'en',
  'lastScannedAt': null,
  'scanning': false,
  'refreshing': false,
  'backdrop': null,
};

JsonMap shelfJson(JsonMap title, {JsonMap? added, int count = 1}) => {
  'title': title,
  'item': itemJson('shelf-${title['id']}', title: title),
  'count': count,
  'addedAt': '2026-01-01T00:00:00.000Z',
  'added': added,
};

JsonMap featuredJson(JsonMap title, {JsonMap? item, int count = 1}) => {
  'title': title,
  'item': item ?? itemJson('f-${title['id']}', title: title),
  'count': count,
};

JsonMap refJson(String id) => {
  'kind': 'movie',
  'provider': 'tmdb',
  'providerId': id,
};
