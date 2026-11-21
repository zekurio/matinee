import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/app.dart';
import 'package:matinee/core/device.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/tv/tv.dart';
import 'package:matinee/media/artwork.dart';
import 'package:matinee/player/playback_screen.dart';
import 'package:matinee/player/player.dart';
import 'package:matinee/player/player_system.dart';
import 'package:matinee/player/trickplay.dart';
import 'package:matinee/player/tv/tv_display_mode.dart';
import 'package:matinee/player/tv/tv_playback_screen.dart';
import 'package:matinee/player/tv/tv_seek.dart';
import 'package:matinee/player/video_view.dart';
import 'package:matinee/router.dart';

import '../core/fakes.dart';
import '../screens/tv/tv_harness.dart';
import 'playback_fakes.dart';

class _FakeDisplay implements TvDisplay {
  final asked = <double?>[];

  @override
  Future<List<double>> refreshRates() async => [23.976, 50, 59.94, 60];

  @override
  Future<void> preferRefreshRate(double? rate) async => asked.add(rate);
}

typedef _Player = ({
  ProviderContainer container,
  FakePlaybackApi backend,
  List<FakePlayer> players,
  _FakeDisplay display,
  FakeMediaControls media,
});

/// [start] with a probe whose video has [frameRate], which the fixture's
/// lacks.
PlaybackStart _withFrameRate(PlaybackStart start, double frameRate) {
  // SAFETY: a PlaybackStart encodes as a JSON object.
  final json = jsonDecode(jsonEncode(start.toJson())) as Map<String, Object?>;
  // SAFETY: its item encodes as a JSON object too.
  (json['item']! as Map<String, Object?>)['probe'] = {
    'format': {'name': 'matroska', 'durationSeconds': 120, 'bitRate': null},
    'video': {
      'index': 0,
      'codec': 'h264',
      'width': 1920,
      'height': 1080,
      'frameRate': frameRate,
      'interlaced': false,
      'hdr10Plus': false,
      'masteringDisplay': false,
      'format': 'H.264',
      'resolution': '1080p',
    },
    'audio': const <Object>[],
    'subtitles': const <Object>[],
  };
  return PlaybackStart.fromJson(json);
}

/// The screen with its stand-in video, for goldens.
const _screen = Key('screen');

Future<_Player> _open(
  WidgetTester tester, {
  Size size = const Size(960, 540),
  bool hasNext = false,
  double? upNextAt,
  List<MediaSegment> segments = const [],
  double? frameRate,
  TrickplayStatus? trickplay,
  bool backdrop = false,
}) async {
  final backend = FakePlaybackApi();
  if (trickplay != null) backend.trickplay = trickplay;
  backend.start = (input) {
    final answer = plan(
      id: input.itemId,
      start: input.position ?? 18,
      quality: input.quality ?? PlaybackQuality.original,
      hasNext: hasNext && input.itemId == itemId,
      upNextAt: input.itemId == itemId ? upNextAt : null,
      segments: input.itemId == itemId ? segments : const [],
    );
    return FakePlaybackApi.answer(
      frameRate == null ? answer : _withFrameRate(answer, frameRate),
    );
  };
  final media = FakeMediaControls();
  final players = <FakePlayer>[];
  final display = _FakeDisplay();
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
  final container = ProviderContainer(
    overrides: [
      deviceProvider.overrideWithValue(tvDevice),
      authStateProvider.overrideWithValue(
        SignedIn('https://matinee.example', User.fromJson(userJson('ada'))),
      ),
      apiProvider.overrideWithValue(backend.api),
      playerHeadersProvider.overrideWithValue(const {
        'Authorization': 'Bearer test',
      }),
      sessionHttpProvider.overrideWithValue(backend.client),
      removingServersProvider.overrideWithValue(const {}),
      savedServersProvider.overrideWithValue(const []),
      playbackPlayerFactoryProvider.overrideWithValue((engine, prefs) {
        final player = FakePlayer();
        players.add(player);
        return player;
      }),
      playbackFullscreenProvider.overrideWithValue((owner, enabled) async {}),
      tvDisplayProvider.overrideWithValue(display),
      mediaControlsProvider.overrideWithValue(media),
      artworkLoaderProvider.overrideWithValue(
        ArtworkLoader(backend.client, const NoArtworkCache()),
      ),
    ],
  );
  addTearDown(container.dispose);
  final Widget app = UncontrolledProviderScope(
    container: container,
    child: const MatineeApp(),
  );
  await tester.pumpWidget(
    // Black stands in for the native video beneath the Flutter view, which
    // a test has none of.
    backdrop
        ? RepaintBoundary(
            key: _screen,
            child: ColoredBox(color: const Color(0xFF000000), child: app),
          )
        : app,
  );
  await tester.pump();
  unawaited(container.read(routerProvider).push<void>(Routes.play(itemId)));
  await settle(tester);
  return (
    container: container,
    backend: backend,
    players: players,
    display: display,
    media: media,
  );
}

/// The controls hide after a while of playing untouched.
Future<void> _waitForHide(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 4));
  await tester.pumpAndSettle();
}

Future<void> _hold(
  WidgetTester tester,
  LogicalKeyboardKey key, {
  int repeats = 3,
}) async {
  await tester.sendKeyDownEvent(key);
  for (var i = 0; i < repeats; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    await tester.sendKeyRepeatEvent(key);
  }
  await tester.pump();
}

void main() {
  loadTvFont();

  group('KeySeek', () {
    test('a press steps; a held key glides faster, then seeks once', () {
      final seek = KeySeek();
      expect(
        seek.press(
          from: 100,
          direction: 1,
          step: 10,
          duration: 1000,
          repeat: false,
          at: Duration.zero,
        ),
        110,
      );
      final glide = seek.press(
        from: 100,
        direction: 1,
        step: 10,
        duration: 1000,
        repeat: true,
        at: const Duration(milliseconds: 100),
      )!;
      // Three steps a second at first: about 3 s in a tenth of a second.
      expect(glide, closeTo(113, .5));
      expect(seek.release(), glide);
      expect(seek.release(), isNull);
    });

    test('stays in the video, and does nothing without a length', () {
      final seek = KeySeek();
      expect(
        seek.press(
          from: 3,
          direction: -1,
          step: 10,
          duration: 100,
          repeat: false,
          at: Duration.zero,
        ),
        0,
      );
      expect(
        KeySeek().press(
          from: 3,
          direction: 1,
          step: 10,
          duration: 0,
          repeat: false,
          at: Duration.zero,
        ),
        isNull,
      );
    });
  });

  group('matchingRefreshRate', () {
    test('prefers an exact, low multiple', () {
      expect(matchingRefreshRate([23.976, 24, 60], 23.976), 23.976);
      expect(matchingRefreshRate([60, 120, 24, 48], 24), 24);
      expect(matchingRefreshRate([50, 60], 25), 50);
      expect(matchingRefreshRate([59.94, 60], 29.97), 59.94);
    });

    test('takes a near rate when no exact one exists', () {
      expect(matchingRefreshRate([24, 60], 23.976), 24);
    });

    test('none fits, or no frame rate', () {
      expect(matchingRefreshRate([60], 24), isNull);
      expect(matchingRefreshRate([60], null), isNull);
    });
  });

  testWidgets('opens on play with the title; matches the frame rate', (
    tester,
  ) async {
    final opened = await _open(tester);
    expect(find.byType(TvPlaybackScreen), findsOneWidget);
    expect(find.text('The Crossing'), findsOneWidget);
    expect(find.text('S01E01 · Harbour'), findsOneWidget);
    expect(focusedKey(), 'player/play');
    // The fixture's probe has no frame rate, so the screen stays.
    expect(opened.display.asked, isEmpty);
  });

  testWidgets('nothing above the video paints over it while it plays', (
    tester,
  ) async {
    // The picture plays in a native view beneath the Flutter view, seen
    // only through what Flutter leaves clear.
    await _open(tester);
    expect(find.byType(VideoView), findsOneWidget);
    final fills = find.ancestor(
      of: find.byType(VideoView),
      matching: find.byWidgetPredicate(
        (widget) => switch (widget) {
          ColoredBox(:final color) => color.a > 0,
          DecoratedBox(decoration: BoxDecoration(:final color?)) => color.a > 0,
          _ => false,
        },
      ),
    );
    expect(fills, findsNothing);
  });

  testWidgets('asks for the frame rate, and lets go on leaving', (
    tester,
  ) async {
    final opened = await _open(tester, frameRate: 23.976);
    expect(opened.display.asked, [23.976]);
    await back(tester);
    await back(tester);
    expect(find.byType(TvPlaybackScreen), findsNothing);
    expect(opened.display.asked, [23.976, null]);
  });

  testWidgets('the next episode at the same rate keeps the mode', (
    tester,
  ) async {
    final opened = await _open(tester, hasNext: true, frameRate: 23.976);
    opened.players.single.emit(PlaybackPhase.ended, 120);
    await settle(tester);
    await select(tester);
    await settle(tester);
    expect(opened.players, hasLength(2));
    expect(find.text('The Return'), findsOneWidget);
    expect(opened.display.asked, [23.976], reason: 'nothing let go between');
  });

  testWidgets('the video shows in the system media controls, whose presses '
      'reach it', (tester) async {
    final opened = await _open(tester);
    final player = opened.players.single;
    final info = opened.media.shown.single;
    expect(info.title, 'The Crossing');
    expect(opened.media.states.last.playing, isTrue);
    opened.media.press(MediaCommandKind.pause);
    await settle(tester);
    expect(player.pauses, 1);
    await back(tester);
    await back(tester);
    expect(opened.media.hides, 1);
  });

  testWidgets('a media key acts once', (tester) async {
    final opened = await _open(tester);
    await tester.sendKeyEvent(LogicalKeyboardKey.mediaPlayPause);
    await settle(tester);
    expect(opened.players.single.pauses, 1);
  });

  testWidgets('a held arrow shows the trickplay frame over the time', (
    tester,
  ) async {
    await _open(
      tester,
      trickplay: const TrickplayStatusReady(
        images: Trickplay(
          key: 'k',
          width: 160,
          height: 90,
          columns: 5,
          rows: 4,
          count: 50,
          intervalSeconds: 10,
        ),
      ),
    );
    await _waitForHide(tester);
    await _hold(tester, LogicalKeyboardKey.arrowRight);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(TrickplayFrame), findsOneWidget);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.arrowRight);
    await settle(tester);
    expect(find.byType(TrickplayFrame), findsNothing);
  });

  testWidgets('the heading stays clear of the time when a seek buffers into '
      'a segment', (tester) async {
    final opened = await _open(
      tester,
      segments: const [
        MediaSegment(kind: MediaSegmentKind.recap, start: 40, end: 60),
      ],
    );
    final player = opened.players.single;
    double heading() => tester.getTopLeft(find.text('The Crossing')).dy;
    await select(tester);
    final resting = heading();
    await up(tester);
    expect(focusedKey(), 'player/seek');
    final lifted = heading();
    expect(lifted, lessThan(resting), reason: "out of the time's way");
    // The seek lands in the recap while the player buffers: the spinner
    // and the skip button come in the same frame.
    await right(tester, 2);
    player.emit(PlaybackPhase.buffering, 48);
    // The spinner turns for as long as it buffers, so no settling.
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Skip recap'), findsOneWidget);
    expect(focusedKey(), 'player/seek');
    expect(heading(), lifted);
  });

  testWidgets('the skip arrows say their seconds big enough to read', (
    tester,
  ) async {
    await _open(tester);
    for (final (label, seconds) in [
      ('Back 5 seconds', '5'),
      ('Forward 5 seconds', '5'),
    ]) {
      final button = find.byWidgetPredicate(
        (widget) => widget is TvFocusable && widget.label == label,
      );
      final number = find.descendant(of: button, matching: find.text(seconds));
      expect(
        tester.widget<Text>(number).style!.fontSize,
        greaterThanOrEqualTo(TvType.caption.size),
        reason: "the couch's least",
      );
      // As big as play, which they flank.
      expect(tester.getSize(button).height, TvButtons.height);
    }
  });

  testWidgets('Select toggles play; Up goes to the seek bar, Down back', (
    tester,
  ) async {
    final opened = await _open(tester);
    final player = opened.players.single;
    await select(tester);
    expect(player.pauses, 1);
    await up(tester);
    expect(focusedKey(), 'player/seek');
    await down(tester);
    expect(focusedKey(), 'player/play');
    await right(tester);
    expect(focusedLabel(), startsWith('Forward'));
    await left(tester, 2);
    expect(focusedLabel(), startsWith('Back'));
  });

  testWidgets('the controls hide while the player reports its time', (
    tester,
  ) async {
    final opened = await _open(tester);
    final player = opened.players.single;
    expect(find.text('The Crossing'), findsOneWidget);
    // A real player tells the time every so often; that's no press.
    for (var second = 0; second < 6; second++) {
      player.emit(PlaybackPhase.ready, 18.0 + second, playing: true);
      await tester.pump(const Duration(seconds: 1));
    }
    await tester.pumpAndSettle();
    expect(find.text('The Crossing'), findsNothing);
    expect(focusedKey(), 'player/root');
  });

  testWidgets('with the controls away, the arrows skip and Select brings '
      'them back on play', (tester) async {
    final opened = await _open(tester);
    final player = opened.players.single;
    await _waitForHide(tester);
    expect(find.text('The Crossing'), findsNothing);
    expect(focusedKey(), 'player/root');
    await right(tester);
    expect(player.seeks, isNotEmpty, reason: 'a press seeks on release');
    final after = player.seeks.last;
    expect(after.inSeconds, greaterThan(18));
    expect(find.text('The Crossing'), findsNothing, reason: 'still away');
    await select(tester);
    expect(find.text('The Crossing'), findsOneWidget);
    expect(focusedKey(), 'player/play');
    expect(player.pauses, 0, reason: 'Select only brought the controls');
  });

  testWidgets('a held arrow brings the controls on the seek bar, which '
      'seeks once on release', (tester) async {
    final opened = await _open(tester);
    final player = opened.players.single;
    await _waitForHide(tester);
    await _hold(tester, LogicalKeyboardKey.arrowRight);
    await tester.pumpAndSettle();
    expect(find.text('The Crossing'), findsOneWidget);
    expect(player.seeks, isEmpty, reason: 'nothing until the key comes up');
    await tester.sendKeyUpEvent(LogicalKeyboardKey.arrowRight);
    await settle(tester);
    expect(player.seeks, hasLength(1));
    expect(focusedKey(), 'player/seek');
  });

  testWidgets('Back hides the controls, then leaves', (tester) async {
    await _open(tester);
    await back(tester);
    expect(find.text('The Crossing'), findsNothing);
    expect(find.byType(TvPlaybackScreen), findsOneWidget);
    await back(tester);
    expect(find.byType(TvPlaybackScreen), findsNothing);
  });

  testWidgets('a menu opens on its choice, picks, and gives focus back', (
    tester,
  ) async {
    final opened = await _open(tester);
    // Past skip forward, over the gap, to the menus.
    await right(tester, 2);
    expect(focusedKey(), 'player/audio');
    await select(tester);
    expect(tvOpenPanels.value, 1);
    expect(focusedLabel(), startsWith('English'));
    await down(tester);
    await select(tester);
    expect(tvOpenPanels.value, 0);
    expect(opened.backend.picks.last.audio, audioTwo.index);
    expect(focusedKey(), 'player/audio');

    await right(tester, 2);
    expect(focusedKey(), 'player/settings');
    await select(tester);
    expect(focusedLabel(), startsWith('Original'));
    await back(tester);
    expect(tvOpenPanels.value, 0);
    expect(focusedKey(), 'player/settings');
    expect(find.byType(TvPlaybackScreen), findsOneWidget);
  });

  testWidgets('the next episode counts down on the picture; Back stops it', (
    tester,
  ) async {
    final opened = await _open(tester, hasNext: true);
    final player = opened.players.single;
    await _waitForHide(tester);
    player.emit(PlaybackPhase.ended, 120);
    await settle(tester);
    expect(focusedKey(), 'player/corner');
    expect(find.text('· 10'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('· 8'), findsOneWidget);
    await back(tester);
    await tester.pump(const Duration(seconds: 12));
    expect(opened.players, hasLength(1), reason: 'the countdown stopped');
    expect(find.byType(TvPlaybackScreen), findsOneWidget);
    // The controls still offer it, with no countdown.
    await select(tester);
    expect(find.text('Next episode'), findsWidgets);
    expect(find.textContaining(RegExp(r'· \d')), findsNothing);
  });

  testWidgets('a countdown of a minute or more reads as a time', (
    tester,
  ) async {
    final opened = await _open(tester, hasNext: true, upNextAt: 20);
    await _waitForHide(tester);
    opened.players.single.emit(PlaybackPhase.ready, 30, playing: true);
    await settle(tester);
    expect(find.text('Next episode'), findsOneWidget);
    expect(find.text('· 1:30'), findsOneWidget);
    opened.players.single.emit(PlaybackPhase.ready, 75, playing: true);
    await settle(tester);
    expect(find.text('· 45'), findsOneWidget);
  });

  testWidgets('the next episode starts by itself after its countdown', (
    tester,
  ) async {
    final opened = await _open(tester, hasNext: true);
    opened.players.single.emit(PlaybackPhase.ended, 120);
    await settle(tester);
    expect(focusedKey(), 'player/action', reason: 'it takes focus');
    for (var i = 0; i < 11; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    await settle(tester);
    expect(opened.players, hasLength(2));
    expect(opened.backend.starts.last.itemId, nextId);
    expect(find.text('The Return'), findsOneWidget);
  });

  testWidgets('Skip intro waits on the picture and takes focus there', (
    tester,
  ) async {
    final opened = await _open(tester, segments: const [intro]);
    await _waitForHide(tester);
    expect(focusedKey(), 'player/corner');
    await select(tester);
    expect(opened.players.single.seeks.last, const Duration(seconds: 30));
  });

  testWidgets('Skip intro from the controls hands focus to play', (
    tester,
  ) async {
    final opened = await _open(tester, segments: const [intro]);
    await _waitForHide(tester);
    // Past the few seconds the button waits on the picture.
    await tester.pump(const Duration(seconds: 8));
    await down(tester);
    expect(focusedKey(), 'player/action');
    await select(tester);
    expect(opened.players.single.seeks.last, const Duration(seconds: 30));
    expect(find.text('Skip intro'), findsNothing);
    expect(focusedKey(), 'player/play', reason: 'not lost with the button');
  });

  for (final size in tvSizes) {
    final width = size.width.round();
    testWidgets('the TV player at $width', (tester) async {
      await _open(tester, size: size, segments: const [intro], backdrop: true);
      await up(tester);
      await tester.pumpAndSettle();
      // The time over the focused bar clears the title.
      // The higher of the two times, the clock at the bar's start under it.
      final times = [
        for (final element in find.text('0:18').evaluate())
          tester.getRect(find.byElementPredicate((e) => e == element)),
      ]..sort((a, b) => a.top.compareTo(b.top));
      expect(times, hasLength(2));
      final bubble = times.first;
      final title = tester.getRect(find.text('The Crossing'));
      expect(bubble.top, greaterThan(title.bottom));
      await expectLater(
        find.byKey(_screen),
        matchesGoldenFile('goldens/tv_player_$width.png'),
      );
    });
  }
}
