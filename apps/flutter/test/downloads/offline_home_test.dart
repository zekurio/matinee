import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/app.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/downloads/downloads_lifecycle.dart';
import 'package:matinee/downloads/pending_progress.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/platform/downloads.g.dart' as wire;
import 'package:matinee/screens/home/offline_home.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../core/fakes.dart';
import '../media/fixtures.dart';
import '../media/harness.dart';
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
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 3; i++) {
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }
}

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

  group('offline Home', () {
    setUpAll(loadFont);

    setUp(() {
      SharedPreferencesAsyncPlatform.instance =
          InMemorySharedPreferencesAsync.withData({
            'matinee.home.resume:$_server': <String>['m1'],
            'matinee.pending.reports:$_server': jsonEncode({
              's1e1': {'positionSeconds': 3500, 'durationSeconds': 3600},
            }),
          });
    });

    final ada = User.fromJson(userJson('ada'));
    final show = titleJson('s1', kind: 'show', name: 'The Expanse');
    final entries = [
      downloadEntry(
        itemJson(
          'm1',
          title: titleJson('m1', name: 'Arrival'),
          episodeTitle: 'Arrival',
          position: 1800,
        ),
        server: _server,
        addedAt: 3,
      ),
      for (var episode = 1; episode <= 3; episode++)
        downloadEntry(
          itemJson(
            's1e$episode',
            title: show,
            season: 1,
            episode: episode,
            episodeTitle: 'Episode $episode',
          ),
          server: _server,
          addedAt: episode,
        ),
      downloadEntry(
        itemJson('later'),
        server: _server,
        state: wire.DownloadStateMessage.running,
        addedAt: 9,
      ),
    ];

    Future<void> pump(
      WidgetTester tester, {
      List<wire.DownloadEntryMessage>? downloads,
      Size size = const Size(412, 915),
      KitColors colors = matineeDark,
    }) async {
      await pumpScreen(
        tester,
        const _Backed(),
        client: MockClient((request) async => http.Response('', 404)),
        auth: Offline(_server, ada),
        size: size,
        colors: colors,
        overrides: [
          downloadsPlatformProvider.overrideWithValue(
            FakeDownloadsPlatform(downloads ?? entries),
          ),
        ],
      );
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pumpAndSettle();
    }

    testWidgets("shows the downloads in Home's rows", (tester) async {
      await pump(tester);
      expect(find.text('Continue watching'), findsOneWidget);
      // Watched to the end offline, the next episode is up.
      expect(find.text('Next up'), findsOneWidget);
      expect(find.text('S1, E2: Episode 2'), findsOneWidget);
      expect(find.text('Movies'), findsOneWidget);
      expect(find.text('Arrival'), findsNWidgets(2));
      expect(find.text('Shows'), findsOneWidget);
      expect(find.text('3 episodes'), findsOneWidget);
      // Still coming, so not here.
      expect(find.text('file later'), findsNothing);
    });

    testWidgets('with nothing downloaded, says where downloads come from', (
      tester,
    ) async {
      await pump(tester, downloads: const []);
      expect(find.text('Nothing downloaded yet'), findsOneWidget);
    });

    for (final (name, size, colors) in [
      ('offline_home_phone_dark', const Size(412, 915), matineeDark),
      ('offline_home_tablet_light', const Size(1280, 800), matineeLight),
    ]) {
      testWidgets(name, (tester) async {
        await pump(tester, size: size, colors: colors);
        await expectLater(
          find.byType(_Backed),
          matchesGoldenFile('goldens/$name.png'),
        );
      });
    }
  });

  group('offline mode', () {
    setUp(() {
      SharedPreferencesAsyncPlatform.instance =
          InMemorySharedPreferencesAsync.empty();
    });

    testWidgets('the unreachable screen offers the downloads, and the server '
        'gets what was watched once it answers again', (tester) async {
      await (FontLoader(
        KitText.family,
      )..addFont(rootBundle.load('assets/fonts/red_hat_text.ttf'))).load();
      final harness = Harness();
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await tester.runAsync(() async {
        await harness.launch();
        await harness.until<NoServer>();
        await harness.session.connect('a.example');
        await harness.until<SignedOut>();
        harness.session.signedIn(appSession('token-a', 'ada'));
        await harness.until<SignedIn>();
        await harness.quit();
      });
      final again = Harness(prefs: harness.prefs, secrets: harness.secrets);
      again.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada'
        ..down['a.example'] = const SocketException('Connection refused');
      const server = 'https://a.example/';
      final platform = FakeDownloadsPlatform([
        downloadEntry(
          itemJson(
            'm1',
            title: titleJson('m1', name: 'Arrival'),
            episodeTitle: 'Arrival',
          ),
          server: server,
        ),
      ]);
      tester.view.physicalSize = const Size(412, 915);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.runAsync(
        () => again.launch(
          overrides: [downloadsPlatformProvider.overrideWithValue(platform)],
        ),
      );
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: again.container,
          child: const DownloadsLifecycle(child: MatineeApp()),
        ),
      );
      await _settle(tester);
      expect(find.text("Can't reach your server"), findsOneWidget);

      await tester.tap(find.text('Watch downloads'));
      await _settle(tester);
      expect(again.auth, isA<Offline>());
      expect(find.text('Movies'), findsOneWidget);
      expect(find.text('Arrival'), findsOneWidget);

      // Watched offline, then offline mode is turned off with the server
      // back.
      await tester.runAsync(
        () => again.container
            .read(pendingProgressProvider.notifier)
            .put(server, 'm1', const PendingReport(1200, 3600)),
      );
      again.backend.down.clear();
      again.session.setOfflineMode(on: false);
      for (var i = 0; i < 10 && again.auth is! SignedIn; i++) {
        await _settle(tester);
      }
      expect(again.auth, isA<SignedIn>());
      await _settle(tester);
      expect(
        again.backend.requests.map((request) => request.url.path),
        contains('/api/v1/media/m1/progress'),
      );
      expect(
        again.container
            .read(pendingProgressProvider.notifier)
            .report(server, 'm1'),
        isNull,
      );
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(again.quit);
    });
  });
}

/// Offline Home over the page's colour, as Home shows it.
class _Backed extends StatelessWidget {
  const _Backed();

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: MatineeTheme.of(context).background,
    child: const OfflineHome(),
  );
}
