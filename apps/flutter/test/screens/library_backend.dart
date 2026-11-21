import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';

import '../media/fixtures.dart';

JsonMap showLibraryJson(String id, String name) => {
  ...libraryJson(id, name: name),
  'kind': 'shows',
};

/// The server Shows, Movies, and Browse talk to: `titles.browse` filters
/// [titles] by kind, library, genre, and studio and hands them out a page
/// at a time; `titles.filterOptions` answers [options].
final class LibraryBackend {
  LibraryBackend({int shows = 3, int movies = 2}) {
    titles.addAll([
      for (var i = 0; i < shows; i++)
        titleJson(
          's$i',
          kind: 'show',
          name: 'Show ${String.fromCharCode(65 + i % 26)}$i',
          year: 2010 + i % 10,
          genres: i.isEven ? ['Drama'] : ['Comedy'],
          rating: 8.4,
        )..['libraryId'] = 'shows1',
      for (var i = 0; i < movies; i++)
        titleJson('m$i', name: 'Movie $i', genres: ['Drama'])
          ..['libraryId'] = 'movies1',
    ]);
  }

  final titles = <JsonMap>[];
  var libraries = <JsonMap>[
    showLibraryJson('shows1', 'Shows'),
    libraryJson('movies1', name: 'Movies'),
  ];

  JsonMap options = {
    'genres': [
      {'name': 'Comedy', 'titleCount': 1},
      {'name': 'Drama', 'titleCount': 2},
    ],
    'studios': <Object>[],
    'ratings': [
      {
        'kind': 'show',
        'country': 'US',
        'ratings': [
          {'rating': 'TV-PG', 'titleCount': 1},
          {'rating': 'TV-14', 'titleCount': 2},
        ],
      },
    ],
    'languages': <Object>[],
    'years': {'min': 2010, 'max': 2019, 'step': 1},
    'scores': {'min': 0, 'max': 10, 'step': 0.5},
    'runtime': null,
    'watched': {'unwatched': 2, 'inProgress': 0, 'watched': 1},
    'total': 3,
    'sorts': ['name', 'recent', 'year', 'score'],
  };

  /// The bodies `titles.browse` was asked with, in order.
  final browsed = <JsonMap>[];

  /// The query strings `titles.filterOptions` was asked with.
  final optionsAsked = <Map<String, String>>[];

  /// Paths that answer with an error, the server's message as the value.
  final failing = <String, String>{};

  /// Paths whose requests throw, as a socket does.
  final down = <String>{};

  /// The requests it has no answer for, as `METHOD path`.
  final unanswered = <String>[];

  late final client = MockClient.streaming((request, body) async {
    final path = request.url.path;
    if (down.contains(path)) throw const SocketException('down');
    if (failing[path] case final message?) {
      return _json({'message': message}, 500);
    }
    switch (path) {
      case '/api/v1/libraries':
        return _json(libraries, 200);
      case '/api/v1/titles/filter-options':
        optionsAsked.add(request.url.queryParameters);
        return _json(options, 200);
      case '/api/v1/titles/browse':
        // SAFETY: the API client sends the browse input as a JSON object.
        final input = jsonDecode(await body.bytesToString()) as JsonMap;
        browsed.add(input);
        return _json(_browse(input), 200);
    }
    unanswered.add('${request.method} $path');
    return http.StreamedResponse(const Stream.empty(), 404);
  });

  JsonMap _browse(JsonMap input) {
    final kind = input['kind'];
    final library = input['libraryId'];
    // SAFETY: the client always sends the filters, as TitleFilters.toJson.
    final filters = input['filters'] as JsonMap? ?? const {};
    final genres = [...?(filters['genres'] as List<Object?>?)];
    final studios = [...?(filters['studios'] as List<Object?>?)];
    bool matches(JsonMap title, {bool anyKind = false}) {
      // SAFETY: titleJson writes genres as a list of strings.
      final has = title['genres'] as List<Object?>;
      return (anyKind || kind == null || title['kind'] == kind) &&
          (library == null || title['libraryId'] == library) &&
          genres.every(has.contains) &&
          studios.isEmpty;
    }

    final matching = titles.where(matches).toList();
    final ofAnyKind = titles.where((t) => matches(t, anyKind: true));
    // SAFETY: the client sends both, from the contract's defaults.
    final offset = input['offset'] as int? ?? 0;
    final limit = input['limit'] as int? ?? 60;
    return {
      'items': matching.skip(offset).take(limit).toList(),
      'total': matching.length,
      'kinds': {
        'movie': ofAnyKind.where((t) => t['kind'] == 'movie').length,
        'show': ofAnyKind.where((t) => t['kind'] == 'show').length,
      },
    };
  }

  static http.StreamedResponse _json(Object? body, int status) =>
      http.StreamedResponse(
        Stream.value(utf8.encode(jsonEncode(body))),
        status,
        headers: {'content-type': 'application/json'},
      );
}
