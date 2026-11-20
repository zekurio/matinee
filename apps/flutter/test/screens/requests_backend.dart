import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';

import 'home_backend.dart';

/// The server Explore, the catalog's pages, and the requests page talk to,
/// answering each path as the test sets it, with the two live streams as
/// server-sent events.

/// A time [days] before now, so the words for it stay the same whenever
/// the tests run.
String daysAgo(int days) => DateTime.now()
    .toUtc()
    .subtract(Duration(days: days, minutes: 5))
    .toIso8601String();

JsonMap catalogRefJson(String id, {String kind = 'movie'}) => {
  'kind': kind,
  'provider': 'tmdb',
  'providerId': id,
};

/// A title's state as the catalog says it: by default nobody asked and the
/// viewer may.
JsonMap stateJson(
  String state, {
  String? action,
  String? requestId,
  bool askedBySelf = false,
  double? progress,
  String? disabledReason,
  String? libraryTitleId,
  JsonMap? reason,
}) => {
  ...availabilityJson(state, progress: progress),
  'action': action,
  'askedBySelf': askedBySelf,
  'requestId': requestId,
  'disabledReason': disabledReason,
  'libraryTitleId': libraryTitleId,
  'reason': reason,
};

JsonMap askableJson() => stateJson('none', action: 'ask');

JsonMap summaryJson(
  String id,
  String name, {
  String kind = 'movie',
  int? year = 2024,
  JsonMap? availability,
}) => {
  'ref': catalogRefJson(id, kind: kind),
  'name': name,
  'year': year,
  'poster': null,
  'availability': availability ?? askableJson(),
};

JsonMap browseTitleJson(
  String id,
  String name, {
  String kind = 'movie',
  JsonMap? availability,
  JsonMap? title,
}) => {
  ...summaryJson(id, name, kind: kind, availability: availability),
  'title': title,
  'score': 7.4,
  'votes': 1200,
  'releaseDate': '2024-03-01',
};

JsonMap seasonJson(
  int number, {
  String state = 'none',
  String? action = 'ask',
  String? requestId,
  int aired = 10,
  int here = 0,
  bool selected = false,
}) => {
  'number': number,
  'overview': null,
  'poster': null,
  'episodeCount': aired,
  'airDate': '20${10 + number}-01-01',
  'availability': {
    ...stateJson(state, action: action, requestId: requestId),
    'number': number,
    'episodesHere': here,
    'episodesAired': aired,
  },
  'selected': selected,
};

JsonMap detailJson(
  String id,
  String name, {
  String kind = 'movie',
  JsonMap? availability,
  List<JsonMap> seasons = const [],
  String? overview,
}) => {
  ...summaryJson(id, name, kind: kind, availability: availability),
  'stale': false,
  'overview': overview,
  'genres': ['Drama', 'Sci-Fi'],
  'rating': 8.1,
  'contentRating': 'PG-13',
  'backdrop': null,
  'credits': <Object>[],
  'studios': <Object>[],
  'trailers': <Object>[],
  'seasons': seasons,
  'defaultScope': kind == 'show'
      ? {
          'seasons': [for (final season in seasons) season['number']],
          'future': true,
        }
      : null,
  'destinations': [
    {'id': 'lib1', 'name': 'Movies', 'selected': true},
  ],
};

JsonMap requestJson(
  String id,
  JsonMap title, {
  JsonMap? availability,
  JsonMap? scope,
}) => {
  'id': id,
  'title': title,
  'library': {'id': 'lib1', 'name': 'Movies'},
  'scope': scope,
  'createdAt': daysAgo(2),
  'arrivedAt': null,
  'availability': availability ?? title['availability'],
  'season': null,
};

JsonMap followerJson(String name, {String? at}) => {
  'id': 'id-$name',
  'name': name,
  'avatarId': null,
  'createdAt': at ?? daysAgo(2),
};

JsonMap queueItemJson(
  String id,
  JsonMap title, {
  String status = 'asked',
  List<JsonMap>? followers,
  bool connected = true,
  String? error,
  String? reason,
  String? note,
  String? declinedAt,
  String? arrivedAt,
  String? fulfilmentState,
  JsonMap? availability,
  List<JsonMap> destinations = const [],
  String? remoteUrl,
  List<JsonMap> diagnostics = const [],
}) => {
  ...requestJson(id, title, availability: availability),
  'arrivedAt': arrivedAt,
  'status': status,
  'fulfilmentState': fulfilmentState,
  'error': error,
  'reason': reason,
  'note': note,
  'declinedAt': declinedAt,
  'connection': connected
      ? {
          'id': 'c1',
          'name': 'Radarr',
          'sourceName': 'Radarr',
          'reportsProgress': true,
        }
      : null,
  'followers': followers ?? [followerJson('ben')],
  'destinationDescription': 'Movies',
  'destinations': destinations,
  'remoteUrl': remoteUrl,
  'diagnostics': diagnostics,
};

/// A library a waiting request could go to, for "Goes to".
JsonMap destinationJson(
  String id,
  String name, {
  bool selected = false,
  String? connection = 'Radarr',
}) => {'id': id, 'name': name, 'selected': selected, 'connection': connection};

JsonMap queueJson({
  List<JsonMap> waiting = const [],
  List<JsonMap> needsAttention = const [],
  List<JsonMap> onTheWay = const [],
  List<JsonMap> done = const [],
  String? nextCursor,
}) => {
  'waiting': waiting,
  'needsAttention': needsAttention,
  'onTheWay': onTheWay,
  'done': done,
  'counts': {
    'waiting': waiting.length,
    'needsAttention': needsAttention.length,
    'onTheWay': onTheWay.length,
    'done': done.length,
  },
  'nextCursor': nextCursor,
};

JsonMap discoverRailJson(String id, {String kind = 'movie'}) => {
  'id': id,
  'seed': null,
  'browse': {
    'kinds': [kind],
    'filters': <String, Object?>{},
    'sort': 'popular',
  },
};

JsonMap browseOptionsJson() => {
  'enabled': true,
  'stale': false,
  'genres': [
    {'id': 18, 'name': 'Drama'},
    {'id': 878, 'name': 'Science Fiction'},
  ],
  'ratings': {
    'country': 'US',
    'ratings': ['G', 'PG', 'PG-13', 'R'],
  },
  'languages': [
    {'id': 'en', 'name': 'English'},
    {'id': 'de', 'name': 'German'},
  ],
  'sorts': ['popular', 'scoreHigh', 'newest'],
  'votes': [100, 1000],
  'years': {'min': 1900, 'max': 2027, 'step': 1},
  'scores': {'min': 0, 'max': 10, 'step': 0.5},
  'runtime': {'min': 0, 'max': 240, 'step': 5},
};

final class RequestsBackend {
  /// What each path answers, as JSON, whatever the method.
  final answers = <String, Object?>{};

  /// Each Discover row's first page, by the row's id.
  final rows = <String, JsonMap>{};

  /// Paths that answer with an error, the server's message as the value.
  final failing = <String, String>{};

  /// The paths asked, in order.
  final asked = <String>[];

  /// What changed something: the path and the body sent.
  final sent = <(String, Object?)>[];

  /// The titles each `requests.live` stream was opened for, by provider id.
  final followed = <List<String>>[];

  /// The queue the admin's stream starts with.
  JsonMap queue = queueJson();

  final _live = StreamController<List<int>>.broadcast();
  final _adminLive = StreamController<List<int>>.broadcast();

  /// The titles' live stream says [events].
  void send(List<JsonMap> events) =>
      _live.add(utf8.encode('data: ${jsonEncode(events)}\n\n'));

  /// The admin's stream says the queue is now [next].
  void sendQueue(JsonMap next) {
    queue = next;
    _adminLive.add(utf8.encode('data: ${jsonEncode(next)}\n\n'));
  }

  static const _changes = {
    '/api/v1/requests/ask',
    '/api/v1/requests/cancel',
    '/api/v1/recommendations/dismissed',
    '/api/v1/admin/requests/approve',
    '/api/v1/admin/requests/approve-all',
    '/api/v1/admin/requests/decline',
    '/api/v1/admin/requests/give-up',
    '/api/v1/admin/requests/allow-again',
    '/api/v1/admin/requests/add-after-all',
    '/api/v1/admin/requests/retry',
  };

  late final client = MockClient.streaming((request, body) async {
    final path = request.url.path;
    asked.add(path);
    final text = await body.bytesToString();
    final input = text.isEmpty ? null : jsonDecode(text);
    if (path == '/api/v1/requests/live') {
      // SAFETY: the client sends the input as a JSON object of titles.
      final titles = (input as Map<String, Object?>)['titles']! as List;
      followed.add([
        for (final title in titles)
          // SAFETY: each title is a CatalogInput, its ref an object.
          ((title as Map)['ref'] as Map)['providerId'] as String,
      ]);
      return http.StreamedResponse(_live.stream, 200);
    }
    if (path == '/api/v1/admin/requests/live') {
      return http.StreamedResponse(
        _startWith(utf8.encode('data: ${jsonEncode(queue)}\n\n'), _adminLive),
        200,
      );
    }
    if (failing[path] case final message?) {
      return _json({'message': message}, 500);
    }
    if (path == '/api/v1/discover/row') {
      // SAFETY: the client sends the input as a JSON object.
      final id = (input as Map<String, Object?>)['id'];
      final row = rows[id];
      if (row == null) return _json({'message': 'no row'}, 500);
      return _json(row, 200);
    }
    if (_changes.contains(path)) {
      sent.add((path, input));
      if (answers.containsKey(path)) return _json(answers[path], 200);
      return http.StreamedResponse(const Stream.empty(), 204);
    }
    if (!answers.containsKey(path)) {
      return http.StreamedResponse(const Stream.empty(), 404);
    }
    return _json(answers[path], 200);
  });

  /// The paths sent so far that changed something.
  List<String> get sentPaths => [for (final (path, _) in sent) path];

  static Stream<List<int>> _startWith(
    List<int> first,
    StreamController<List<int>> rest,
  ) async* {
    yield first;
    yield* rest.stream;
  }

  static http.StreamedResponse _json(Object? body, int status) =>
      http.StreamedResponse(
        Stream.value(utf8.encode(jsonEncode(body))),
        status,
        headers: {HttpHeaders.contentTypeHeader: 'application/json'},
      );
}
