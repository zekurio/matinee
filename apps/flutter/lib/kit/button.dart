import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'glass.dart';
import 'icon.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

/// What reads on [ButtonLook.inverse]'s white: the dark theme's background,
/// so a white button reads whichever scheme shows around it.
const _inverseInk = Color(0xFF0E0E10);

enum ButtonLook {
  primary,
  outline,
  secondary,
  ghost,
  destructive,
  link,
  frosted,
  glass,

  /// White on dark art, as the large streaming apps' Play: the one strong
  /// button over a picture.
  inverse,
}

/// The web's sizes: height, side padding, the padding on a side that has an
/// icon (`has-data-[icon=inline-start]:pl-*`), the gap, the icon, and the text.
enum ButtonSize {
  standard(36, 12, 10, 6, 16, KitText.sm, KitRadius.lg),
  sm(32, 10, 6, 4, 14, KitText.px13, KitRadius.md),
  lg(40, 16, 12, 8, 16, KitText.sm, KitRadius.lg),

  /// The Android kit's default height, for buttons over the player.
  xl(44, 16, 12, 8, 16, KitText.sm, KitRadius.lg),
  icon(36, 0, 0, 0, 16, KitText.sm, 999),
  iconSm(32, 0, 0, 0, 16, KitText.sm, 999);

  const ButtonSize(
    this.height,
    this.padding,
    this.iconPadding,
    this.gap,
    this.iconSize,
    this.text,
    this.radius,
  );

  final double height;
  final double padding;
  final double iconPadding;
  final double gap;
  final double iconSize;
  final KitText text;
  final double radius;

  bool get isIcon => padding == 0;
}

class MatineeButton extends StatelessWidget {
  const MatineeButton({
    super.key,
    required this.onPressed,
    this.child,
    this.leading,
    this.trailing,
    this.label,
    this.look = ButtonLook.primary,
    this.size = ButtonSize.standard,
    this.shape,
    this.dimmed,
    this.autofocus = false,
    this.tightIcon = true,
  }) : assert(child != null || leading != null || trailing != null),
       assert(child != null || label != null);

  final VoidCallback? onPressed;
  final Widget? child;
  final String? leading;
  final String? trailing;
  final String? label;
  final ButtonLook look;
  final ButtonSize size;
  final BorderRadiusGeometry? shape;
  final bool? dimmed;
  final bool autofocus;

  /// Whether the end an icon is at takes the size's tighter padding, as a
  /// web button's icon marked `data-icon` does. One without, as the home
  /// showcase's Play, keeps the plain padding.
  final bool tightIcon;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final radius = shape ?? BorderRadius.all(Radius.circular(size.radius));
    final isDimmed = dimmed ?? (onPressed == null);
    final white = const Color(0xFFFFFFFF);

    return PressIndication(
      onPressed: onPressed,
      label: label,
      shape: radius,
      autofocus: autofocus,
      builder: (context, state) {
        final hot = state != PressState.idle;
        final pressed = state == PressState.pressed;
        final (fill, foreground, border) = switch (look) {
          ButtonLook.primary => (
            pressed
                ? colors.accentActive
                : hot
                ? colors.accentHover
                : colors.accent,
            colors.accentForeground,
            null,
          ),
          ButtonLook.outline => (
            colors.foreground.withValues(alpha: pressed ? .10 : 0),
            colors.foreground,
            hot ? colors.inputHover : colors.inputBorder,
          ),
          ButtonLook.secondary => (
            Color.lerp(
              colors.secondary,
              colors.foreground,
              pressed
                  ? .14
                  : hot
                  ? .08
                  : 0,
            )!,
            colors.foreground,
            null,
          ),
          ButtonLook.ghost => (
            colors.foreground.withValues(alpha: pressed ? .10 : 0),
            colors.foreground.withValues(alpha: hot ? 1 : .75),
            null,
          ),
          ButtonLook.destructive => (
            colors.danger.withValues(
              alpha:
                  (colors.isDark ? .2 : .1) +
                  (pressed
                      ? .15
                      : hot
                      ? .1
                      : 0),
            ),
            colors.danger,
            null,
          ),
          ButtonLook.link => (const Color(0x00000000), colors.accent, null),
          ButtonLook.frosted => (
            colors.foreground.withValues(alpha: hot ? .24 : .15),
            colors.foreground,
            colors.hairline,
          ),
          ButtonLook.glass => (
            white.withValues(alpha: hot ? .26 : .18),
            white,
            white.withValues(alpha: .15),
          ),
          ButtonLook.inverse => (
            Color.lerp(
              white,
              _inverseInk,
              pressed
                  ? .14
                  : hot
                  ? .07
                  : 0,
            )!,
            _inverseInk,
            null,
          ),
        };
        final style = size.text.style(
          color: foreground,
          weight: FontWeight.w500,
        );
        final content = DefaultTextStyle(
          style: look == ButtonLook.link && hot
              ? style.copyWith(decoration: TextDecoration.underline)
              : style,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          // Inside the 1px border every look has, as the surface below adds.
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minWidth: size.isIcon ? size.height - 2 : 0,
              minHeight: size.height - 2,
            ),
            child: Padding(
              padding: EdgeInsetsDirectional.only(
                start: leading != null && tightIcon
                    ? size.iconPadding
                    : size.padding,
                end: trailing != null && tightIcon
                    ? size.iconPadding
                    : size.padding,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                spacing: size.gap,
                children: [
                  if (leading case final icon?)
                    KitIcon(icon, size: size.iconSize),
                  // A label names the button, so its text isn't read too.
                  if (child case final content?)
                    Flexible(
                      child: label == null
                          ? content
                          : ExcludeSemantics(child: content),
                    ),
                  if (trailing case final icon?)
                    KitIcon(icon, size: size.iconSize),
                ],
              ),
            ),
          ),
        );
        final outline = border == null ? null : Border.all(color: border);
        final inset = Padding(padding: const EdgeInsets.all(1), child: content);
        // The web's button has a 1px border, transparent on most looks, and
        // its `bg-clip-padding` stops the fill inside it, so a filled
        // button shows 2px less than its height.
        final surface = look == ButtonLook.frosted
            ? Glass(shape: radius, tint: fill, border: outline, child: inset)
            : PressFill(
                decoration: BoxDecoration(
                  border: outline,
                  borderRadius: radius,
                ),
                child: Padding(
                  padding: const EdgeInsets.all(1),
                  child: PressFill(
                    decoration: BoxDecoration(
                      color: look == ButtonLook.glass
                          ? Color.alphaBlend(fill, const Color(0x66000000))
                          : fill,
                      borderRadius: _inside(
                        radius.resolve(Directionality.of(context)),
                      ),
                    ),
                    child: content,
                  ),
                ),
              );
        return Opacity(opacity: isDimmed ? .5 : 1, child: surface);
      },
    );
  }
}

/// [radius] 1px in, for a fill inside a 1px border, so it follows the
/// border's inner edge.
BorderRadius _inside(BorderRadius radius) {
  Radius less(Radius corner) =>
      Radius.elliptical(math.max(0, corner.x - 1), math.max(0, corner.y - 1));
  return BorderRadius.only(
    topLeft: less(radius.topLeft),
    topRight: less(radius.topRight),
    bottomLeft: less(radius.bottomLeft),
    bottomRight: less(radius.bottomRight),
  );
}
