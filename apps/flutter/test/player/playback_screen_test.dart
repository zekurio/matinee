import 'dart:async';
import 'dart:convert';

import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/app.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/media/actions.dart' show mediaChangesProvider;
import 'package:matinee/platform/player.g.dart' as wire;
import 'package:matinee/player/playback_device.dart';
import 'package:matinee/player/playback_screen.dart';
import 'package:matinee/player/player.dart';
import 'package:matinee/player/player_controls.dart'
    show PlayerDim, PlayerTransport;
import 'package:matinee/player/player_motion.dart';
import 'package:matinee/player/player_parts.dart';
import 'package:matinee/player/player_preferences.dart';
import 'package:matinee/player/player_system.dart';
import 'package:matinee/router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../core/fakes.dart';
import '../downloads/fake_downloads.dart';
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
        // No downloads, so the route asks the server.
        downloadsPlatformProvider.overrideWithValue(FakeDownloadsPlatform()),
        playbackPlayerFactoryProvider.overrideWithValue((engine, _) {
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
    // A tap waits to see whether a second makes it a double tap.
    await tester.pump(kDoubleTapTimeout);
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

  testWidgets('while it stalls, the keys and the system pause, and it stays '
      'paused', (tester) async {
    final backend = FakePlaybackApi();
    backend.start = (input) =>
        FakePlaybackApi.answer(plan(id: input.itemId, start: 18));
    final player = FakePlayer();
    final media = FakeMediaControls();
    tester.view.physicalSize = const Size(850, 400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://matinee.example', User.fromJson(userJson('ada'))),
        ),
        apiProvider.overrideWithValue(backend.api),
        playerHeadersProvider.overrideWithValue(const {}),
        sessionHttpProvider.overrideWithValue(backend.client),
        downloadsPlatformProvider.overrideWithValue(FakeDownloadsPlatform()),
        playbackPlayerFactoryProvider.overrideWithValue((_, _) => player),
        playbackFullscreenProvider.overrideWithValue((_, _) async {}),
        pictureInPictureProvider.overrideWithValue(FakePictureInPicture()),
        mediaControlsProvider.overrideWithValue(media),
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
    unawaited(container.read(routerProvider).push<void>(Routes.play(itemId)));
    await tester.pumpAndSettle();
    player.emit(PlaybackPhase.ready, 30, playing: true, buffered: 60);
    await tester.pump();
    player.emit(PlaybackPhase.buffering, 30, buffered: 61);
    await tester.pump(const Duration(seconds: 11));
    expect(find.text('Waiting for the server…'), findsOneWidget);
    expect(
      media.states.last.playing,
      isTrue,
      reason: 'the viewer never paused',
    );
    final plays = player.plays;
    await tester.sendKeyEvent(LogicalKeyboardKey.mediaPlay);
    await tester.pump(const Duration(milliseconds: 300));
    expect(player.plays, plays, reason: 'it already wants to play');
    await tester.sendKeyEvent(LogicalKeyboardKey.mediaPause);
    await tester.pump(const Duration(milliseconds: 300));
    expect(player.pauses, 1);
    expect(media.states.last.playing, isFalse);
    // The server answers again: it stays paused, the system agreeing.
    player.emit(PlaybackPhase.ready, 30, wantsPlay: false, buffered: 90);
    await tester.pump(const Duration(seconds: 2));
    expect(player.plays, plays);
    expect(find.bySemanticsLabel('Play'), findsOneWidget);
    expect(media.states.last.playing, isFalse);
    // Paused, then buffering, still offers play.
    player.emit(PlaybackPhase.buffering, 30, wantsPlay: false, buffered: 90);
    await tester.pump(const Duration(seconds: 1));
    expect(media.states.last.playing, isFalse);
    media.press(MediaCommandKind.play);
    await tester.pump(const Duration(milliseconds: 300));
    expect(player.plays, plays + 1);
  });

  testWidgets('a stall says it waits under the spinner', (tester) async {
    final backend = FakePlaybackApi();
    backend.start = (input) =>
        FakePlaybackApi.answer(plan(id: input.itemId, start: 18));
    final player = FakePlayer();
    tester.view.physicalSize = const Size(850, 400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://matinee.example', User.fromJson(userJson('ada'))),
        ),
        apiProvider.overrideWithValue(backend.api),
        playerHeadersProvider.overrideWithValue(const {}),
        sessionHttpProvider.overrideWithValue(backend.client),
        downloadsPlatformProvider.overrideWithValue(FakeDownloadsPlatform()),
        playbackPlayerFactoryProvider.overrideWithValue((_, _) => player),
        playbackFullscreenProvider.overrideWithValue((_, _) async {}),
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
    unawaited(container.read(routerProvider).push<void>(Routes.play(itemId)));
    await tester.pumpAndSettle();
    player.emit(PlaybackPhase.ready, 30, playing: true, buffered: 60);
    await tester.pump();
    player.emit(PlaybackPhase.buffering, 30, buffered: 61);
    await tester.pump(const Duration(seconds: 9));
    expect(find.text('Waiting for the server…'), findsNothing);
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Waiting for the server…'), findsOneWidget);
    // Over the controls' scrim, so a light frame can't dim the line.
    final stack = tester.widget<Stack>(
      find
          .ancestor(
            of: find.byType(PlayerSpinner),
            matching: find.byType(Stack),
          )
          .first,
    );
    final controls = tester.widget(
      find
          .ancestor(
            of: find.byType(PlayerTransport),
            matching: find.byType(PlayerFade),
          )
          .first,
    );
    final spinnerLayer = tester.widget(find.byType(PlayerSpinner));
    expect(stack.children, contains(controls));
    expect(
      stack.children.indexOf(spinnerLayer),
      greaterThan(stack.children.indexOf(controls)),
    );
    player.emit(PlaybackPhase.buffering, 30, buffered: 62);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Waiting for the server…'), findsNothing);
    // Quiet again until the minute: the failure takes over from the line.
    await tester.pump(const Duration(seconds: 61));
    // The controls fade out from that frame, then drop out on the next.
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    expect(find.text('Waiting for the server…'), findsNothing);
    expect(find.text("The server isn't answering."), findsOneWidget);
    await tap(tester, 'Back');
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
        // No downloads, so the route asks the server.
        downloadsPlatformProvider.overrideWithValue(FakeDownloadsPlatform()),
        playbackCodecsProvider.overrideWith(
          (ref) => wire.CodecCapabilitiesMessage(
            audio: ['aac'],
            video: [],
            dolbyVision: false,
          ),
        ),
        playbackPlayerFactoryProvider.overrideWithValue((engine, _) {
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

  testWidgets('starts as the playback settings say', (tester) async {
    await _preferences().setString(
      'matinee.player.prefs',
      jsonEncode(
        const PlayerPrefs(
          quality: '720p-4',
          decoders: Decoders.software,
          fillScreen: true,
          autoplayNext: false,
        ).toJson(),
      ),
    );
    final backend = FakePlaybackApi();
    backend.start = (input) => FakePlaybackApi.answer(
      plan(
        id: input.itemId,
        start: input.position ?? 18,
        audio: audioOne,
        quality: input.quality ?? PlaybackQuality.original,
        hasNext: true,
      ),
    );
    final player = FakePlayer();
    final made = <PlayerPrefs>[];
    tester.view.physicalSize = const Size(850, 400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://matinee.example', User.fromJson(userJson('ada'))),
        ),
        apiProvider.overrideWithValue(backend.api),
        playerHeadersProvider.overrideWithValue(const {}),
        sessionHttpProvider.overrideWithValue(backend.client),
        downloadsPlatformProvider.overrideWithValue(FakeDownloadsPlatform()),
        playbackPlayerFactoryProvider.overrideWithValue((engine, prefs) {
          made.add(prefs);
          return player;
        }),
        playbackFullscreenProvider.overrideWithValue((_, _) async {}),
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
    unawaited(container.read(routerProvider).push<void>(Routes.play(itemId)));
    await tester.pumpAndSettle();
    expect(backend.starts.single.quality, '720p-4');
    expect(made.single.decoders, Decoders.software);
    expect(player.fits, [VideoFit.cover]);

    // With autoplay off, the next episode waits for Play at the end.
    player.emit(PlaybackPhase.ended, 120);
    await tester.pumpAndSettle();
    expect(find.textContaining('Playing in'), findsNothing);
    await tester.pump(const Duration(seconds: 12));
    expect(backend.starts, hasLength(1));
    expect(find.text('Play'), findsOneWidget);
    await tap(tester, 'Back');
  });

  testWidgets('picture in picture follows the video and shows only it', (
    tester,
  ) async {
    final backend = FakePlaybackApi();
    backend.start = (input) => FakePlaybackApi.answer(
      plan(id: input.itemId, start: 18, audio: audioOne),
    );
    final player = FakePlayer();
    final pip = FakePictureInPicture();
    tester.view.physicalSize = const Size(850, 400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://matinee.example', User.fromJson(userJson('ada'))),
        ),
        apiProvider.overrideWithValue(backend.api),
        playerHeadersProvider.overrideWithValue(const {}),
        sessionHttpProvider.overrideWithValue(backend.client),
        downloadsPlatformProvider.overrideWithValue(FakeDownloadsPlatform()),
        playbackPlayerFactoryProvider.overrideWithValue((_, _) => player),
        playbackFullscreenProvider.overrideWithValue((_, _) async {}),
        pictureInPictureProvider.overrideWithValue(pip),
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
    unawaited(container.read(routerProvider).push<void>(Routes.play(itemId)));
    await tester.pumpAndSettle();
    // Playing, leaving the app shrinks it; paused, it doesn't.
    expect(pip.autos, [true]);
    await tap(tester, 'Pause');
    player.emit(PlaybackPhase.ready, 20);
    await tester.pumpAndSettle();
    expect(pip.autos, [true, false]);
    await tap(tester, 'Picture in picture');
    expect(pip.enters, 1);

    pip.small = true;
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Back'), findsNothing);
    expect(find.bySemanticsLabel('Play'), findsNothing);
    pip.small = false;
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Play'), findsOneWidget);

    // Turned off in settings, neither the button nor leaving uses it.
    await container
        .read(playerPrefsProvider.notifier)
        .change((prefs) => prefs.copyWith(pictureInPicture: false));
    player.emit(PlaybackPhase.ready, 20, playing: true);
    await tester.pumpAndSettle();
    expect(pip.autos.last, false);
    expect(find.bySemanticsLabel('Picture in picture'), findsNothing);
    await tester.pump(const Duration(seconds: 4));
  });

  test('the system hears of a change, not of every tick', () {
    MediaStateMessage at(int ms, {bool playing = true}) => mediaState(
      playing: playing,
      phase: PlaybackPhase.ready,
      position: ms / 1000,
      duration: 600,
      rate: 1,
    );
    expect(mediaStateMoved(null, at(0), Duration.zero), isTrue);
    // Playing on as the system works it out.
    expect(
      mediaStateMoved(at(0), at(5000), const Duration(seconds: 5)),
      isFalse,
    );
    // A seek.
    expect(
      mediaStateMoved(at(0), at(60000), const Duration(seconds: 5)),
      isTrue,
    );
    expect(
      mediaStateMoved(at(0), at(0, playing: false), Duration.zero),
      isTrue,
    );
    // Paused, the position stays where it was.
    expect(
      mediaStateMoved(
        at(1000, playing: false),
        at(1000, playing: false),
        const Duration(minutes: 1),
      ),
      isFalse,
    );
  });

  testWidgets('the system controls show the video and drive it', (
    tester,
  ) async {
    final backend = FakePlaybackApi();
    backend.start = (input) => FakePlaybackApi.answer(
      plan(id: input.itemId, start: 18, audio: audioOne),
    );
    final player = FakePlayer();
    final media = FakeMediaControls();
    tester.view.physicalSize = const Size(850, 400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://matinee.example', User.fromJson(userJson('ada'))),
        ),
        apiProvider.overrideWithValue(backend.api),
        playerHeadersProvider.overrideWithValue(const {'Authorization': 'x'}),
        sessionHttpProvider.overrideWithValue(backend.client),
        downloadsPlatformProvider.overrideWithValue(FakeDownloadsPlatform()),
        playbackPlayerFactoryProvider.overrideWithValue((_, _) => player),
        playbackFullscreenProvider.overrideWithValue((_, _) async {}),
        pictureInPictureProvider.overrideWithValue(FakePictureInPicture()),
        mediaControlsProvider.overrideWithValue(media),
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
    unawaited(container.read(routerProvider).push<void>(Routes.play(itemId)));
    await tester.pumpAndSettle();
    final info = media.shown.single;
    // Without artwork, the session's token goes nowhere.
    expect(info.artworkUrl, isNull);
    expect(info.headers, isEmpty);
    expect(info.playLabel, 'Play');
    expect(info.backLabel, 'Back ${info.backMs! ~/ 1000} seconds');
    expect(media.states.last.playing, isTrue);
    expect(media.states.last.positionMs, 18000);

    media.press(MediaCommandKind.pause);
    await tester.pumpAndSettle();
    expect(player.pauses, 1);
    media.press(MediaCommandKind.seekTo, positionMs: 60000);
    await tester.pumpAndSettle();
    expect(player.seeks.last, const Duration(seconds: 60));
    media.press(MediaCommandKind.ahead);
    await tester.pumpAndSettle();
    expect(player.seeks.last, Duration(milliseconds: 60000 + info.aheadMs!));
    expect(media.states.last.positionMs, 60000 + info.aheadMs!);

    await tap(tester, 'Back');
    expect(media.hides, 1);
  });

  testWidgets('the skip button shows by itself for a while, then with the '
      'controls', (tester) async {
    final backend = FakePlaybackApi();
    backend.start = (input) => FakePlaybackApi.answer(
      plan(id: input.itemId, start: 12, audio: audioOne, segments: [intro]),
    );
    final player = FakePlayer();
    tester.view.physicalSize = const Size(850, 400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://matinee.example', User.fromJson(userJson('ada'))),
        ),
        apiProvider.overrideWithValue(backend.api),
        playerHeadersProvider.overrideWithValue(const {}),
        sessionHttpProvider.overrideWithValue(backend.client),
        downloadsPlatformProvider.overrideWithValue(FakeDownloadsPlatform()),
        playbackPlayerFactoryProvider.overrideWithValue((_, _) => player),
        playbackFullscreenProvider.overrideWithValue((_, _) async {}),
        pictureInPictureProvider.overrideWithValue(FakePictureInPicture()),
        mediaControlsProvider.overrideWithValue(FakeMediaControls()),
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
    unawaited(container.read(routerProvider).push<void>(Routes.play(itemId)));
    await tester.pumpAndSettle();
    expect(find.text('Skip intro'), findsOneWidget);
    // The controls hide after 3.5 seconds; the button stays to 8.
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Pause'), findsNothing);
    expect(find.text('Skip intro'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.text('Skip intro'), findsNothing);
    // Back with the controls.
    await tester.tapAt(const Offset(425, 200));
    await tester.pump(kDoubleTapTimeout);
    await tester.pumpAndSettle();
    expect(find.text('Skip intro'), findsOneWidget);
    // Not while locked.
    await tap(tester, 'Lock controls');
    expect(find.text('Skip intro'), findsNothing);
    await tester.pump(const Duration(seconds: 4));
  });

  testWidgets('keys play, skip, and bring up the controls', (tester) async {
    final backend = FakePlaybackApi();
    backend.start = (input) => FakePlaybackApi.answer(
      plan(id: input.itemId, start: 12, audio: audioOne),
    );
    final player = FakePlayer();
    tester.view.physicalSize = const Size(850, 400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://matinee.example', User.fromJson(userJson('ada'))),
        ),
        apiProvider.overrideWithValue(backend.api),
        playerHeadersProvider.overrideWithValue(const {}),
        sessionHttpProvider.overrideWithValue(backend.client),
        downloadsPlatformProvider.overrideWithValue(FakeDownloadsPlatform()),
        playbackPlayerFactoryProvider.overrideWithValue((_, _) => player),
        playbackFullscreenProvider.overrideWithValue((_, _) async {}),
        pictureInPictureProvider.overrideWithValue(FakePictureInPicture()),
        mediaControlsProvider.overrideWithValue(FakeMediaControls()),
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
    unawaited(container.read(routerProvider).push<void>(Routes.play(itemId)));
    await tester.pumpAndSettle();

    await tester.sendKeyEvent(LogicalKeyboardKey.mediaPlayPause);
    await tester.pumpAndSettle();
    expect(player.pauses, 1);
    await tester.sendKeyEvent(LogicalKeyboardKey.mediaPlay);
    await tester.pumpAndSettle();
    expect(player.plays, 1);
    await tester.sendKeyEvent(LogicalKeyboardKey.mediaFastForward);
    await tester.pumpAndSettle();
    final ahead = player.seeks.last;
    expect(ahead, greaterThan(const Duration(seconds: 12)));

    // With the controls hidden, the arrows skip and Select brings them up.
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Pause'), findsNothing);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
    await tester.pumpAndSettle();
    expect(player.seeks.last, lessThan(ahead));
    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Pause'), findsOneWidget);

    // Locked, Select only shows the unlock button.
    await tap(tester, 'Lock controls');
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    double unlock() => tester
        .widget<AnimatedOpacity>(
          find.ancestor(
            of: find.bySemanticsLabel('Unlock'),
            matching: find.byType(AnimatedOpacity),
          ),
        )
        .opacity;
    expect(unlock(), 0);
    final seeks = player.seeks.length;
    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    await tester.pump();
    expect(unlock(), 1);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pump();
    expect(player.seeks, hasLength(seeks));
    await tester.pump(const Duration(seconds: 4));
  });
}

SharedPreferencesAsync _preferences() => SharedPreferencesAsync();
