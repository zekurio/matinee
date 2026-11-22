import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';

import 'theme.dart';

final _lightGlass = _glassFilter(40, 1.2, 1);
final _darkGlass = _glassFilter(24, 1.8, .8);

ui.ImageFilter _glassFilter(double blur, double saturation, double brightness) {
  const weights = [.213, .715, .072];
  return ui.ImageFilter.compose(
    inner: ui.ImageFilter.blur(sigmaX: blur, sigmaY: blur),
    outer: ColorFilter.matrix([
      for (var channel = 0; channel < 3; channel++) ...[
        for (var input = 0; input < 3; input++)
          brightness *
              (weights[input] * (1 - saturation) +
                  (input == channel ? saturation : 0)),
        0.0,
        0.0,
      ],
      0,
      0,
      0,
      1,
      0,
    ]),
  );
}

class Glass extends StatelessWidget {
  const Glass({
    super.key,
    required this.child,
    this.shape = BorderRadius.zero,
    this.border,
    this.shadow = const [],
    this.filter,
    this.tint,
    this.solid,
  });

  final Widget child;
  final BorderRadiusGeometry shape;
  final BoxBorder? border;
  final List<BoxShadow> shadow;
  final ui.ImageFilter? filter;
  final Color? tint;
  final Color? solid;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final opaque = MediaQuery.highContrastOf(context);
    final surface = ColoredBox(
      color: opaque
          ? solid ?? colors.popover
          : tint ?? colors.popover.withValues(alpha: colors.isDark ? .65 : .84),
      child: child,
    );
    return DecoratedBox(
      decoration: BoxDecoration(borderRadius: shape, boxShadow: shadow),
      child: ClipRRect(
        borderRadius: shape,
        child: DecoratedBox(
          position: DecorationPosition.foreground,
          decoration: BoxDecoration(border: border, borderRadius: shape),
          child: opaque
              ? surface
              : BackdropFilter(
                  filter: filter ?? (colors.isDark ? _darkGlass : _lightGlass),
                  child: surface,
                ),
        ),
      ),
    );
  }
}
