import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/player/player_controls.dart';

import '../media/harness.dart';

Widget _controls({required bool episode}) => PlayerControls(
  title: 'The Blood Warfare',
  subtitle: 'S17E01 · Bleach',
  backLabel: 'Back',
  onBack: () {},
  menus: [
    for (final icon in [Lucide.audioLines, Lucide.captions, Lucide.gauge])
      PlayerMenuButton(icon: icon, label: icon, onPressed: () {}),
  ],
  transport: PlayerTransport(
    playing: true,
    loading: false,
    playLabel: 'Play',
    pauseLabel: 'Pause',
    onTogglePlay: () {},
    back: (seconds: 10, label: 'Back 10', onPressed: () {}),
    ahead: (seconds: 30, label: 'Ahead 30', onPressed: () {}),
    episodes: episode
        ? (
            const PlayerEpisodeButton(
              icon: Lucide.skipBack,
              label: 'Previous episode',
              onPressed: null,
            ),
            PlayerEpisodeButton(
              icon: Lucide.skipForward,
              label: 'Next episode',
              onPressed: () {},
            ),
          )
        : null,
  ),
  seekBar: const SizedBox(height: 48),
);

void main() {
  setUpAll(loadFont);

  test(
    'the row keeps its gaps where it fits, and shrinks where it does not',
    () {
      const sizes = <double>[64, 72, 96, 72, 64];
      expect(transportFit(sizes, 1280), (gap: 32.0, scale: 1.0));
      final closer = transportFit(sizes, 400);
      expect(closer.scale, 1);
      expect(closer.gap, inInclusiveRange(8, 32));
      for (final width in <double>[320, 300, 240, 120]) {
        final fit = transportFit(sizes, width);
        final used = sizes.fold(0.0, (a, b) => a + b) * fit.scale + 4 * fit.gap;
        expect(used, lessThanOrEqualTo(width + 1e-9), reason: '$width');
      }
      expect(transportFit(sizes, 320).scale * 64, greaterThan(48));
    },
  );

  for (final (width, height) in [
    (320.0, 568.0),
    (568.0, 320.0),
    (800.0, 1280.0),
  ]) {
    for (final scale in [1.0, 1.5, 2.0, 2.5]) {
      for (final episode in [true, false]) {
        testWidgets('fits $width×$height at text ×$scale, episode $episode', (
          tester,
        ) async {
          tester.view.physicalSize = Size(width, height);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          await tester.pumpWidget(
            MediaQuery(
              data: MediaQueryData(
                size: Size(width, height),
                textScaler: TextScaler.linear(scale),
              ),
              child: Directionality(
                textDirection: TextDirection.ltr,
                child: MatineeTheme.wrap(
                  matineeDark,
                  _controls(episode: episode),
                ),
              ),
            ),
          );
          expect(tester.takeException(), isNull);
          final row = tester.getRect(
            find.descendant(
              of: find.byType(PlayerTransport),
              matching: find.byType(Row),
            ),
          );
          expect(row.left, greaterThanOrEqualTo(0));
          expect(row.right, lessThanOrEqualTo(width));
          // Every button stays a comfortable target.
          for (final button in tester.widgetList<RoundIconButton>(
            find.byType(RoundIconButton),
          )) {
            final size = tester.getRect(find.byWidget(button));
            expect(size.width, greaterThanOrEqualTo(44), reason: button.label);
          }
        });
      }
    }
  }
}
