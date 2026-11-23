import 'package:dynamic_color/dynamic_color.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_color_utilities/material_color_utilities.dart';

import 'accent.dart';
import 'tokens.dart';

/// The wallpaper's light and dark colors, mapped onto Matinee's roles as the
/// earlier Android app did: surfaces from Material's containers, the accent
/// from its primary, and the borders, faint text, and shades worked out from
/// the background and text as for any theme. Material's outlines are far
/// stronger than Matinee's hairlines, so they stay out.
///
/// The palette comes from Android's own tonal palettes on Android 12 and
/// later ([DynamicColorPlugin.getCorePalette]), so a wallpaper or a Material
/// You color picked in Settings shows here. Other platforms get none.
class MaterialYouColors {
  const MaterialYouColors({required this.light, required this.dark});

  final KitColors light;
  final KitColors dark;
}

/// The wallpaper's colors, or null where this device hasn't any: an older
/// Android, iOS, or a platform without the plugin. They're read again when
/// the app comes back, as a new wallpaper or a new Material You color is
/// picked while it's away, and the last ones stay until the new ones come.
final materialYouProvider = FutureProvider<MaterialYouColors?>((ref) async {
  if (defaultTargetPlatform != TargetPlatform.android) return null;
  final resumed = AppLifecycleListener(onResume: ref.invalidateSelf);
  ref.onDispose(resumed.dispose);
  try {
    final palette = await DynamicColorPlugin.getCorePalette();
    if (palette == null) return null;
    return materialYouColors(
      primary: palette.primary,
      neutralVariant: palette.neutralVariant,
      error: palette.error,
    );
  } on MissingPluginException {
    return null;
  } on PlatformException {
    return null;
  }
});

/// Material You's roles on the kit's, as `ColorScheme.toThemeColors` in the
/// earlier Android app: the light and dark schemes from the system's primary
/// palette, its neutral variant, and its error palette.
///
/// Surfaces use the neutral variant's tint, which is what Compose's dynamic
/// schemes used before Android 14 and is near enough after it.
MaterialYouColors materialYouColors({
  required TonalPalette primary,
  required TonalPalette neutralVariant,
  required TonalPalette error,
}) => MaterialYouColors(
  light: _scheme(primary, neutralVariant, error, dark: false),
  dark: _scheme(primary, neutralVariant, error, dark: true),
);

KitColors _scheme(
  TonalPalette primary,
  TonalPalette neutralVariant,
  TonalPalette error, {
  required bool dark,
}) {
  Color tone(TonalPalette palette, int at) => Color(palette.get(at));
  final accent = tone(primary, dark ? 80 : 40);
  final onAccent = tone(primary, dark ? 20 : 100);
  final accentDim = tone(primary, dark ? 30 : 90);
  // Material's containers, as Compose maps them: the background is its
  // surface, and the cards, fields, and wells step from there.
  final background = tone(neutralVariant, dark ? 6 : 98);
  final surface = tone(neutralVariant, dark ? 10 : 96);
  final surfaceRaised = tone(neutralVariant, dark ? 12 : 94);
  final surfaceSunken = tone(neutralVariant, dark ? 4 : 100);
  final input = tone(neutralVariant, dark ? 22 : 90);
  final text = tone(neutralVariant, dark ? 90 : 10);
  final textMuted = tone(neutralVariant, dark ? 80 : 30);
  final ramp = dark ? _darkRamp : _lightRamp;
  final base = dark ? matineeDark : matineeLight;
  Color step(double at) => mixColor(background, text, at);
  return KitColors(
    background: background,
    surface: surface,
    surfaceRaised: surfaceRaised,
    surfaceSunken: surfaceSunken,
    input: input,
    border: step(ramp.border),
    borderStrong: step(ramp.borderStrong),
    borderEmphasis: step(ramp.borderEmphasis),
    text: text,
    textMuted: textMuted,
    textDim: step(ramp.textDim),
    textFaint: step(ramp.textFaint),
    accent: accent,
    accentForeground: onAccent,
    accentHover: ensureContrast(
      mixColor(accent, dark ? _white : _black, dark ? .12 : .14),
      onAccent,
      4.5,
    ),
    accentActive: ensureContrast(
      mixColor(accent, dark ? _black : _white, dark ? .14 : .12),
      onAccent,
      4.5,
    ),
    accentDim: accentDim,
    success: ensureContrast(base.success, background, 3),
    warning: ensureContrast(base.warning, background, 3),
    danger: ensureContrast(tone(error, dark ? 80 : 40), background, 3),
    info: ensureContrast(base.info, background, 3),
    live: ensureContrast(base.live, background, 3),
  );
}

typedef _Ramp = ({
  double border,
  double borderStrong,
  double borderEmphasis,
  double textDim,
  double textFaint,
});

// Where each derived step sits between background (0) and text (1), off
// Matinee's own ramps, as `RAMP_POSITIONS` in the earlier Android app.
const _Ramp _lightRamp = (
  border: .114,
  borderStrong: .19,
  borderEmphasis: .367,
  textDim: .62,
  textFaint: .62,
);
const _Ramp _darkRamp = (
  border: .184,
  borderStrong: .264,
  borderEmphasis: .391,
  textDim: .655,
  textFaint: .598,
);

const _black = Color(0xFF000000);
const _white = Color(0xFFFFFFFF);
