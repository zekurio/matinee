import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_color_utilities/material_color_utilities.dart';
import 'package:matinee/kit/kit.dart';

void main() {
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
