import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';

import '../media/fixtures.dart';

JsonMap availabilityJson(String state, {double? progress}) => {
  'state': state,
  'action': null,
  'progress': progress,
  'etaSeconds': null,
  'releaseDate': null,
  'stillLooking': false,
  'reason': null,
  'askedBySelf': true,
  'requestId': 'r1',
  'others': {'count': 0, 'names': <String>[]},
  'limit': null,
  'libraryTitleId': null,
  'disabledReason': null,
};

/// The server Home talks to, answering each path as the test sets it.
final class HomeBackend {
  HomeBackend() {
    final show = titleJson(
      's1',
      kind: 'show',
      name: 'The Expanse',
      backdrop: 'bd-s1',
      genres: ['Drama', 'Sci-Fi'],
      overview: 'A detective and a ship captain find a conspiracy.',
      rating: 8.4,
      contentRating: 'TV-14',
    );
    answers.addAll({
      '/api/v1/libraries': [libraryJson('lib1', name: 'Movies')],
      '/api/v1/home/continue-watching': [
        itemJson(
          'e1',
          title: show,
          season: 2,
          episode: 5,
          episodeTitle: 'Home',
          duration: 1800,
          position: 1080,
        ),
      ],
      '/api/v1/home/next-up': [
        {
          'item': itemJson(
            'e2',
            title: show,
            season: 2,
            episode: 6,
            episodeTitle: 'Paradigm Shift',
          ),
          'lastWatchedAt': '2026-01-01T00:00:00.000Z',
        },
      ],
      '/api/v1/home/featured': [
        featuredJson(
          show,
          item: itemJson(
            'f-e1',
            title: show,
            season: 1,
            episode: 1,
            duration: 2400,
            position: 600,
          ),
          count: 23,
        ),
        featuredJson(titleJson('m2', name: 'Arrival', genres: ['Drama'])),
      ],
      '/api/v1/recommendations/home': {
        'rails': [
          {
            'id': 'forYou',
            'seed': null,
            'items': [
              {
                'ref': refJson('603'),
                'title': titleJson('m3', name: 'Paterson'),
                'reason': null,
              },
            ],
          },
        ],
        'computedAt': '2026-01-01T00:00:00.000Z',
      },
      '/api/v1/requests/mine': {
        'items': [
          {
            'id': 'r1',
            'title': {
              'ref': refJson('999'),
              'name': 'Dune: Part Two',
              'year': 2024,
              'poster': null,
              'availability': availabilityJson('asked'),
            },
            'library': {'id': 'lib1', 'name': 'Movies'},
            'scope': null,
            'createdAt': '2026-01-01T00:00:00.000Z',
            'arrivedAt': null,
            'availability': availabilityJson('asked'),
            'season': null,
          },
        ],
        'nextCursor': null,
      },
      '/api/v1/libraries/lib1/shelf': [
        shelfJson(titleJson('m1', name: 'Sicario', year: 2015)),
      ],
    });
  }

  /// What each path answers, as JSON.
  final answers = <String, Object?>{};

  /// Paths that answer with an error, the server's message as the value.
  final failing = <String, String>{};

  /// Paths whose requests throw, as a socket does.
  final down = <String>{};

  /// The paths asked, in order.
  final asked = <String>[];

  /// The requests' live stream, as server-sent events.
  final live = StreamController<List<int>>.broadcast();

  void send(List<JsonMap> events) =>
      live.add(utf8.encode('data: ${jsonEncode(events)}\n\n'));

  late final client = MockClient.streaming((request, body) async {
    final path = request.url.path;
    asked.add(path);
    if (down.contains(path)) throw const SocketException('down');
    if (path == '/api/v1/requests/live') {
      return http.StreamedResponse(live.stream, 200);
    }
    if (failing[path] case final message?) {
      return _json({'message': message}, 500);
    }
    if (!answers.containsKey(path)) {
      return http.StreamedResponse(const Stream.empty(), 404);
    }
    return _json(answers[path], 200);
  });

  static http.StreamedResponse _json(Object? body, int status) =>
      http.StreamedResponse(
        Stream.value(utf8.encode(jsonEncode(body))),
        status,
        headers: {'content-type': 'application/json'},
      );
}
