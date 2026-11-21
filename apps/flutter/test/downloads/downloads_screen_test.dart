import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart' show User;
import 'package:matinee/core/session.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/platform/downloads.g.dart' as wire;
import 'package:matinee/screens/downloads/downloads_screen.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../core/fakes.dart';
import '../media/fixtures.dart';
import '../media/harness.dart';
import 'downloads_backend.dart';
import 'fake_downloads.dart';

const _server = 'https://media.example.com/';

final _show = titleJson('s1', kind: 'show', name: 'The Expanse');

/// A movie and two episodes here, one episode on its way, and one that
/// broke off.
List<wire.DownloadEntryMessage> _library({bool broken = false}) => [
  downloadEntry(
    itemJson(
      'm1',
      title: titleJson('m1', name: 'Arrival'),
      episodeTitle: 'Arrival',
    ),
    server: _server,
    bytes: 2400000000,
    total: 2400000000,
    addedAt: 1,
  ),
  downloadEntry(
    itemJson(
      'e1',
      title: _show,
      season: 1,
      episode: 1,
      episodeTitle: 'Dulcinea',
    ),
    server: _server,
    bytes: 600000000,
    total: 600000000,
    addedAt: 2,
  ),
  downloadEntry(
    itemJson(
      'e2',
      title: _show,
      season: 1,
      episode: 2,
      episodeTitle: 'The Big Empty',
    ),
    server: _server,
    bytes: 650000000,
    total: 650000000,
    addedAt: 3,
  ),
  downloadEntry(
    itemJson('e3', title: _show, season: 2, episode: 1, episodeTitle: 'Safe'),
    server: _server,
    state: broken
        ? wire.DownloadStateMessage.queued
        : wire.DownloadStateMessage.running,
    error: broken ? wire.DownloadErrorMessage.unreachable : null,
    bytes: 250000000,
    total: 1000000000,
    addedAt: 4,
  ),
  // Another server's, which doesn't show here.
  downloadEntry(
    itemJson(
      'x1',
      title: titleJson('x1', name: 'Elsewhere'),
      episodeTitle: 'Elsewhere',
    ),
    server: 'https://other.example.com/',
  ),
];

Future<FakeDownloadsPlatform> _pump(
  WidgetTester tester,
  Widget screen, {
  List<wire.DownloadEntryMessage> entries = const [],
  DownloadsBackend? backend,
  Size size = const Size(412, 915),
  KitColors colors = matineeDark,
  AuthState? auth,
}) async {
  final platform = FakeDownloadsPlatform(entries);
  await pumpScreen(
    tester,
    screen,
    client: (backend ?? DownloadsBackend()).client,
    size: size,
    colors: colors,
    auth: auth,
    overrides: [downloadsPlatformProvider.overrideWithValue(platform)],
  );
  return platform;
}

void main() {
  setUpAll(loadFont);

  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  testWidgets('with nothing here, says how to download', (tester) async {
    await _pump(tester, const DownloadsScreen());
    expect(find.text('Nothing downloaded yet'), findsOneWidget);
    expect(
      find.text(
        'Download a movie or episode from its menu to watch it offline.',
      ),
      findsOneWidget,
    );
  });

  testWidgets("says so when the account can't download", (tester) async {
    await _pump(
      tester,
      const DownloadsScreen(),
      backend: DownloadsBackend(downloads: false),
    );
    expect(find.text('Downloads are off'), findsOneWidget);
  });

  testWidgets('offline, the usual hint stays', (tester) async {
    await _pump(
      tester,
      const DownloadsScreen(),
      backend: DownloadsBackend(downloads: false),
      auth: Offline(_server, User.fromJson(userJson('ada'))),
    );
    expect(find.text('Nothing downloaded yet'), findsOneWidget);
  });

  testWidgets('lists what is coming, then movies and shows', (tester) async {
    final platform = await _pump(
      tester,
      const DownloadsScreen(),
      entries: _library(),
    );
    expect(find.text('Downloading'), findsOneWidget);
    expect(find.text('On this device'), findsOneWidget);
    expect(find.text('250 MB of 1.0 GB'), findsOneWidget);
    expect(find.text('Arrival'), findsOneWidget);
    // The show's finished episodes, together, counted as its page counts
    // them: two of the three here, and the space all three take.
    expect(find.text('2 of 3 episodes · 1.5 GB'), findsOneWidget);
    expect(find.text('Elsewhere'), findsNothing);
    // What's on its way first, then what came last.
    final coming = tester.getTopLeft(find.text('S2, E1: Safe')).dy;
    final show = tester.getTopLeft(find.text('2 of 3 episodes · 1.5 GB')).dy;
    final movie = tester.getTopLeft(find.text('Arrival')).dy;
    expect(coming < show && show < movie, isTrue);

    await tester.tap(find.text('Pause all'));
    await tester.pumpAndSettle();
    expect(platform.calls, ['pause e3']);
    expect(find.text('Paused'), findsOneWidget);
    expect(find.text('Resume all'), findsOneWidget);
    // Resuming has its own icon; the retry arrow is a failure's.
    final resume = tester.widget<RoundIconButton>(
      find.ancestor(
        of: find.bySemanticsLabel('Resume'),
        matching: find.byType(RoundIconButton),
      ),
    );
    expect(resume.icon, Lucide.play);
    await tester.tap(find.bySemanticsLabel('Resume'));
    await tester.pumpAndSettle();
    expect(platform.calls.last, 'resume e3');
  });

  testWidgets('one that broke off says why and tries again', (tester) async {
    final platform = await _pump(
      tester,
      const DownloadsScreen(),
      entries: _library(broken: true),
    );
    expect(find.text('Server not reachable'), findsOneWidget);
    await tester.tap(find.text('Try all again'));
    await tester.pumpAndSettle();
    expect(platform.calls, ['resume e3']);
  });

  testWidgets('with one running and one broken, offers both', (tester) async {
    final platform = await _pump(
      tester,
      const DownloadsScreen(),
      entries: [
        ..._library(broken: true),
        downloadEntry(
          itemJson('e4', title: _show, season: 2, episode: 2),
          server: _server,
          state: wire.DownloadStateMessage.running,
          bytes: 100,
          total: 1000,
          addedAt: 5,
        ),
      ],
    );
    expect(find.text('Pause all'), findsOneWidget);
    expect(find.text('Try all again'), findsOneWidget);
    final retry = tester.widget<RoundIconButton>(
      find.ancestor(
        of: find.bySemanticsLabel('Try again now'),
        matching: find.byType(RoundIconButton),
      ),
    );
    expect(retry.icon, Lucide.rotateCw);
    await tester.tap(find.text('Try all again'));
    await tester.pumpAndSettle();
    expect(platform.calls, ['resume e3']);
    await tester.tap(find.text('Pause all'));
    await tester.pumpAndSettle();
    expect(platform.calls.last, 'pause e4');
  });

  testWidgets("a file's menu plays and removes it", (tester) async {
    final platform = await _pump(
      tester,
      const DownloadsScreen(),
      entries: _library(),
    );
    await tester.tap(find.bySemanticsLabel('More actions'));
    await tester.pumpAndSettle();
    expect(find.text('Play'), findsOneWidget);
    expect(find.text('Details'), findsOneWidget);
    await tester.tap(find.text('Remove download'));
    await tester.pumpAndSettle();
    expect(platform.calls, ['remove m1']);
    expect(find.text('Arrival'), findsNothing);
  });

  testWidgets('a tap on a movie plays it', (tester) async {
    await _pump(tester, const DownloadsScreen(), entries: _library());
    await tester.tap(find.text('Arrival'));
    await tester.pumpAndSettle();
    expect(find.text('/play/m1'), findsOneWidget);
  });

  testWidgets("a show's page lists its seasons and removes one", (
    tester,
  ) async {
    final platform = await _pump(
      tester,
      const DownloadsShowScreen(titleId: 's1'),
      entries: _library(),
    );
    expect(find.text('The Expanse'), findsOneWidget);
    expect(find.text('2 of 3 episodes · 1.5 GB'), findsOneWidget);
    expect(find.text('Season 1'), findsOneWidget);
    expect(find.text('Season 2'), findsOneWidget);
    expect(find.text('Episode 1: Dulcinea'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Remove downloads of Season 1'));
    await tester.pumpAndSettle();
    expect(
      find.text('Remove the downloads of The Expanse: Season 1?'),
      findsOneWidget,
    );
    expect(find.text('This deletes 1.3 GB from this device.'), findsOneWidget);
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();
    expect(platform.calls, ['remove e1', 'remove e2']);
    expect(find.text('Season 1'), findsNothing);
  });

  testWidgets("a show's episodes show how far in, from the device", (
    tester,
  ) async {
    // Watched as the server last said; and half way, played offline.
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.withData({
          'matinee.pending.reports:$_server':
              '{"e2":{"positionSeconds":1800,"durationSeconds":3600}}',
        });
    await _pump(
      tester,
      const DownloadsShowScreen(titleId: 's1'),
      entries: [
        for (final entry in _library())
          if (entry.id == 'e1')
            downloadEntry(
              itemJson(
                'e1',
                title: _show,
                season: 1,
                episode: 1,
                episodeTitle: 'Dulcinea',
                completed: true,
              ),
              server: _server,
            )
          else
            entry,
      ],
    );
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('Dulcinea.*, Watched')), findsOne);
    expect(find.bySemanticsLabel(RegExp('Big Empty.*Watched')), findsNothing);
    final bar = tester.widget<WatchProgressBar>(find.byType(WatchProgressBar));
    expect(bar.progress, .5);
    expect(find.byType(WatchedBadge), findsOneWidget);
  });

  for (final (name, size, colors) in [
    ('downloads_phone_dark', const Size(412, 915), matineeDark),
    ('downloads_tablet_light', const Size(1280, 800), matineeLight),
  ]) {
    testWidgets(name, (tester) async {
      await _pump(
        tester,
        const DownloadsScreen(),
        entries: _library(broken: name.contains('tablet')),
        size: size,
        colors: colors,
      );
      await expectLater(
        find.byType(DownloadsScreen),
        matchesGoldenFile('goldens/$name.png'),
      );
    });
  }

  testWidgets('downloads_show_phone_dark', (tester) async {
    await _pump(
      tester,
      const DownloadsShowScreen(titleId: 's1'),
      entries: _library(),
    );
    await expectLater(
      find.byType(DownloadsShowScreen),
      matchesGoldenFile('goldens/downloads_show_phone_dark.png'),
    );
  });
}
