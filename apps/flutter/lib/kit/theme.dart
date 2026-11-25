import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';

import 'tokens.dart';

/// Matinee's web color roles, available in any route through Flutter's Theme.
class MatineeTheme extends ThemeExtension<MatineeTheme> {
  const MatineeTheme(this.colors, {this.darkColors});

  final KitColors colors;

  /// The theme's dark half, when [colors] is its light one.
  final KitColors? darkColors;

  /// The dark half of the theme [colors] belongs to, for what stays dark
  /// in either scheme, like a player's controls over its art.
  KitColors get dark => darkColors ?? (colors.isDark ? colors : matineeDark);

  static KitColors of(BuildContext context) {
    final theme = Theme.of(context);
    return theme.extension<MatineeTheme>()?.colors ??
        (theme.brightness == Brightness.dark ? matineeDark : matineeLight);
  }

  /// The dark half of the theme in use, whichever scheme shows.
  static KitColors darkOf(BuildContext context) {
    final theme = Theme.of(context);
    return theme.extension<MatineeTheme>()?.dark ??
        (theme.brightness == Brightness.dark ? of(context) : matineeDark);
  }

  static Widget wrap(KitColors colors, Widget child) =>
      Theme(data: data(colors), child: child);

  /// [child] in the theme's dark half, light text over dark shades, as the
  /// web's `dark` class does to a part of the page.
  static Widget alwaysDark(BuildContext context, Widget child) {
    final dark = darkOf(context);
    return Theme(data: data(dark), child: child);
  }

  /// [dark] is the theme's dark half when [colors] is its light one.
  static ThemeData data(KitColors colors, {KitColors? dark}) {
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
      // A page opening over another moves the platform's way, named here
      // rather than left to Flutter's defaults, which have changed before:
      // Android's slide and fade, which follows a predictive Back as it's
      // dragged, and iOS's slide with the swipe back from the edge.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
      splashColor: Colors.transparent,
      highlightColor: Colors.transparent,
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: colors.accent,
        selectionColor: colors.accentSoft,
        selectionHandleColor: colors.accent,
      ),
      extensions: [MatineeTheme(colors, darkColors: dark)],
    );
    return base.copyWith(
      textTheme: base.textTheme.apply(
        bodyColor: colors.foreground,
        displayColor: colors.foreground,
      ),
    );
  }

  @override
  MatineeTheme copyWith({KitColors? colors, KitColors? dark}) =>
      MatineeTheme(colors ?? this.colors, darkColors: dark ?? darkColors);

  @override
  MatineeTheme lerp(MatineeTheme? other, double t) => other == null
      ? this
      : MatineeTheme(
          colors.lerp(other.colors, t),
          darkColors: t < .5 ? darkColors : other.darkColors,
        );
}

enum ThemePreset {
  matinee(matineeLight, matineeDark);

  const ThemePreset(this.light, this.dark);

  final KitColors light;
  final KitColors dark;
}

enum ThemeAppearance { system, light, dark }
