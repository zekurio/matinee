import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../kit/accent.dart';
import '../kit/material_you.dart';
import '../kit/theme_store.dart';
import '../kit/tokens.dart';
import 'device.dart';
import 'server_accents.dart';

typedef AppColors = ({KitColors light, KitColors dark});

/// The light and dark colors the app paints with, so the app and the
/// Appearance page's miniatures agree.
///
/// Where Material You is on, they're the wallpaper's, and the server's
/// accents and the preset stay out of the way. Otherwise they're the
/// preset's with the server's accents over them, or the Branding page's
/// before they're saved, as the web paints them. A TV keeps Matinee's own.
final appColorsProvider = Provider<AppColors>((ref) {
  final preferences =
      ref.watch(themeStoreProvider).value ?? defaultThemePreferences;
  final wallpaper = preferences.materialYou && !ref.watch(deviceProvider).isTv
      ? ref.watch(materialYouProvider).value
      : null;
  if (wallpaper != null) return (light: wallpaper.light, dark: wallpaper.dark);
  final accents =
      ref.watch(accentPreviewProvider) ?? ref.watch(serverAccentsProvider);
  return (
    light: accented(preferences.preset.light, accents?.light),
    dark: accented(preferences.preset.dark, accents?.dark),
  );
});
