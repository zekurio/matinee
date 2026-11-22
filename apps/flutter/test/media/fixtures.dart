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
  String? backdrop,
}) => {
  'id': id,
  'libraryId': 'lib-$kind',
  'kind': kind,
  'name': name ?? 'Title $id',
  'year': year,
  'overview': null,
  'images': {
    'poster': null,
    'backdrop': backdrop == null ? null : artJson(backdrop),
    'logo': null,
  },
  'genres': <String>[],
  'rating': null,
  'contentRating': null,
  'runtimeMinutes': null,
  'originalLanguage': null,
  'favorite': false,
  'watched': false,
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
