import 'package:flutter/widgets.dart';

import 'theme.dart';

/// The solid panel under what floats over a page or the player: menus, the
/// bottom sheet, toasts, and the phone's tab bar.
class FloatingSurface extends StatelessWidget {
  const FloatingSurface({
    super.key,
    required this.child,
    this.shape = BorderRadius.zero,
    this.border,
    this.shadow = const [],
    this.color,
  });

  final Widget child;
  final BorderRadiusGeometry shape;
  final BoxBorder? border;
  final List<BoxShadow> shadow;

  /// The popover's color unless given.
  final Color? color;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(borderRadius: shape, boxShadow: shadow),
    child: ClipRRect(
      borderRadius: shape,
      child: DecoratedBox(
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(border: border, borderRadius: shape),
        child: ColoredBox(
          color: color ?? MatineeTheme.of(context).popover,
          child: child,
        ),
      ),
    ),
  );
}
