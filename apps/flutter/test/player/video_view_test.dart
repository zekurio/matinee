import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/player/player.dart';
import 'package:matinee/player/video_view.dart';

class _FakePlayer implements Player {
  final List<Rect?> viewports = [];

  @override
  Future<void> setVideoViewport(Rect? bounds) async => viewports.add(bounds);

  @override
  PlaybackState get state => const PlaybackState();

  @override
  Stream<PlaybackState> get states => const Stream.empty();

  @override
  Future<void> open(
    String url, {
    Map<String, String> headers = const {},
    Duration startPosition = Duration.zero,
    PlayerSourceKind? kind,
    SourceTracks? tracks,
    bool autoplay = true,
  }) async {}

  @override
  Future<void> play() async {}

  @override
  Future<void> pause() async {}

  @override
  Future<void> seekTo(Duration position) async {}

  @override
  Future<void> setRate(double rate) async {}

  @override
  Future<void> selectAudioTrack(String? id) async {}

  @override
  Future<void> selectSubtitleTrack(String? id) async {}

  @override
  Future<void> setSourceTracks(SourceTracks tracks) async {}

  @override
  Future<void> setSubtitleUrl(String? url) async {}

  @override
  Future<void> setVideoFit(VideoFit fit) async {}

  @override
  Future<void> dispose() async {}
}

void main() {
  group('videoViewport', () {
    const view = Size(1080, 2400);

    test('scales to physical pixels and rounds', () {
      expect(
        videoViewport(
          logical: const Rect.fromLTWH(0, 100.2, 411.4, 231.4),
          devicePixelRatio: 2.625,
          viewSize: view,
        ),
        const Rect.fromLTRB(0, 263, 1080, 870),
      );
    });

    test('keeps the part that is scrolled off the view', () {
      final bounds = videoViewport(
        logical: const Rect.fromLTRB(0, -100, 400, 100),
        devicePixelRatio: 2,
        viewSize: view,
      );
      expect(bounds, const Rect.fromLTRB(0, -200, 800, 200));
    });

    test('is null when empty or wholly outside the view', () {
      expect(
        videoViewport(logical: Rect.zero, devicePixelRatio: 2, viewSize: view),
        isNull,
      );
      expect(
        videoViewport(
          logical: const Rect.fromLTWH(0, 2000, 100, 100),
          devicePixelRatio: 2,
          viewSize: view,
        ),
        isNull,
      );
      expect(
        videoViewport(
          logical: const Rect.fromLTWH(0, -300, 100, 100),
          devicePixelRatio: 2,
          viewSize: view,
        ),
        isNull,
      );
    });
  });

  group('VideoView', () {
    testWidgets('reports its rectangle, and clears it when removed', (
      tester,
    ) async {
      final player = _FakePlayer();
      tester.view
        ..devicePixelRatio = 2
        ..physicalSize = const Size(800, 1600);
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Padding(
            padding: const EdgeInsets.only(left: 10, top: 20),
            child: Align(
              alignment: Alignment.topLeft,
              child: SizedBox(
                width: 100,
                height: 50,
                child: VideoView(player: player),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(player.viewports.last, const Rect.fromLTWH(20, 40, 200, 100));

      await tester.pumpWidget(const SizedBox());
      expect(player.viewports.last, isNull);
    });

    testWidgets('hides while a route above it is opaque', (tester) async {
      final player = _FakePlayer();
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        MaterialApp(
          navigatorKey: navigator,
          home: VideoView(player: player),
        ),
      );
      await tester.pump();
      expect(player.viewports.last, isNotNull);

      unawaited(
        navigator.currentState!.push(
          MaterialPageRoute<void>(builder: (_) => const Text('on top')),
        ),
      );
      await tester.pumpAndSettle();
      expect(player.viewports.last, isNull);

      navigator.currentState!.pop();
      await tester.pumpAndSettle();
      expect(player.viewports.last, isNotNull);
    });
  });
}
