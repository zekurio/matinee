import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/platform/downloads.g.dart' as wire;
import 'package:matinee/screens/home/offline_home.dart';

import '../media/fixtures.dart';
import 'fake_downloads.dart';

const _server = 'https://media.example.com/';

OfflineItem _file(
  String id, {
  String? show,
  int? season,
  int? episode,
  int addedAt = 0,
  wire.DownloadStateMessage state = wire.DownloadStateMessage.done,
}) => OfflineItem.of(
  downloadEntry(
    itemJson(
      id,
      title: show == null
          ? titleJson('movie-$id', name: id)
          : titleJson(show, kind: 'show', name: show),
      episodeTitle: show == null ? id : null,
      season: season,
      episode: episode,
      duration: 1000,
    ),
    server: _server,
    addedAt: addedAt,
    state: state,
  ),
)!;

List<String> _ids(List<OfflineItem> entries) => [
  for (final entry in entries) entry.id,
];

OfflineHomeRows _rows(
  List<OfflineItem> entries, {
  Map<String, Place> places = const {},
  Set<String> watched = const {},
  ServedRows served = const ServedRows(),
}) => offlineHomeRows(
  entries,
  place: (entry) => places[entry.id],
  watched: (entry) => watched.contains(entry.id),
  served: served,
);

/// Lets the session's work and the router's follow it, on the real clock.
void main() {
  group('the rows', () {
    test('started and not done is Continue watching, newest first', () {
      final rows = _rows(
        [
          _file('a', addedAt: 1),
          _file('b', addedAt: 2),
          _file('c', addedAt: 3),
        ],
        places: const {
          'a': Place(100, 1000),
          'b': Place(200, 1000),
          'c': Place(990, 1000),
        },
        watched: {'c'},
      );
      expect(_ids(rows.resume), ['b', 'a']);
    });

    test('Next up is the first episode after the last one watched', () {
      final rows = _rows(
        [
          _file('s1e3', show: 'show', season: 1, episode: 3),
          _file('s1e1', show: 'show', season: 1, episode: 1),
          _file('s1e2', show: 'show', season: 1, episode: 2),
        ],
        watched: {'s1e1'},
      );
      expect(_ids(rows.nextUp), ['s1e2']);
    });

    test('a show nobody started has no Next up', () {
      final rows = _rows([_file('s1e1', show: 'show', season: 1, episode: 1)]);
      expect(rows.nextUp, isEmpty);
    });

    test('an episode in progress is Continue watching, not Next up', () {
      final rows = _rows(
        [
          _file('s1e1', show: 'show', season: 1, episode: 1),
          _file('s1e2', show: 'show', season: 1, episode: 2),
        ],
        places: const {'s1e1': Place(50, 1000)},
      );
      expect(_ids(rows.resume), ['s1e1']);
      expect(_ids(rows.nextUp), ['s1e2']);
    });

    test('movies and shows are apart, and unfinished downloads stay out', () {
      final rows = _rows([
        _file('film', addedAt: 5),
        _file('s1e1', show: 'show', season: 1, episode: 1, addedAt: 4),
        _file('later', addedAt: 9, state: wire.DownloadStateMessage.running),
      ]);
      expect(_ids(rows.movies), ['film']);
      expect([for (final show in rows.shows) show.title.id], ['show']);
      expect(_ids(rows.shows.single.episodes), ['s1e1']);
    });

    test('seasons in order, with specials and loose files last', () {
      final rows = _rows([
        _file('extra', show: 'show'),
        _file('s0e1', show: 'show', season: 0, episode: 1),
        _file('s2e1', show: 'show', season: 2, episode: 1),
        _file('s1e2', show: 'show', season: 1, episode: 2),
      ]);
      expect(_ids(rows.shows.single.episodes), [
        's1e2',
        's2e1',
        's0e1',
        'extra',
      ]);
    });

    test("the server's rows stay as they were, of what's downloaded", () {
      final rows = _rows(
        [
          _file('boss-s2e3', show: 'boss', season: 2, episode: 3, addedAt: 1),
          _file('film', addedAt: 2),
        ],
        served: const ServedRows(
          resume: ['not-downloaded', 'film'],
          nextUp: ['boss-s2e3', 'also-not-here'],
        ),
      );
      expect(_ids(rows.resume), ['film']);
      expect(_ids(rows.nextUp), ['boss-s2e3']);
    });

    test("the server's order first, then what was started offline", () {
      final rows = _rows(
        [
          _file('a', addedAt: 1),
          _file('b', addedAt: 2),
          _file('c', addedAt: 3),
        ],
        places: const {'c': Place(10, 100)},
        served: const ServedRows(resume: ['a', 'b']),
      );
      expect(_ids(rows.resume), ['a', 'b', 'c']);
    });

    test('what was finished offline leaves Continue watching', () {
      final rows = _rows(
        [_file('a')],
        places: const {'a': Place(99, 100)},
        watched: {'a'},
        served: const ServedRows(resume: ['a']),
      );
      expect(rows.resume, isEmpty);
    });

    test('a Next up started offline moves to Continue watching', () {
      final rows = _rows(
        [
          _file('s1e2', show: 'show', season: 1, episode: 2),
          _file('s1e3', show: 'show', season: 1, episode: 3),
        ],
        places: const {'s1e2': Place(30, 100)},
        served: const ServedRows(nextUp: ['s1e2']),
      );
      expect(_ids(rows.resume), ['s1e2']);
      expect(_ids(rows.nextUp), ['s1e3']);
    });

    test('Next up has one episode per show', () {
      final rows = _rows(
        [
          _file('s1e1', show: 'show', season: 1, episode: 1),
          _file('s1e2', show: 'show', season: 1, episode: 2),
          _file('s1e3', show: 'show', season: 1, episode: 3),
        ],
        watched: {'s1e1'},
        served: const ServedRows(nextUp: ['s1e3']),
      );
      expect(_ids(rows.nextUp), ['s1e3']);
    });
  });
}
