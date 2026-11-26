import 'package:flutter/widgets.dart';

import '../icon.dart';
import '../motion.dart';
import '../theme.dart';
import 'tv_focus.dart';
import 'tv_metrics.dart';

/// A pill button for TV pages and the player: its [icon], if any, and
/// [label], with [detail] after it, dimmer, like the time left, and a
/// [trailingIcon] at its end, like the chevron of one that opens a choice.
/// [active] marks one whose choice is in force, like a filter that narrows
/// a grid, in the accent. Focused it fills with the text color. [rest]
/// replaces the fill it has without focus, as for one on the moving picture.
class TvButton extends StatelessWidget {
  const TvButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.detail,
    this.trailingIcon,
    this.active = false,
    this.enabled = true,
    this.rest,
    this.minWidth = 0,
    this.focusNode,
    this.autofocus = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final String? icon;
  final String? detail;
  final String? trailingIcon;
  final bool active;
  final bool enabled;
  final Color? rest;
  final double minWidth;
  final FocusNode? focusNode;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return TvFocusable(
      focusNode: focusNode,
      autofocus: autofocus,
      enabled: enabled,
      onPressed: onPressed,
      label: detail == null ? label : '$label, $detail',
      builder: (context, focused) => TvControl(
        focused: focused,
        rest: rest ?? (active ? colors.accentSoft : null),
        content: active ? colors.accent : null,
        selected: active,
        builder: (context, look) => ConstrainedBox(
          constraints: BoxConstraints(
            minHeight: TvButtons.height,
            maxHeight: TvButtons.height,
            minWidth: minWidth,
          ),
          child: Padding(
            padding: EdgeInsetsDirectional.only(
              start: icon != null ? 20 : 24,
              end: trailingIcon != null ? 16 : 24,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              spacing: 10,
              children: [
                if (icon case final name?)
                  KitIcon(name, size: TvButtons.iconSize, color: look.content),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TvType.facts.style(color: look.content),
                  ),
                ),
                if (detail case final text?)
                  Text(
                    text,
                    maxLines: 1,
                    style: TvType.facts.style(
                      color: look.content.withValues(alpha: .65),
                    ),
                  ),
                if (trailingIcon case final name?)
                  KitIcon(
                    name,
                    size: 16,
                    color: look.content.withValues(alpha: .7),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A round button beside a [TvButton], its icon alone until it takes
/// focus, when it opens to say [label]. [tint] colors the icon, like the
/// accent on a watched mark, while it's not focused.
class TvIconButton extends StatelessWidget {
  const TvIconButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.tint,
    this.focusNode,
  });

  final String icon;
  final String label;
  final VoidCallback? onPressed;
  final Color? tint;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) => TvFocusable(
    focusNode: focusNode,
    onPressed: onPressed,
    label: label,
    builder: (context, focused) => TvControl(
      focused: focused,
      content: tint,
      builder: (context, look) => ConstrainedBox(
        constraints: const BoxConstraints(
          minHeight: TvButtons.height,
          maxHeight: TvButtons.height,
          minWidth: TvButtons.height,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: AnimatedSize(
            duration: focused ? TvMotion.enter : TvMotion.exit,
            curve: focused ? TvMotion.easing : TvMotion.exitEasing,
            alignment: AlignmentDirectional.centerStart,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                KitIcon(icon, size: TvButtons.iconSize, color: look.content),
                if (focused)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      start: 10,
                      end: 4,
                    ),
                    child: Text(
                      label,
                      maxLines: 1,
                      style: TvType.facts.style(color: look.content),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

/// A round button that stays an icon, like the search field's clear or the
/// player's play and pause, [size] across, its icon [iconSize] or .42 of
/// that. [label] names it for a screen reader. [lit] gives it the focused look ahead of focus, for one that is
/// about to take it as it appears.
class TvRoundButton extends StatelessWidget {
  const TvRoundButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.size = TvButtons.height,
    this.iconSize,
    this.lit = false,
    this.focusNode,
    this.onFocusChange,
  });

  final String icon;
  final String label;
  final VoidCallback? onPressed;
  final double size;
  final double? iconSize;
  final bool lit;
  final FocusNode? focusNode;
  final ValueChanged<bool>? onFocusChange;

  @override
  Widget build(BuildContext context) => TvFocusable(
    focusNode: focusNode,
    onPressed: onPressed,
    onFocusChange: onFocusChange,
    label: label,
    builder: (context, focused) => TvControl(
      focused: focused || lit,
      builder: (context, look) => SizedBox.square(
        dimension: size,
        child: Center(
          child: KitIcon(
            icon,
            size: iconSize ?? size * .42,
            color: look.content,
          ),
        ),
      ),
    ),
  );
}

/// A small pill, like a genre or a studio that leads to its titles, or a
/// season's tab. [selected] marks the one in force, in the accent, as an
/// active [TvButton] is. Focused it fills with the text color.
class TvChip extends StatelessWidget {
  const TvChip({
    super.key,
    required this.label,
    required this.onPressed,
    this.selected = false,
    this.focusNode,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool selected;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return TvFocusable(
      focusNode: focusNode,
      onPressed: onPressed,
      label: label,
      selected: selected,
      builder: (context, focused) => TvControl(
        focused: focused,
        rest: selected ? colors.accentSoft : null,
        content: selected ? colors.accent : null,
        selected: selected,
        builder: (context, look) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
          child: Text(
            label,
            maxLines: 1,
            style: TvType.label.style(color: look.content),
          ),
        ),
      ),
    );
  }
}
