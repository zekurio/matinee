import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';

import '../media/fixtures.dart';
import 'home_backend.dart';

/// A title as `titles.get` sends it: [titleJson] with the details.
JsonMap fullTitleJson(
  String id, {
  String kind = 'movie',
  String? name,
  String? overview,
  String? tagline,
  List<JsonMap> seasons = const [],
  JsonMap? next,
  List<JsonMap> credits = const [],
  List<String> studios = const [],
  int itemCount = 1,
  bool watched = false,
  String? provider = 'tmdb',
  List<JsonMap> trailers = const [],
}) => {
  ...titleJson(
    id,
    kind: kind,
    name: name,
    backdrop: 'bd-$id',
    poster: 'po-$id',
    genres: ['Drama', 'Sci-Fi'],
    overview: overview,
    rating: 7.9,
    contentRating: 'PG-13',
    watched: watched,
  ),
  'runtimeMinutes': kind == 'movie' ? 116 : null,
  'originalName': null,
  'tagline': tagline,
  'releaseDate': '2016-11-11',
  'status': kind == 'show' ? TitleStatus.ended : null,
  'path': '/media/$id',
  'provider': provider,
  'providerId': provider == null ? null : '329865',
  'externalIds': <String, String>{},
  'refreshedAt': null,
  'studios': studios,
  'credits': credits,
  'trailers': trailers,
  'itemCount': itemCount,
  'seasons': seasons,
  'specials': null,
  'next': next,
};

JsonMap seasonJson(
  int? number, {
  int items = 3,
  int watched = 0,
  String? overview,
}) => {
  'number': number,
  'name': number == null ? 'Other files' : 'Season $number',
  'overview': overview,
  'poster': null,
  'itemCount': items,
  'watchedCount': watched,
  'favorite': false,
};

JsonMap creditJson(String kind, String name, {String? role, String? tmdb}) => {
  'kind': kind,
  'name': name,
  'role': role,
  'photo': null,
  'tmdbId': tmdb,
};

/// A probe the server worded: [resolution], [format], and [range] for the
/// picture, and audio streams of the given languages, the first default.
JsonMap probeJson({
  String resolution = '2160p',
  String format = 'HEVC',
  String? range = 'HDR10',
  List<String?> audio = const ['en'],
  String layout = '5.1',
  List<String?> subtitles = const [],
}) => {
  'format': {'name': 'matroska', 'durationSeconds': 6960, 'bitRate': null},
  'video': {
    'index': 0,
    'codec': 'hevc',
    'codecTag': null,
    'profile': null,
    'level': null,
    'width': 3840,
    'height': 2160,
    'frameRate': 24,
    'bitRate': null,
    'pixelFormat': null,
    'bitDepth': 10,
    'colorTransfer': null,
    'colorPrimaries': null,
    'colorSpace': null,
    'colorRange': null,
    'interlaced': false,
    'hdr': null,
    'dolbyVisionProfile': null,
    'dolbyVision': null,
    'hdr10Plus': false,
    'masteringDisplay': false,
    'contentLightLevel': null,
    'format': format,
    'resolution': resolution,
    'dynamicRange': range,
  },
  'audio': [
    for (final (index, language) in audio.indexed)
      {
        'index': index + 1,
        'codec': 'eac3',
        'profile': null,
        'channels': 6,
        'channelLayout': '5.1(side)',
        'language': language,
        'title': null,
        'default': index == 0,
        'format': 'E-AC-3',
        'layout': layout,
      },
  ],
  'subtitles': [
    for (final (index, language) in subtitles.indexed)
      {
        'index': index + 10,
        'codec': 'subrip',
        'kind': 'text',
        'language': language,
        'title': null,
        'default': false,
        'forced': false,
        'hearingImpaired': false,
      },
  ],
};

/// [itemJson] with a probe and a size.
JsonMap fileJson(
  String id, {
  required JsonMap title,
  JsonMap? probe,
  int size = 4200000000,
  double? position,
  bool completed = false,
  int? season,
  int? episode,
  String? episodeTitle,
  String? overview,
}) {
  final item = itemJson(
    id,
    title: title,
    season: season,
    episode: episode,
    episodeTitle: episodeTitle,
    position: position,
    completed: completed,
  );
  final info = item['episode'];
  return {
    ...item,
    'probe': probe,
    'sizeBytes': size,
    if (info is Map<String, Object?> && overview != null)
      'episode': {...info, 'overview': overview},
  };
}

/// What the title pages ask the server, answered as the test sets it.
final class TitleBackend {
  /// Each `GET` path's answer, as JSON.
  final answers = <String, Object?>{};

  /// A title's files, by title id, then season (null for every file, -1
  /// for the files without a season number).
  final items = <String, Map<int?, List<JsonMap>>>{};

  /// What `catalog.related` and `catalog.relatedTitles` answer: the rails,
  /// and each rail's titles.
  Object? related = {'rails': <Object>[], 'stale': false};
  final relatedTitles = <String, List<JsonMap>>{};

  /// What `catalog.missingSeasons` answers: by default, nothing missing.
  Object? gaps = {
    'ref': {'kind': 'show', 'provider': 'tmdb', 'providerId': '329865'},
    'stale': false,
    'seasons': <Object>[],
    'partialSeasons': <Object>[],
    'defaultScope': {'seasons': <int>[], 'future': false},
    'destinations': <Object>[],
  };

  /// Paths answering with the server's message.
  final failing = <String, String>{};

  /// Requests that changed something: method, path, and body.
  final sent = <(String, String, Object?)>[];

  /// The paths asked, in order.
  final asked = <String>[];

  late final client = MockClient((request) async {
    final path = request.url.path;
    asked.add(path);
    final body = request.body.isEmpty ? null : jsonDecode(request.body);
    if (failing[path] case final message?) {
      return _json({'message': message}, 500);
    }
    if (request.method == 'PUT') {
      sent.add((request.method, path, body));
      return http.Response('', 204);
    }
    if (path == '/api/v1/catalog/related') return _json(related, 200);
    if (path == '/api/v1/catalog/missing-seasons') return _json(gaps, 200);
    if (path == '/api/v1/catalog/related/titles') {
      // SAFETY: the client sends the input as a JSON object.
      final rail = (body as Map<String, Object?>)['rail'];
      return _json({'items': relatedTitles[rail] ?? [], 'stale': false}, 200);
    }
    final match = RegExp(r'^/api/v1/titles/([^/]+)/items$').firstMatch(path);
    if (match != null) {
      // SAFETY: the client sends the input as a JSON object.
      final input = body as Map<String, Object?>;
      final season = input.containsKey('season')
          ? (input['season'] as int?) ?? -1
          : null;
      return _json(items[match.group(1)]?[season] ?? [], 200);
    }
    if (!answers.containsKey(path)) return http.Response('', 404);
    return _json(answers[path], 200);
  });

  static http.Response _json(Object? body, int status) => http.Response.bytes(
    utf8.encode(jsonEncode(body)),
    status,
    headers: {HttpHeaders.contentTypeHeader: 'application/json'},
  );
}

/// The related rows' availability for a title that's here.
JsonMap hereJson(String titleId) => {
  ...availabilityJson('here'),
  'libraryTitleId': titleId,
};
