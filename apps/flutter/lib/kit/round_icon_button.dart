import 'package:flutter/widgets.dart';

import 'icon.dart';
import 'motion.dart';
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
    this.value,
    this.size = 44,
    this.iconSize = 20,
    this.color,
    this.background,
    this.toggled,
    this.iconShadows,
  });

  /// The smallest box a button takes, so a small circle stays easy to hit.
  static const minTouch = 48.0;

  final String icon;
  final String label;
  final VoidCallback? onPressed;

  /// What a screen reader hears it set to, after [label].
  final String? value;
  final double size;
  final double iconSize;
  final Color? color;
  final Color? background;

  /// For a button that turns something on or off, whether it's on.
  final bool? toggled;

  /// Shadows under the icon, for a bare button over a picture; they fade
  /// with it when it's disabled.
  final List<Shadow>? iconShadows;

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
          value: value,
          toggled: toggled,
          shape: BorderRadius.circular(size / 2),
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
              child: PressFill(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Color.alphaBlend(
                    colors.foreground.withValues(alpha: wash),
                    fill,
                  ),
                ),
                // A new icon, as a title marked watched or a pause turned to
                // play, fades and grows in over the last.
                child: AnimatedSwitcher(
                  duration: KitMotion.of(context, KitMotion.enter),
                  reverseDuration: KitMotion.of(context, KitMotion.exit),
                  switchInCurve: KitMotion.easing,
                  switchOutCurve: KitMotion.exitEasing,
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: ScaleTransition(
                      scale: Tween<double>(
                        begin: .6,
                        end: 1,
                      ).animate(animation),
                      child: child,
                    ),
                  ),
                  child: KitIcon(
                    key: ValueKey(icon),
                    icon,
                    size: iconSize,
                    shadows: [
                      for (final shadow in iconShadows ?? const <Shadow>[])
                        onPressed == null
                            ? Shadow(
                                color: shadow.color.withValues(
                                  alpha: shadow.color.a * .4,
                                ),
                                offset: shadow.offset,
                                blurRadius: shadow.blurRadius,
                              )
                            : shadow,
                    ],
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
