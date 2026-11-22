import 'package:flutter/widgets.dart';

part 'theme_presets.g.dart';

@immutable
class KitColors {
  const KitColors({
    required this.background,
    required this.surface,
    required this.surfaceRaised,
    required this.surfaceSunken,
    required this.input,
    required this.border,
    required this.borderStrong,
    required this.borderEmphasis,
    required this.text,
    required this.textMuted,
    required this.textDim,
    required this.textFaint,
    required this.accent,
    required this.accentForeground,
    required this.accentHover,
    required this.accentActive,
    required this.accentDim,
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
    required this.live,
  });

  final Color background;
  final Color surface;
  final Color surfaceRaised;
  final Color surfaceSunken;
  final Color input;
  final Color border;
  final Color borderStrong;
  final Color borderEmphasis;
  final Color text;
  final Color textMuted;
  final Color textDim;
  final Color textFaint;
  final Color accent;
  final Color accentForeground;
  final Color accentHover;
  final Color accentActive;
  final Color accentDim;
  final Color success;
  final Color warning;
  final Color danger;
  final Color info;
  final Color live;

  Color get foreground => text;
  Color get mutedForeground => textDim;
  Color get popover => surfaceRaised;
  Color get muted => surfaceRaised;
  Color get secondary => input;
  Color get field => surfaceSunken;
  Color get inputBorder => borderStrong;
  Color get inputHover => borderEmphasis;
  Color get hairline => foreground.withValues(alpha: .1);
  Color get accentSoft => accent.withValues(alpha: isDark ? .22 : .12);
  bool get isDark => background.computeLuminance() < .179;

  KitColors lerp(KitColors other, double t) => KitColors(
    background: Color.lerp(background, other.background, t)!,
    surface: Color.lerp(surface, other.surface, t)!,
    surfaceRaised: Color.lerp(surfaceRaised, other.surfaceRaised, t)!,
    surfaceSunken: Color.lerp(surfaceSunken, other.surfaceSunken, t)!,
    input: Color.lerp(input, other.input, t)!,
    border: Color.lerp(border, other.border, t)!,
    borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
    borderEmphasis: Color.lerp(borderEmphasis, other.borderEmphasis, t)!,
    text: Color.lerp(text, other.text, t)!,
    textMuted: Color.lerp(textMuted, other.textMuted, t)!,
    textDim: Color.lerp(textDim, other.textDim, t)!,
    textFaint: Color.lerp(textFaint, other.textFaint, t)!,
    accent: Color.lerp(accent, other.accent, t)!,
    accentForeground: Color.lerp(accentForeground, other.accentForeground, t)!,
    accentHover: Color.lerp(accentHover, other.accentHover, t)!,
    accentActive: Color.lerp(accentActive, other.accentActive, t)!,
    accentDim: Color.lerp(accentDim, other.accentDim, t)!,
    success: Color.lerp(success, other.success, t)!,
    warning: Color.lerp(warning, other.warning, t)!,
    danger: Color.lerp(danger, other.danger, t)!,
    info: Color.lerp(info, other.info, t)!,
    live: Color.lerp(live, other.live, t)!,
  );
}

abstract final class KitRadius {
  static const sm = 6.0;
  static const md = 8.0;
  static const lg = 10.0;
  static const xl = 14.0;

  /// A big card: a tablet's featured title, which takes a corner to match.
  static const xxl = 20.0;

  static const control = BorderRadius.all(Radius.circular(lg));
  static const panel = BorderRadius.all(Radius.circular(xl));
  static const pill = BorderRadius.all(Radius.circular(999));
}

enum KitText {
  px11(11, 16),
  xs(12, 16),
  px13(13, 20),
  sm(14, 20),
  px15(15, 22),
  base(16, 24),
  lg(18, 28),
  xl(20, 28),
  px22(22, 28),
  xxl(24, 32),
  px26(26, 32),
  px28(28, 32),
  xxxl(30, 36);

  const KitText(this.size, this.lineHeight);

  static const family = 'Red Hat Text';
  final double size;
  final double lineHeight;

  TextStyle style({
    Color? color,
    FontWeight weight = FontWeight.w400,
    double? leading,
  }) => TextStyle(
    fontFamily: family,
    fontSize: size,
    height: (leading ?? lineHeight) / size,
    fontWeight: weight,
    fontVariations: [FontVariation('wght', weight.value.toDouble())],
    color: color,
  );
}
