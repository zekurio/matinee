import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/player/player_controls.dart';

import '../media/harness.dart';

void main() {
  setUpAll(loadFont);

  // The case that needed it: a white card filling the picture, where the
  // middle buttons were white on white.
  testWidgets('the controls over a bright picture', (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: MatineeTheme.wrap(
          matineeDark,
          Stack(
            fit: StackFit.expand,
            children: [
              const ColoredBox(color: Color(0xFFFFFFFF)),
              const PlayerDim(),
              PlayerControls(
                title: 'The Blood Warfare',
                subtitle: 'S17E01 · Bleach',
                backLabel: 'Back',
                onBack: () {},
                menus: const [],
                transport: PlayerTransport(
                  playing: true,
                  loading: false,
                  playLabel: 'Play',
                  pauseLabel: 'Pause',
                  onTogglePlay: () {},
                  back: (seconds: 10, label: 'Back 10', onPressed: () {}),
                  ahead: (seconds: 15, label: 'Ahead 15', onPressed: () {}),
                  episodes: (
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
                  ),
                ),
                seekBar: const SizedBox(height: 48),
              ),
            ],
          ),
        ),
      ),
    );
    await expectLater(
      find.byType(Stack).first,
      matchesGoldenFile('goldens/player_controls_bright.png'),
    );
  });
}
