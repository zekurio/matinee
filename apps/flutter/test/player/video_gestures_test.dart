import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/player/player_controls.dart';
import 'package:matinee/player/player_overlays.dart';
import 'package:matinee/player/player_preferences.dart';
import 'package:matinee/player/swipe.dart';
import 'package:matinee/player/video_gestures.dart';

import '../media/harness.dart';

class FakeLevels implements DeviceLevels {
  double brightness = .5;
  double? volume = .25;
  final brightnessSet = <double?>[];
  final volumeSet = <double>[];

  @override
  Future<({double brightness, double? volume})> read() async =>
      (brightness: brightness, volume: volume);

  @override
  Future<double> setVolume(double level) async {
    volumeSet.add(level);
    // A device with 10 steps.
    return volume = (level * 10).round() / 10;
  }

  @override
  Future<void> setBrightness(double? level) async => brightnessSet.add(level);
}

class _Log {
  int taps = 0;
  final doubleTaps = <bool>[];
  final pinches = <bool>[];
  final seeks = <double>[];
  final holds = <bool>[];
  final starts = <GestureKind>[];
  final brightness = <double>[];
}

Future<(_Log, FakeLevels, ValueNotifier<GestureInfo?>)> _pump(
  WidgetTester tester, {
  PlayerPrefs prefs = const PlayerPrefs(),
  bool enabled = true,
  bool playing = true,
}) async {
  tester.view.physicalSize = const Size(800, 400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final log = _Log();
  final levels = FakeLevels();
  final notes = ValueNotifier<GestureInfo?>(null);
  addTearDown(notes.dispose);
  await tester.pumpWidget(
    Localizations(
      locale: const Locale('en'),
      delegates: AppLocalizations.localizationsDelegates,
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: MatineeTheme.wrap(
          matineeDark,
          Stack(
            fit: StackFit.expand,
            children: [
              VideoGestures(
                enabled: enabled,
                prefs: prefs,
                levels: levels,
                duration: () => 600,
                position: () => 100,
                playing: () => playing,
                notes: notes,
                onTap: () => log.taps++,
                onDoubleTap: log.doubleTaps.add,
                onPinch: log.pinches.add,
                onSeek: log.seeks.add,
                onHold: (start) {
                  log.holds.add(start);
                  return true;
                },
                onStart: log.starts.add,
                onBrightness: log.brightness.add,
              ),
              ValueListenableBuilder(
                valueListenable: notes,
                builder: (context, _, _) => GestureNotes(
                  notes: notes,
                  duration: 600,
                  holding: log.holds.isNotEmpty && log.holds.last,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  return (log, levels, notes);
}

void main() {
  setUpAll(loadFont);

  test('swipes go as far as in the Kotlin app', () {
    expect(swipeLevel(.5, -400 * swipeFullRange / 2, 400), closeTo(1, 1e-9));
    expect(swipeLevel(.5, 1000, 400), 0);
    expect(swipeLevel(double.nan, 0, 400), 0);
    for (final level in [0.0, .2, .5, .8, 1.0]) {
      expect(levelOfBrightness(brightnessOfLevel(level)), closeTo(level, 1e-6));
    }
    expect(brightnessOfLevel(0), minBrightness);
    expect(brightnessOfLevel(1), closeTo(1, 1e-6));
    expect(swipeSeek(100, 40, 600), 110);
    expect(swipeSeek(100, -1000, 600), 0);
    expect(swipeSeek(590, 1000, 600), 600);
  });

  testWidgets('a tap waits for a second one, which skips by its side', (
    tester,
  ) async {
    final (log, _, _) = await _pump(tester);
    await tester.tapAt(const Offset(400, 200));
    expect(log.taps, 0);
    await tester.pump(kDoubleTapTimeout);
    expect(log.taps, 1);
    await tester.tapAt(const Offset(600, 200));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tapAt(const Offset(610, 200));
    await tester.pump(kDoubleTapTimeout);
    await tester.tapAt(const Offset(100, 200));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tapAt(const Offset(100, 210));
    await tester.pump(kDoubleTapTimeout);
    expect(log.doubleTaps, [true, false]);
    expect(log.taps, 1);
  });

  testWidgets('up and down set the brightness on the left, the volume on '
      'the right', (tester) async {
    final (log, levels, notes) = await _pump(
      tester,
      prefs: const PlayerPrefs(rememberBrightness: true),
    );
    final left = await tester.startGesture(const Offset(200, 300));
    await tester.pump();
    await left.moveBy(const Offset(0, -40));
    await left.moveBy(const Offset(0, -40));
    await tester.pump();
    expect(notes.value?.kind, GestureKind.brightness);
    expect(notes.value!.level, greaterThan(.5));
    await tester.pump();
    expect(find.text('80%'), findsOneWidget);
    await left.up();
    await tester.pump();
    expect(levels.brightnessSet.last, greaterThan(.5));
    expect(log.brightness.single, greaterThan(.5));
    expect(log.taps, 0);
    // The note lingers a moment after the finger lifts.
    await tester.pump(const Duration(seconds: 1));

    final right = await tester.startGesture(const Offset(600, 300));
    await tester.pump();
    await right.moveBy(const Offset(0, -30));
    await right.moveBy(const Offset(0, -60));
    await tester.pump();
    expect(notes.value?.kind, GestureKind.volume);
    expect(levels.volumeSet, isNotEmpty);
    // The note shows the step the device reached.
    expect(notes.value!.level, levels.volume);
    await right.up();
    await tester.pump(const Duration(seconds: 1));
    expect(log.starts, [GestureKind.brightness, GestureKind.volume]);
  });

  testWidgets('sideways seeks where the finger lifts, and a second finger '
      'cancels it', (tester) async {
    final (log, _, notes) = await _pump(tester);
    final finger = await tester.startGesture(const Offset(300, 200));
    await finger.moveBy(const Offset(20, 0));
    await finger.moveBy(const Offset(20, 0));
    await tester.pump();
    expect(notes.value?.kind, GestureKind.seek);
    expect(find.text('+0:10'), findsOneWidget);
    expect(find.text('1:50 / 10:00'), findsOneWidget);
    await finger.up();
    expect(log.seeks, [110]);

    final one = await tester.startGesture(const Offset(300, 200));
    await one.moveBy(const Offset(40, 0));
    final two = await tester.startGesture(const Offset(500, 200));
    await two.moveBy(const Offset(200, 0));
    await one.up();
    await two.up();
    expect(log.seeks, [110]);
    // Spreading two fingers is a pinch to fill.
    expect(log.pinches, [true]);
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('a held finger plays faster until it lifts', (tester) async {
    final (log, _, _) = await _pump(tester);
    final finger = await tester.startGesture(const Offset(400, 200));
    await tester.pump(kLongPressTimeout + const Duration(milliseconds: 10));
    expect(log.holds, [true]);
    await finger.moveBy(const Offset(60, 0));
    await finger.up();
    expect(log.holds, [true, false]);
    // Lifting from a hold isn't a tap.
    await tester.pump(kDoubleTapTimeout);
    expect(log.taps, 0);
    expect(log.seeks, isEmpty);
  });

  testWidgets('the system edges, settings, and a disabled player keep '
      'swipes away but not taps', (tester) async {
    final (log, _, _) = await _pump(
      tester,
      prefs: const PlayerPrefs(swipeSeek: false, holdSpeed: false),
    );
    // Sideways is off in settings.
    final off = await tester.startGesture(const Offset(300, 200));
    await off.moveBy(const Offset(80, 0));
    await off.up();
    // From the top edge, where the system pulls down its shade.
    final edge = await tester.startGesture(const Offset(200, 10));
    await edge.moveBy(const Offset(0, 80));
    await edge.up();
    final held = await tester.startGesture(const Offset(400, 200));
    await tester.pump(kLongPressTimeout * 2);
    await held.up();
    await tester.pump(kDoubleTapTimeout);
    expect(log.starts, isEmpty);
    expect(log.holds, isEmpty);
    expect(log.taps, 1);

    final (disabled, _, _) = await _pump(tester, enabled: false);
    final swipe = await tester.startGesture(const Offset(200, 300));
    await swipe.moveBy(const Offset(0, -80));
    await swipe.up();
    await tester.tapAt(const Offset(400, 200));
    await tester.pump(kDoubleTapTimeout);
    expect(disabled.starts, isEmpty);
    expect(disabled.taps, 1);
  });

  for (final (width, expectMore) in [(320.0, true), (1280.0, false)]) {
    testWidgets('the top bar at $width puts what does not fit behind More', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      var locked = 0;
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: MatineeTheme.wrap(
            matineeDark,
            Overlay(
              initialEntries: [
                OverlayEntry(
                  builder: (context) => PlayerControls(
                    title: 'The Blood Warfare',
                    subtitle: null,
                    backLabel: 'Back',
                    onBack: () {},
                    moreLabel: 'More',
                    menus: [
                      for (final (icon, label) in [
                        (Lucide.pictureInPicture, 'Picture in picture'),
                        (Lucide.audioLines, 'Audio'),
                        (Lucide.captions, 'Subtitles'),
                        (Lucide.gauge, 'Speed'),
                        (Lucide.settings, 'Quality'),
                      ])
                        PlayerMenuButton(
                          icon: icon,
                          label: label,
                          onPressed: () {},
                        ),
                      PlayerMenuButton(
                        icon: Lucide.lock,
                        label: 'Lock controls',
                        onPressed: () => locked++,
                      ),
                    ],
                    transport: const SizedBox(),
                    seekBar: const SizedBox(height: 48),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      expect(tester.takeException(), isNull);
      expect(
        find.bySemanticsLabel('More'),
        expectMore ? findsOne : findsNothing,
      );
      if (expectMore) {
        await tester.tap(find.bySemanticsLabel('More'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Lock controls'));
        await tester.pumpAndSettle();
      } else {
        await tester.tap(find.bySemanticsLabel('Lock controls'));
      }
      expect(locked, 1);
    });
  }

  testWidgets('locked, a touch shows the unlock button, which unlocks', (
    tester,
  ) async {
    var unlocked = 0;
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: MatineeTheme.wrap(
          matineeDark,
          PlayerLocked(
            reveals: 0,
            unlockLabel: 'Unlock',
            onUnlock: () => unlocked++,
          ),
        ),
      ),
    );
    await tester.pump(PlayerLocked.hideAfter);
    await tester.pumpAndSettle();
    // Hidden, the first touch on it only shows it.
    await tester.tap(find.bySemanticsLabel('Unlock'));
    await tester.pump();
    expect(unlocked, 0);
    await tester.tap(find.bySemanticsLabel('Unlock'));
    await tester.pump();
    expect(unlocked, 1);
    await tester.pump(PlayerLocked.hideAfter);
  });
}
