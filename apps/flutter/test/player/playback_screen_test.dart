import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/app.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/media/actions.dart' show mediaChangesProvider;
import 'package:matinee/platform/player.g.dart' as wire;
import 'package:matinee/player/playback_device.dart';
import 'package:matinee/player/playback_screen.dart';
import 'package:matinee/player/player.dart';
import 'package:matinee/player/player_controls.dart' show PlayerDim;
import 'package:matinee/player/player_preferences.dart';
import 'package:matinee/router.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../core/fakes.dart';
import 'playback_fakes.dart';

Future<void> tap(WidgetTester tester, String label) async {
  await tester.tap(find.bySemanticsLabel(label));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  test('engine preference defaults to mpv and persists Media3', () async {
    final first = ProviderContainer();
    expect(await first.read(playerEngineProvider.future), PlayerEngine.mpv);
    await first
        .read(playerEngineProvider.notifier)
        .setEngine(PlayerEngine.media3);
    first.dispose();

    final reopened = ProviderContainer();
    addTearDown(reopened.dispose);
    expect(
      await reopened.read(playerEngineProvider.future),
      PlayerEngine.media3,
    );
  });

  testWidgets('opens an item route and drives the touch controls', (
    tester,
  ) async {
    final backend = FakePlaybackApi();
    final players = <FakePlayer>[];
    final engines = <PlayerEngine>[];
    final window = <(int, bool)>[];
    backend.start = (input) => FakePlaybackApi.answer(
      plan(
        id: input.itemId,
        start: input.position ?? 18,
        audio: input.audio == audioTwo.index ? audioTwo : audioOne,
        subtitle: input.subtitle?.trackId == captions.id ? captions : null,
        subtitleMode: input.subtitle?.trackId == captions.id
            ? PlaybackSubtitleMode.client
            : null,
        subtitleUrl: input.subtitle?.trackId == captions.id ? '/caption' : null,
        quality: input.quality ?? PlaybackQuality.original,
        hasNext: input.itemId == itemId,
        segments: input.itemId == itemId ? const [intro] : const [],
      ),
    );

    tester.view.physicalSize = const Size(850, 400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://matinee.example', User.fromJson(userJson('ada'))),
        ),
        apiProvider.overrideWithValue(backend.api),
        playerHeadersProvider.overrideWithValue(const {
          'Authorization': 'Bearer test',
        }),
        sessionHttpProvider.overrideWithValue(backend.client),
        playbackPlayerFactoryProvider.overrideWithValue((engine) {
          engines.add(engine);
          final player = FakePlayer();
          players.add(player);
          return player;
        }),
        playbackFullscreenProvider.overrideWithValue((owner, enabled) async {
          window.add((owner, enabled));
        }),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MatineeApp(),
      ),
    );
    await tester.pumpAndSettle();
    final router = container.read(routerProvider);
    unawaited(router.push<void>(Routes.play(itemId)));
    await tester.pumpAndSettle();

    final player = players.single;
    expect(engines, [PlayerEngine.mpv]);
    expect(window.map((entry) => entry.$2), [true]);
    expect(backend.starts.single.itemId, itemId);
    expect(find.text('The Crossing'), findsOneWidget);
    expect(find.text('S01E01 · Harbour'), findsOneWidget);
    expect(find.text('Never displayed.mkv'), findsNothing);
    expect(find.text('Skip intro'), findsOneWidget);

    await tap(tester, 'Pause');
    expect(player.pauses, 1);
    await tap(tester, 'Play');
    expect(player.plays, 1);
    await tap(tester, 'Forward 5 seconds');
    expect(player.seeks.last, const Duration(seconds: 23));
    await tester.tap(find.text('Skip intro'));
    await tester.pumpAndSettle();
    expect(player.seeks.last, const Duration(seconds: 30));
    expect(find.text('Skip intro'), findsNothing);

    final bar = tester.getRect(find.bySemanticsLabel('Playback position'));
    await tester.tapAt(Offset(bar.center.dx, bar.center.dy));
    await tester.pumpAndSettle();
    expect(player.seeks.last.inSeconds, closeTo(60, 2));

    // The picture dims behind the controls, and only while they show.
    expect(find.byType(PlayerDim), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Pause'), findsNothing);
    expect(find.byType(PlayerDim), findsNothing);
    await tester.tapAt(const Offset(22, 140));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Pause'), findsOneWidget);
    expect(find.byType(PlayerDim), findsOneWidget);

    await tap(tester, 'Audio');
    // A menu's backdrop dims the picture itself; the two don't stack.
    expect(find.byType(PlayerDim), findsNothing);
    await tester.tap(find.text('German'));
    await tester.pumpAndSettle();
    expect(backend.picks.last.audio, audioTwo.index);
    expect(player.trackChanges.last.audioIndex, audioTwo.index);

    // The subtitles that are on are the button's value, on its own node.
    expect(
      tester.getSemantics(find.bySemanticsLabel('Subtitles')),
      isSemantics(isButton: true, hasTapAction: true, value: 'Off'),
    );
    await tap(tester, 'Subtitles');
    await tester.tap(find.text('English captions'));
    await tester.pumpAndSettle();
    expect(
      tester.getSemantics(find.bySemanticsLabel('Subtitles')),
      isSemantics(
        isButton: true,
        hasTapAction: true,
        value: 'English captions',
      ),
    );
    expect(backend.starts.last.subtitle?.trackId, captions.id);
    expect(backend.subtitleRequests, hasLength(1));

    await tap(tester, 'Quality');
    expect(find.text('1080p, 10 Mbps'), findsNothing);
    await tester.tap(find.text('720p, 4 Mbps'));
    await tester.pumpAndSettle();
    expect(backend.starts.last.quality, quality.id);

    await tap(tester, 'Speed');
    await tester.tap(find.text('1.5×'));
    await tester.pumpAndSettle();
    expect(player.rates.last, 1.5);

    player.emit(PlaybackPhase.ended, 120);
    await tester.pumpAndSettle();
    expect(find.text('Playing in 10'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Playing in 8'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pump(const Duration(seconds: 12));
    expect(players, hasLength(1));
    // Cancelled, the up-next card waits for Play.
    expect(find.bySemanticsLabel('Next episode'), findsOneWidget);
    await tester.tap(find.text('Play'));
    await tester.pumpAndSettle();
    expect(player.disposed, isTrue);
    expect(
      backend.reports.where((report) => report.closed == true),
      hasLength(1),
    );
    expect(backend.starts.last.itemId, nextId);
    expect(backend.starts.last.position, 0);
    expect(find.text('The Return'), findsOneWidget);
    expect(find.text('S01E02 · Harbour'), findsOneWidget);
    expect(window.map((entry) => entry.$2), [true]);

    await tap(tester, 'Back');
    expect(window.last, (window.first.$1, false));
    expect(players.last.disposed, isTrue);
    expect(find.byType(PlaybackScreen), findsNothing);
    // Each closed file told the pages under the player to fetch again.
    await tester.pumpAndSettle();
    expect(container.read(mediaChangesProvider), 2);
  });

  testWidgets('uses the saved Media3 preference and reports a refusal', (
    tester,
  ) async {
    final backend = FakePlaybackApi();
    backend.start = (_) =>
        FakePlaybackApi.reject(429, playbackBusy, data: {'playing': 2});
    final player = FakePlayer();
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://matinee.example', User.fromJson(userJson('ada'))),
        ),
        apiProvider.overrideWithValue(backend.api),
        playerHeadersProvider.overrideWithValue(const {}),
        sessionHttpProvider.overrideWithValue(backend.client),
        playbackCodecsProvider.overrideWith(
          (ref) => wire.CodecCapabilitiesMessage(
            audio: ['aac'],
            video: [],
            dolbyVision: false,
          ),
        ),
        playbackPlayerFactoryProvider.overrideWithValue((engine) {
          expect(engine, PlayerEngine.media3);
          return player;
        }),
        playbackFullscreenProvider.overrideWithValue((_, _) async {}),
      ],
    );
    addTearDown(container.dispose);
    await container
        .read(playerEngineProvider.notifier)
        .setEngine(PlayerEngine.media3);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MatineeApp(),
      ),
    );
    await tester.pumpAndSettle();
    final context = tester.element(find.byType(Logo));
    unawaited(context.push<void>(Routes.play(itemId)));
    await tester.pumpAndSettle();
    expect(find.text('Playing on too many devices'), findsOneWidget);
    expect(find.text('Try again'), findsNothing);
    expect(backend.starts.single.device.audio, ['aac', 'pcm_*']);
    expect(player.opens, isEmpty);
    await tap(tester, 'Back');
  });
}
