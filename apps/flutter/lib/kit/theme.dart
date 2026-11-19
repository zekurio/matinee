import 'package:flutter/material.dart';

import 'tokens.dart';

/// Matinee's web color roles, available in any route through Flutter's Theme.
class MatineeTheme extends ThemeExtension<MatineeTheme> {
  const MatineeTheme(this.colors);

  final KitColors colors;

  static KitColors of(BuildContext context) {
    final theme = Theme.of(context);
    return theme.extension<MatineeTheme>()?.colors ??
        (theme.brightness == Brightness.dark ? matineeDark : matineeLight);
  }

  static ThemeData data(KitColors colors) {
    final brightness = colors.isDark ? Brightness.dark : Brightness.light;
    final base = ThemeData(
      brightness: brightness,
      fontFamily: KitText.family,
      scaffoldBackgroundColor: colors.background,
      canvasColor: colors.background,
      colorScheme: ColorScheme.fromSeed(
        seedColor: colors.accent,
        brightness: brightness,
        primary: colors.accent,
        onPrimary: colors.accentForeground,
        surface: colors.background,
        onSurface: colors.foreground,
        error: colors.danger,
      ),
      splashFactory: NoSplash.splashFactory,
      splashColor: Colors.transparent,
      highlightColor: Colors.transparent,
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: colors.accent,
        selectionColor: colors.accentSoft,
        selectionHandleColor: colors.accent,
      ),
      extensions: [MatineeTheme(colors)],
    );
    return base.copyWith(
      textTheme: base.textTheme.apply(
        bodyColor: colors.foreground,
        displayColor: colors.foreground,
      ),
    );
  }

  @override
  MatineeTheme copyWith({KitColors? colors}) =>
      MatineeTheme(colors ?? this.colors);

  @override
  MatineeTheme lerp(MatineeTheme? other, double t) =>
      other == null ? this : MatineeTheme(colors.lerp(other.colors, t));
}

enum ThemePreset {
  matinee(matineeLight, matineeDark);

  const ThemePreset(this.light, this.dark);

  final KitColors light;
  final KitColors dark;
}

enum ThemeAppearance { system, light, dark }
