import 'package:flutter/widgets.dart';

import 'icon.dart';
import 'press_indication.dart';
import 'theme.dart';

/// A round button with one icon, the Android kit's `RoundIconButton`: the
/// player's controls, and the watched and favorite buttons on a title. A
/// circle smaller than 48 still takes 48 of layout, so its touch target
/// never overlaps a neighbour's. [color] tints the icon, as the accent on
/// something watched. [background] defaults to the secondary fill; pass a
/// transparent one for a bare icon over a picture, or a veil over a
/// backdrop.
class RoundIconButton extends StatelessWidget {
  const RoundIconButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.size = 44,
    this.iconSize = 20,
    this.color,
    this.background,
    this.toggled,
    this.focusNode,
    this.autofocus = false,
  });

  /// The smallest box a button takes, so a small circle stays easy to hit.
  static const minTouch = 48.0;

  final String icon;
  final String label;
  final VoidCallback? onPressed;
  final double size;
  final double iconSize;
  final Color? color;
  final Color? background;

  /// For a button that turns something on or off, whether it's on.
  final bool? toggled;
  final FocusNode? focusNode;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final box = size < minTouch ? minTouch : size;
    return SizedBox.square(
      dimension: box,
      child: Center(
        child: PressIndication(
          onPressed: onPressed,
          label: label,
          toggled: toggled,
          shape: BorderRadius.circular(size / 2),
          focusNode: focusNode,
          autofocus: autofocus,
          builder: (context, state) {
            final fill = background ?? colors.secondary;
            // Material's ripple, flattened: a light wash over the fill.
            final wash = switch (state) {
              PressState.pressed => .12,
              PressState.idle => 0.0,
              _ => .08,
            };
            return SizedBox.square(
              dimension: size,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Color.alphaBlend(
                    colors.foreground.withValues(alpha: wash),
                    fill,
                  ),
                ),
                child: Center(
                  child: KitIcon(
                    icon,
                    size: iconSize,
                    // Disabled, it fades the way the player's episode
                    // buttons do when there's no episode either side.
                    color: (color ?? colors.foreground).withValues(
                      alpha: onPressed == null ? .4 : null,
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
