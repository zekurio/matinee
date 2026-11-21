import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/accent.dart';
import 'package:matinee/kit/tokens.dart';

void main() {
  test("the theme's own accent stays as it is", () {
    final colors = withThemeAccent(matineeLight, matineeLight.accent);
    expect(colors.accent, matineeLight.accent);
    expect(colors.background, matineeLight.background);
  });

  test('a pale accent darkens until it reads on a light page', () {
    final colors = withThemeAccent(matineeLight, const Color(0xFFFACC15));
    expect(
      contrastRatio(colors.accent, matineeLight.background),
      greaterThanOrEqualTo(4.5),
    );
    // And on its own tint, as a picked chip shows it.
    final tint = Color.lerp(matineeLight.background, colors.accent, .12)!;
    expect(contrastRatio(colors.accent, tint), greaterThanOrEqualTo(4.5));
    // Still yellow's hue, only darker.
    expect(colors.accent.r, greaterThan(colors.accent.b));
  });

  test('a dark accent lightens on a dark page', () {
    final colors = withThemeAccent(matineeDark, const Color(0xFF1E1B4B));
    expect(
      contrastRatio(colors.accent, matineeDark.background),
      greaterThanOrEqualTo(4.5),
    );
  });

  test('the text on the accent and on its shades stays readable', () {
    for (final seed in const [
      Color(0xFFFACC15),
      Color(0xFF0369A1),
      Color(0xFFF43F5E),
      Color(0xFFFFFFFF),
    ]) {
      for (final base in [matineeLight, matineeDark]) {
        final colors = withThemeAccent(base, seed);
        for (final shade in [
          colors.accent,
          colors.accentHover,
          colors.accentActive,
        ]) {
          expect(
            contrastRatio(colors.accentForeground, shade),
            greaterThanOrEqualTo(4.5),
            reason: '$seed on ${base.isDark ? 'dark' : 'light'}',
          );
        }
      }
    }
  });

  test('a value that names no colour leaves the preset', () {
    expect(accented(matineeDark, null), same(matineeDark));
    expect(accented(matineeDark, 'rose'), same(matineeDark));
    expect(accented(matineeDark, '#f43f5e').accent, isNot(matineeDark.accent));
    expect(parseHexColor('#abc'), const Color(0xFFAABBCC));
  });
}
