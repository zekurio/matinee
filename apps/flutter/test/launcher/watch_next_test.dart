import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/launcher/watch_next.dart';
import 'package:matinee/platform/watch_next.g.dart' as wire;

import '../core/fakes.dart';
import '../media/fixtures.dart';

final _l = lookupAppLocalizations(const Locale('en'));

MediaItem _episode(String id, {double? position = 12.25, String? still}) =>
    MediaItem.fromJson({
      ...itemJson(
        id,
        title: {
          ...titleJson('show', kind: 'show', name: 'The Show'),
          'overview': 'Show overview',
          'images': {
            'poster': artJson('poster'),
            'backdrop': artJson('backdrop'),
            'logo': null,
          },
        },
        episodeTitle: 'The Return',
        season: 2,
        episode: 3,
        duration: 600.5,
        position: position,
        still: still,
      ),
    });

NextUpEntry _next(String id, {String at = '2025-02-01T00:00:00Z'}) =>
    NextUpEntry(item: _episode(id, position: null), lastWatchedAt: at);

/// The row as a test's launcher has it.
final class _Row implements WatchNextPlatform {
  final identities = <String?>[];
  final saved = <String, Uint8List>{};
  final published = <(String, List<wire.WatchNextProgramMessage>)>[];
  @override
  Future<void> setIdentity(String? identity) async => identities.add(identity);

  @override
  Future<List<String>> missingArtwork(
    String identity,
    List<String> artworkIds,
  ) async => [
    for (final id in artworkIds)
      if (!saved.containsKey(id)) id,
  ];

  @override
  Future<void> saveArtwork(
    String identity,
    String artworkId,
    Uint8List bytes,
  ) async => saved[artworkId] = bytes;

  @override
  Future<void> publish(
    String identity,
    List<wire.WatchNextProgramMessage> programs,
  ) async => published.add((identity, programs));

  @override
  Future<wire.WatchNextLinkMessage?> takeLink() async => null;

  @override
  Stream<wire.WatchNextLinkMessage> get links => const Stream.empty();
}

/// A server with [continuing] and [next] at Home, and a picture for every
/// artwork id but those in [noPicture]. [down] takes Home away.
final class _Home {
  _Home({this.continuing = const [], this.next = const []});

  final List<MediaItem> continuing;
  final List<NextUpEntry> next;
  final noPicture = <String>{};
  final fetched = <String>[];
  bool down = false;

  late final client = MockClient((request) async {
    final path = request.url.path;
    if (path.startsWith('/api/artwork/')) {
      final id = request.url.pathSegments.last;
      fetched.add('$id ${request.url.queryParameters['size']}');
      return noPicture.contains(id)
          ? http.Response('', 404)
          : http.Response.bytes([1, 2, 3], 200);
    }
    if (down) return http.Response('', 503);
    return switch (path) {
      '/api/v1/home/continue-watching' => jsonResponse([
        for (final item in continuing) item.toJson(),
      ]),
      '/api/v1/home/next-up' => jsonResponse([
        for (final entry in next) entry.toJson(),
      ]),
      _ => http.Response('', 404),
    };
  });
}

/// A TV signed in as ada on one server, whose Home is [home].
Future<(Harness, _Row)> _signedIn(_Home home) async {
  final harness = Harness();
  final row = _Row();
  harness.backend
    ..hosts.add('media.example.com')
    ..tokens['token-a'] = 'ada';
  await harness.launch(
    overrides: [
      watchNextPlatformProvider.overrideWithValue(row),
      hasWatchNextProvider.overrideWithValue(true),
      apiProvider.overrideWithValue(
        MatineeApi(
          base: Uri.parse('https://media.example.com/'),
          client: home.client,
        ),
      ),
      sessionHttpProvider.overrideWithValue(home.client),
    ],
  );
  addTearDown(harness.quit);
  await harness.until<NoServer>();
  expect(await harness.session.connect('media.example.com'), isNull);
  await harness.until<SignedOut>();
  harness.session.signedIn(appSession('token-a', 'ada'));
  await harness.until<SignedIn>();
  harness.container.read(watchNextProvider).words = _l;
  return (harness, row);
}

void main() {
  group('the cards', () {
    test('are both lists in the server order, Continue watching first', () {
      final programs = watchNextPrograms(
        [_episode('b'), _episode('a')],
        [_next('d'), _next('c')],
        _l,
      );
      expect(
        [for (final program in programs) program.itemId],
        ['b', 'a', 'd', 'c'],
      );
      expect(
        [for (final program in programs) program.kind],
        [
          wire.WatchNextKindMessage.resume,
          wire.WatchNextKindMessage.resume,
          wire.WatchNextKindMessage.next,
          wire.WatchNextKindMessage.next,
        ],
      );
    });

    test('a file in both lists is one card, the one to resume', () {
      final programs = watchNextPrograms([_episode('a')], [_next('a')], _l);
      expect(programs.single.kind, wire.WatchNextKindMessage.resume);
    });

    test('an episode names its show, then itself, with its still', () {
      final program = watchNextPrograms(
        [_episode('a', still: 'still')],
        const [],
        _l,
      ).single;
      expect(program.title, 'The Show');
      expect(program.episodeTitle, 'The Return');
      expect(program.description, 'Show overview');
      expect(program.episode, isTrue);
      expect(program.seasonNumber, 2);
      expect(program.episodeNumber, 3);
      expect(program.artworkId, 'still');
      expect(program.poster, isFalse);
      expect(program.durationMillis, 600500);
      expect(program.positionMillis, 12250);
      expect(
        program.engagementMillis,
        DateTime.utc(2026).millisecondsSinceEpoch,
      );
    });

    test('Next up is dated by the show, and has no position of its own', () {
      final program = watchNextPrograms(const [], [_next('a')], _l).single;
      expect(program.kind, wire.WatchNextKindMessage.next);
      expect(
        program.engagementMillis,
        DateTime.utc(2025, 2).millisecondsSinceEpoch,
      );
      expect(program.positionMillis, isNull);
      expect(program.artworkId, 'backdrop');
    });

    test("a time that doesn't parse is no time, never the device's", () {
      final program = watchNextPrograms(const [], [
        _next('a', at: 'invalid'),
      ], _l).single;
      expect(program.engagementMillis, isNull);
    });

    test('a movie with only a poster is a poster card under its name', () {
      final movie = MediaItem.fromJson(
        itemJson(
          'm',
          title: {
            ...titleJson('t', name: 'A Movie'),
            'images': {
              'poster': artJson('poster'),
              'backdrop': null,
              'logo': null,
            },
          },
          position: 5,
        ),
      );
      final program = watchNextPrograms([movie], const [], _l).single;
      expect(program.title, 'A Movie');
      expect(program.episodeTitle, isNull);
      expect(program.episode, isFalse);
      expect(program.artworkId, 'poster');
      expect(program.poster, isTrue);
    });
  });

  group('the sync', () {
    test(
      'fills the row for the account, and fetches each picture once',
      () async {
        final home = _Home(
          continuing: [_episode('a', still: 'still')],
          next: [_next('b')],
        );
        final (harness, row) = await _signedIn(home);
        final publisher = harness.container.read(watchNextProvider);

        expect(await publisher.sync(), isTrue);
        expect(await publisher.sync(), isTrue);

        final identity = watchNextIdentity(
          harness.container.read(sessionProvider),
        );
        expect(identity, matches(RegExp(r'^[0-9a-f]{64}$')));
        expect(row.identities, everyElement(identity));
        expect(row.published, hasLength(2));
        expect(row.published.last.$1, identity);
        expect(
          [for (final program in row.published.last.$2) program.itemId],
          ['a', 'b'],
        );
        // Once each, at the size a card needs, though it synced twice.
        expect(home.fetched, ['still medium', 'backdrop medium']);
      },
    );

    test('a picture that fails leaves its card in the row', () async {
      final home = _Home(continuing: [_episode('a', still: 'still')])
        ..noPicture.add('still');
      final (harness, row) = await _signedIn(home);

      expect(await harness.container.read(watchNextProvider).sync(), isTrue);

      expect(row.saved, isEmpty);
      expect(row.published.single.$2.single.itemId, 'a');
    });

    test('a server that fails leaves the row as it was', () async {
      final home = _Home(continuing: [_episode('a')])..down = true;
      final (harness, row) = await _signedIn(home);

      await expectLater(
        harness.container.read(watchNextProvider).sync(),
        throwsA(isA<ApiException>()),
      );

      expect(row.published, isEmpty);
    });

    test('signing out empties the row and publishes nothing', () async {
      final home = _Home(continuing: [_episode('a')]);
      final (harness, row) = await _signedIn(home);
      await harness.session.signOut();
      await harness.until<SignedOut>();
      row.identities.clear();

      expect(await harness.container.read(watchNextProvider).sync(), isFalse);

      expect(row.identities, [null]);
      expect(row.published, isEmpty);
    });
  });
}
