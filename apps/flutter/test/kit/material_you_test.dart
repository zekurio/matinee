import 'dart:typed_data';

import 'package:dynamic_color/dynamic_color.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_color_utilities/material_color_utilities.dart';
import 'package:matinee/kit/kit.dart';

void main() {
  // A new wallpaper is picked while the app is away, and shows when it's
  // back, with the old colors on screen until the new ones come.
  testWidgets('the wallpaper is read again when the app comes back', (
    tester,
  ) async {
    var hue = 210.0;
    // What Android answers: its five palettes, thirteen tones each, as the
    // signed ints of a Kotlin IntArray.
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      DynamicColorPlugin.channel,
      (call) async => Int32List.fromList([
        for (final chroma in [48.0, 16.0, 24.0, 4.0, 8.0])
          ...TonalPalette.of(hue, chroma).asList,
      ]),
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        DynamicColorPlugin.channel,
        null,
      ),
    );
    final container = ProviderContainer.test();
    container.listen(materialYouProvider, (_, _) {});
    Color accent(double hue) => Color(TonalPalette.of(hue, 48).get(80));

    final first = await container.read(materialYouProvider.future);
    expect(first?.dark.accent, accent(210));

    hue = 30;
    // Away and back, a step at a time as the engine reports it.
    for (final state in const [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(state);
    }
    expect(container.read(materialYouProvider).value, same(first));
    final second = await container.read(materialYouProvider.future);
    expect(second?.dark.accent, accent(30));
    // Riverpod's own timer for the read it just made again.
    await tester.pump(Duration.zero);
  });

  // The bug it pins: Material You's primary landed on the wrong tone, so the
  // app took Matinee's accent instead of the wallpaper's.
  test('the wallpaper roles land where the earlier Android app put them', () {
    final primary = TonalPalette.of(210, 48);
    final neutralVariant = TonalPalette.of(210, 8);
    final error = TonalPalette.of(25, 84);
    final colors = materialYouColors(
      primary: primary,
      neutralVariant: neutralVariant,
      error: error,
    );
    Color tone(TonalPalette palette, int at) => Color(palette.get(at));

    expect(colors.light.background, tone(neutralVariant, 98));
    expect(colors.light.surface, tone(neutralVariant, 96));
    expect(colors.light.surfaceRaised, tone(neutralVariant, 94));
    expect(colors.light.surfaceSunken, tone(neutralVariant, 100));
    expect(colors.light.input, tone(neutralVariant, 90));
    expect(colors.light.text, tone(neutralVariant, 10));
    expect(colors.light.textMuted, tone(neutralVariant, 30));
    expect(colors.light.accent, tone(primary, 40));
    expect(colors.light.accentForeground, tone(primary, 100));
    expect(colors.light.accentDim, tone(primary, 90));
    expect(colors.light.danger, tone(error, 40));

    expect(colors.dark.background, tone(neutralVariant, 6));
    expect(colors.dark.surface, tone(neutralVariant, 10));
    expect(colors.dark.surfaceRaised, tone(neutralVariant, 12));
    expect(colors.dark.surfaceSunken, tone(neutralVariant, 4));
    expect(colors.dark.input, tone(neutralVariant, 22));
    expect(colors.dark.text, tone(neutralVariant, 90));
    expect(colors.dark.textMuted, tone(neutralVariant, 80));
    expect(colors.dark.accent, tone(primary, 80));
    expect(colors.dark.accentForeground, tone(primary, 20));
    expect(colors.dark.accentDim, tone(primary, 30));
    expect(colors.dark.danger, tone(error, 80));
  });

  // The wall's tint reaches the hairlines, but they stay Matinee's ramp
  // between the background and the text, not Material's stronger outlines.
  test('borders step from the wallpaper background toward its text', () {
    final colors = materialYouColors(
      primary: TonalPalette.of(30, 48),
      neutralVariant: TonalPalette.of(30, 8),
      error: TonalPalette.of(25, 84),
    );

    for (final scheme in [colors.light, colors.dark]) {
      final from = relativeLuminance(scheme.background);
      final to = relativeLuminance(scheme.text);
      final steps = [
        scheme.border,
        scheme.borderStrong,
        scheme.borderEmphasis,
      ].map(relativeLuminance).toList();
      final ahead = (to - from).sign;
      for (final step in steps) {
        expect((step - from).sign, ahead);
        expect((step - to).sign, -ahead);
      }
      expect(steps[0], isNot(steps[1]));
      expect(steps[1], isNot(steps[2]));
      expect((steps[0] - from).abs(), lessThan((steps[2] - from).abs()));
    }
  });
}
