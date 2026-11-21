import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/player/seek_bar.dart';
import 'package:matinee/player/trickplay.dart';

import '../media/harness.dart';
import 'playback_fakes.dart';

const _images = Trickplay(
  key: 'k',
  width: 160,
  height: 90,
  columns: 5,
  rows: 4,
  count: 50,
  intervalSeconds: 10,
);

void main() {
  setUpAll(loadFont);

  test('cuts the frame for a time out of its tile', () {
    expect(trickplayCell(_images, 0), (tile: 0, column: 0, row: 0));
    expect(trickplayCell(_images, 75), (tile: 0, column: 2, row: 1));
    // The 21st frame starts the second tile of 20.
    expect(trickplayCell(_images, 205), (tile: 1, column: 0, row: 0));
    // Past the end, the last frame.
    expect(trickplayCell(_images, 9999), (tile: 2, column: 4, row: 1));
    expect(trickplayCell(_images, double.nan), (tile: 0, column: 0, row: 0));
  });

  test('the session reads the frames once they are ready', () async {
    final backend = FakePlaybackApi()
      ..trickplay = const TrickplayStatusReady(images: _images);
    final player = FakePlayer();
    final session = backend.session(player);
    addTearDown(() async {
      await session.close();
      session.dispose();
    });
    await session.start();
    await Future<void>.delayed(Duration.zero);
    expect(backend.trickplayRequests, 1);
    expect(session.trickplay?.key, 'k');
  });

  testWidgets('the seek bar shows the frame only while scrubbing', (
    tester,
  ) async {
    Future<void> pump({required bool scrubbing, double position = 300}) =>
        tester.pumpWidget(
          Directionality(
            textDirection: TextDirection.ltr,
            child: MatineeTheme.wrap(
              matineeDark,
              Align(
                alignment: Alignment.bottomCenter,
                child: SizedBox(
                  width: 600,
                  child: SeekBar(
                    position: position,
                    duration: 600,
                    buffered: null,
                    scrubbing: scrubbing,
                    back: 10,
                    ahead: 10,
                    label: 'Playback position',
                    describe: (a, b) => '$a of $b',
                    onScrub: (_) {},
                    onScrubEnd: () {},
                    onSeek: (_) {},
                    preview: (seconds) => SizedBox(
                      key: ValueKey(seconds),
                      width: SeekBar.previewWidth,
                      height: 99,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
    await pump(scrubbing: false);
    expect(find.byKey(const ValueKey(300.0)), findsNothing);
    await pump(scrubbing: true);
    final frame = tester.getRect(find.byKey(const ValueKey(300.0)));
    // Centered over the scrubbed time, halfway along.
    expect(frame.center.dx, closeTo(400, 1));
    // At the end it stays inside the bar.
    await pump(scrubbing: true, position: 600);
    expect(
      tester.getRect(find.byKey(const ValueKey(600.0))).right,
      lessThanOrEqualTo(700),
    );
  });
}
