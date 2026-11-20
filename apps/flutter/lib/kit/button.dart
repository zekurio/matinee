import 'package:flutter/widgets.dart';

import 'glass.dart';
import 'icon.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

enum ButtonLook {
  primary,
  outline,
  secondary,
  ghost,
  destructive,
  link,
  frosted,
  glass,
}

/// The web's sizes: height, side padding, the padding on a side that has an
/// icon (`has-data-[icon=inline-start]:pl-*`), the gap, the icon, and the text.
enum ButtonSize {
  standard(36, 12, 10, 6, 16, KitText.sm, KitRadius.lg),
  xs(24, 8, 6, 4, 12, KitText.xs, KitRadius.md),
  sm(32, 10, 6, 4, 14, KitText.px13, KitRadius.md),
  lg(40, 16, 12, 8, 16, KitText.sm, KitRadius.lg),

  /// The Android kit's default height, for buttons over the player.
  xl(44, 16, 12, 8, 16, KitText.sm, KitRadius.lg),
  icon(36, 0, 0, 0, 16, KitText.sm, 999),
  iconXs(28, 0, 0, 0, 12, KitText.sm, 999),
  iconSm(32, 0, 0, 0, 16, KitText.sm, 999),
  iconLg(40, 0, 0, 0, 16, KitText.sm, 999);

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
    this.focusNode,
    this.autofocus = false,
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
  final FocusNode? focusNode;
  final bool autofocus;

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
      focusNode: focusNode,
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
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minWidth: size.isIcon ? size.height : 0,
              minHeight: size.height,
            ),
            child: Padding(
              // The web's button has a 1px border (transparent on most looks)
              // inside which the padding sits.
              padding: EdgeInsetsDirectional.only(
                start: 1 + (leading != null ? size.iconPadding : size.padding),
                end: 1 + (trailing != null ? size.iconPadding : size.padding),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                spacing: size.gap,
                children: [
                  if (leading case final icon?)
                    KitIcon(icon, size: size.iconSize),
                  if (child case final content?) Flexible(child: content),
                  if (trailing case final icon?)
                    KitIcon(icon, size: size.iconSize),
                ],
              ),
            ),
          ),
        );
        final outline = border == null ? null : Border.all(color: border);
        final surface = look == ButtonLook.frosted
            ? Glass(shape: radius, tint: fill, border: outline, child: content)
            : DecoratedBox(
                decoration: BoxDecoration(
                  color: look == ButtonLook.glass
                      ? Color.alphaBlend(fill, const Color(0x66000000))
                      : fill,
                  border: outline,
                  borderRadius: radius,
                ),
                child: content,
              );
        return Opacity(opacity: isDimmed ? .5 : 1, child: surface);
      },
    );
  }
}
