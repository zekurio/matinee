import 'package:flutter/widgets.dart';

import '../icon.dart';
import '../theme.dart';
import 'tv_focus.dart';
import 'tv_metrics.dart';

/// A row to pick on a TV, in a list or a side panel: a large target that fills
/// with the text color while it has focus. [quiet] rows have no resting fill;
/// [selected] marks the one in force; [checked] puts a check at its end.
/// [trailing] sits before the check in the row's content color, as
/// [TvListValue] or [TvListSwitch].
class TvListItem extends StatelessWidget {
  const TvListItem({
    super.key,
    required this.title,
    required this.onPressed,
    this.icon,
    this.subtitle,
    this.leading,
    this.trailing,
    this.quiet = false,
    this.selected = false,
    this.destructive = false,
    this.enabled = true,
    this.checked = false,
    this.autofocus = false,
    this.focusNode,
    this.minHeight = TvListItems.height,
    this.subtitleLines = 2,
    this.titleLines = 1,
    this.onFocusChange,
  });

  final String title;
  final String? subtitle;
  final String? icon;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onPressed;
  final bool quiet;
  final bool selected;
  final bool destructive;
  final bool enabled;
  final bool checked;
  final bool autofocus;
  final FocusNode? focusNode;
  final double minHeight;
  final int subtitleLines;

  /// How many lines [title] may wrap to, for a row whose words run long
  /// beside a switch, as in German.
  final int titleLines;
  final ValueChanged<bool>? onFocusChange;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final rest = selected
        ? colors.foreground.withValues(alpha: .1)
        : quiet
        ? const Color(0x00000000)
        : colors.foreground.withValues(alpha: .07);
    final tint = !enabled
        ? colors.mutedForeground
        : destructive
        ? colors.danger
        : selected
        ? colors.accent
        : colors.foreground;
    return TvFocusable(
      focusNode: focusNode,
      autofocus: autofocus,
      enabled: enabled,
      onPressed: onPressed,
      onFocusChange: onFocusChange,
      label: subtitle == null ? title : '$title, $subtitle',
      checked: checked ? true : null,
      selected: selected ? true : null,
      builder: (context, focused) => TvControl(
        focused: focused,
        radius: TvListItems.radius,
        rest: rest,
        content: tint,
        scale: TvFocus.rowScale,
        builder: (context, content) => ConstrainedBox(
          constraints: BoxConstraints(minHeight: minHeight),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: TvListItems.inset,
              vertical: 10,
            ),
            child: DefaultTextStyle(
              style: TvType.label.style(color: content),
              child: Row(
                spacing: 16,
                children: [
                  if (leading case final widget?)
                    widget
                  else if (icon case final name?)
                    KitIcon(
                      name,
                      size: 24,
                      color: focused || destructive || selected
                          ? content
                          : colors.foreground.withValues(alpha: .7),
                    ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          title,
                          maxLines: titleLines,
                          overflow: TextOverflow.ellipsis,
                          style: TvType.facts.style(color: content),
                        ),
                        if (subtitle case final text?)
                          Text(
                            text,
                            maxLines: subtitleLines,
                            overflow: TextOverflow.ellipsis,
                            style: TvType.caption.style(
                              color: focused
                                  ? colors.background.withValues(alpha: .7)
                                  : colors.mutedForeground,
                            ),
                          ),
                      ],
                    ),
                  ),
                  ?trailing,
                  if (checked)
                    KitIcon(
                      Lucide.check,
                      size: 22,
                      color: focused ? content : colors.accent,
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A setting's value at a [TvListItem]'s end, with a chevron for one that
/// opens a choice.
class TvListValue extends StatelessWidget {
  const TvListValue(this.value, {super.key, this.chevron = true});

  final String value;
  final bool chevron;

  @override
  Widget build(BuildContext context) {
    final color =
        DefaultTextStyle.of(context).style.color ??
        MatineeTheme.of(context).foreground;
    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 16,
      children: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 240),
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TvType.label.style(color: color.withValues(alpha: .7)),
          ),
        ),
        if (chevron)
          KitIcon(
            Lucide.chevronRight,
            size: 20,
            color: color.withValues(alpha: .6),
          ),
      ],
    );
  }
}

/// A switch at a [TvListItem]'s end: the row presses it.
class TvListSwitch extends StatelessWidget {
  const TvListSwitch({super.key, required this.checked});

  final bool checked;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final color = DefaultTextStyle.of(context).style.color ?? colors.foreground;
    return TweenAnimationBuilder<double>(
      tween: Tween(end: checked ? 1 : 0),
      duration: TvMotion.move,
      curve: TvMotion.easing,
      builder: (context, knob, _) => Container(
        width: 48,
        height: 28,
        alignment: AlignmentDirectional.centerStart,
        decoration: ShapeDecoration(
          shape: const StadiumBorder(),
          color: checked ? colors.accent : color.withValues(alpha: .25),
        ),
        child: Padding(
          padding: EdgeInsetsDirectional.only(start: 4 + 20 * knob),
          child: Container(
            width: 20,
            height: 20,
            decoration: ShapeDecoration(
              shape: const CircleBorder(),
              color: checked
                  ? colors.accentForeground
                  : color.withValues(alpha: .9),
            ),
          ),
        ),
      ),
    );
  }
}

/// A small heading over a group of rows.
class TvListHeading extends StatelessWidget {
  const TvListHeading(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsetsDirectional.only(
      start: TvListItems.inset,
      top: 12,
      bottom: 4,
    ),
    child: Semantics(
      header: true,
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TvType.label.style(
          color: MatineeTheme.of(context).mutedForeground,
        ),
      ),
    ),
  );
}
