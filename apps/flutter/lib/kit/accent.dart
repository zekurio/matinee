import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'tokens.dart';

/// A server's accent on the kit's theme, as `withThemeAccent` in the web's
/// `packages/ui/src/lib/theme-colors.ts` and its colour maths in
/// `theme-color-math.ts`: the admin's colour, moved just far enough from
/// the background to read on it and on its own soft tint, with the
/// hover, pressed, and dim shades and the text that goes on it worked
/// out from there. Contrast follows WCAG's relative luminance, and the
/// mixing happens in OKLab, so a shade never passes through grey.
KitColors withThemeAccent(KitColors colors, Color seed) {
  final background = colors.background;
  final dark = _isDark(background);
  final accent = _ensureTintedContrast(
    _opaque(seed),
    background,
    dark ? .22 : .12,
    4.5,
  );
  final foreground = readableForeground(accent);
  return KitColors(
    background: colors.background,
    surface: colors.surface,
    surfaceRaised: colors.surfaceRaised,
    surfaceSunken: colors.surfaceSunken,
    input: colors.input,
    border: colors.border,
    borderStrong: colors.borderStrong,
    borderEmphasis: colors.borderEmphasis,
    text: colors.text,
    textMuted: colors.textMuted,
    textDim: colors.textDim,
    textFaint: colors.textFaint,
    accent: accent,
    accentForeground: foreground,
    accentHover: _ensureContrast(
      mixColor(accent, dark ? _white : _black, dark ? .12 : .14),
      foreground,
      4.5,
    ),
    accentActive: _ensureContrast(
      mixColor(accent, dark ? _black : _white, dark ? .14 : .12),
      foreground,
      4.5,
    ),
    accentDim: mixColor(accent, background, .58),
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
    live: colors.live,
  );
}

/// [colors] with the accent [hex] names, or as they are when it names
/// none.
KitColors accented(KitColors colors, String? hex) =>
    switch (parseHexColor(hex)) {
      final seed? => withThemeAccent(colors, seed),
      null => colors,
    };

/// The colour a `#rrggbb` or `#rgb` names, or null for anything else.
Color? parseHexColor(String? text) {
  final match = RegExp(r'^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')
      .firstMatch(text?.trim() ?? '');
  if (match == null) return null;
  var digits = match.group(1)!;
  if (digits.length == 3) {
    digits = [for (final digit in digits.split('')) '$digit$digit'].join();
  }
  return Color(0xFF000000 | int.parse(digits, radix: 16));
}

const _black = Color(0xFF000000);
const _white = Color(0xFFFFFFFF);
const _softBlack = Color(0xFF100E12);
const _softWhite = Color(0xFFFAF8FC);

Color _opaque(Color color) => color.withValues(alpha: 1);

bool _isDark(Color color) => relativeLuminance(color) < .179;

/// Whichever of near white, near black, white, and black reads best on
/// [background].
Color readableForeground(Color background) {
  var best = _softWhite;
  for (final candidate in const [_softBlack, _white, _black]) {
    if (contrastRatio(candidate, background) >
        contrastRatio(best, background)) {
      best = candidate;
    }
  }
  return best;
}

double contrastRatio(Color first, Color second) {
  final a = relativeLuminance(first);
  final b = relativeLuminance(second);
  return (math.max(a, b) + .05) / (math.min(a, b) + .05);
}

/// [color] lightened or darkened just enough to reach [minimum] on
/// [background].
Color _ensureContrast(Color color, Color background, double minimum) => _adjust(
  color,
  _contrastTarget(background),
  (candidate) => contrastRatio(candidate, background) >= minimum,
);

/// As [_ensureContrast], and readable on its own tint at [tintAlpha] too,
/// which is how a picked row or chip shows it.
Color _ensureTintedContrast(
  Color color,
  Color background,
  double tintAlpha,
  double minimum,
) => _adjust(color, _contrastTarget(background), (candidate) {
  final tint = Color.lerp(background, candidate, tintAlpha)!;
  return contrastRatio(candidate, background) >= minimum &&
      contrastRatio(candidate, tint) >= minimum;
});

Color _contrastTarget(Color background) =>
    contrastRatio(_white, background) > contrastRatio(_black, background)
    ? _white
    : _black;

Color _adjust(Color color, Color target, bool Function(Color) accepts) {
  if (accepts(color)) return color;
  var low = 0.0;
  var high = 1.0;
  for (var step = 0; step < 16; step++) {
    final amount = (low + high) / 2;
    if (accepts(mixColor(color, target, amount))) {
      high = amount;
    } else {
      low = amount;
    }
  }
  return mixColor(color, target, high);
}

double _linearize(double channel) => channel <= .04045
    ? channel / 12.92
    : math.pow((channel + .055) / 1.055, 2.4).toDouble();

double relativeLuminance(Color color) =>
    .2126 * _linearize(color.r) +
    .7152 * _linearize(color.g) +
    .0722 * _linearize(color.b);

/// [first] toward [second] by [amount], in OKLab.
Color mixColor(Color first, Color second, double amount) {
  final start = _toOklab(first);
  final end = _toOklab(second);
  return _fromOklab((
    start.$1 + (end.$1 - start.$1) * amount,
    start.$2 + (end.$2 - start.$2) * amount,
    start.$3 + (end.$3 - start.$3) * amount,
  ));
}

double _cbrt(double value) => value < 0
    ? -math.pow(-value, 1 / 3).toDouble()
    : math.pow(value, 1 / 3).toDouble();

(double, double, double) _toOklab(Color color) {
  final red = _linearize(color.r);
  final green = _linearize(color.g);
  final blue = _linearize(color.b);
  final l = _cbrt(.4122214708 * red + .5363325363 * green + .0514459929 * blue);
  final m = _cbrt(.2119034982 * red + .6806995451 * green + .1073969566 * blue);
  final s = _cbrt(.0883024619 * red + .2817188376 * green + .6299787005 * blue);
  return (
    .2104542553 * l + .793617785 * m - .0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .808675766 * s,
  );
}

Color _fromOklab((double, double, double) lab) {
  final (lightness, a, b) = lab;
  final l = math.pow(lightness + .3963377774 * a + .2158037573 * b, 3);
  final m = math.pow(lightness - .1055613458 * a - .0638541728 * b, 3);
  final s = math.pow(lightness - .0894841775 * a - 1.291485548 * b, 3);
  int encode(num channel) {
    final value = channel <= .0031308
        ? channel * 12.92
        : 1.055 * math.pow(channel, 1 / 2.4) - .055;
    return (value.clamp(0, 1) * 255).round();
  }

  return Color.fromARGB(
    255,
    encode(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s),
    encode(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s),
    encode(-.0041960863 * l - .7034186147 * m + 1.707614701 * s),
  );
}
