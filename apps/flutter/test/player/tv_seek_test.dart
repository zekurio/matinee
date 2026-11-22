import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/player/tv/tv_seek.dart';

void main() {
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
}
