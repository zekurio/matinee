import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import '../../kit/kit.dart';

/// The rows Settings is built from, as the web's setting controls: sections of
/// panels, each a card of rows with lines between them. The profile's account
/// rows use them too.

/// How wide Settings' pages get, at the start of a wider screen.
const settingsWidth = 720.0;

/// A section's heading over what's under it.
class SettingsSection extends StatelessWidget {
  const SettingsSection({super.key, required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    mainAxisSize: MainAxisSize.min,
    spacing: 14,
    children: [
      SectionTitle(title: title),
      child,
    ],
  );
}

/// A card of [rows], with a line between each two.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.rows});

  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: KitRadius.panel,
        border: Border.all(color: colors.border),
      ),
      child: ClipRRect(
        borderRadius: KitRadius.panel,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (index, row) in rows.indexed) ...[
              if (index > 0) PanelDivider(),
              row,
            ],
          ],
        ),
      ),
    );
  }
}

/// The line between a panel's rows, from [indent] to the end.
class PanelDivider extends StatelessWidget {
  const PanelDivider({super.key, this.indent = 0});

  final double indent;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsetsDirectional.only(start: indent),
    child: SizedBox(
      height: 1,
      child: ColoredBox(color: MatineeTheme.of(context).border),
    ),
  );
}

/// A row's padding and its press wash.
class _PressRow extends StatelessWidget {
  const _PressRow({
    required this.onPressed,
    required this.child,
    this.label,
    this.checked,
  });

  final VoidCallback? onPressed;
  final Widget child;
  final String? label;
  final bool? checked;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final row = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: child,
    );
    if (onPressed == null) return row;
    return PressIndication(
      onPressed: onPressed,
      label: label,
      checked: checked,
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: row,
      ),
    );
  }
}

/// An icon at a row's start, muted, or in the danger color.
class _RowIcon extends StatelessWidget {
  const _RowIcon(this.icon, {this.danger = false});

  final String icon;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 14),
      child: KitIcon(
        icon,
        size: 20,
        color: danger ? colors.danger : colors.mutedForeground,
      ),
    );
  }
}

/// A row's [text] and, when there's one, its [value] at the end, muted, on
/// one line. Both keep their whole width when they fit; when they don't,
/// the one that's longer than half the row gives way and is cut short, or
/// both share it half and half. A fixed width for the value cut the admin
/// pages' longer values on a tablet, and half the row for it cut the
/// downloads' storage on a phone beside its short title.
class _TitleAndValue extends StatelessWidget {
  const _TitleAndValue({
    required this.title,
    required this.text,
    required this.value,
  });

  /// The title [text] shows, measured for the split.
  final String title;
  final Widget text;
  final String? value;

  static const _gap = 12.0;

  @override
  Widget build(BuildContext context) {
    final value = this.value;
    if (value == null) return Expanded(child: text);
    final scaler = MediaQuery.textScalerOf(context);
    final direction = Directionality.of(context);
    final valueStyle = KitText.sm.style(
      color: MatineeTheme.of(context).mutedForeground,
    );
    double measure(String words, TextStyle style) {
      final painter = TextPainter(
        text: TextSpan(text: words, style: style),
        textDirection: direction,
        textScaler: scaler,
        maxLines: 1,
      )..layout();
      final width = painter.width;
      painter.dispose();
      return width;
    }

    return Expanded(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final room = math.max(0.0, constraints.maxWidth - _gap);
          final titleWidth = measure(title, KitText.base.style());
          final valueWidth = measure(value, valueStyle);
          final half = room / 2;
          final width = titleWidth + valueWidth <= room
              ? valueWidth
              : titleWidth <= half
              ? room - titleWidth
              : valueWidth <= half
              ? valueWidth
              : half;
          return Row(
            children: [
              Expanded(child: text),
              Padding(
                padding: const EdgeInsetsDirectional.only(start: _gap),
                child: SizedBox(
                  // A hair over the measure, so rounding doesn't cut it.
                  width: math.min(width + .5, room),
                  child: Text(
                    value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.end,
                    style: valueStyle,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// A row's title, with what it's for under it when there's [description].
class _RowText extends StatelessWidget {
  const _RowText({required this.title, this.description, this.danger = false});

  final String title;
  final String? description;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final description = this.description;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          title,
          style: KitText.base.style(
            color: danger ? colors.danger : colors.foreground,
          ),
        ),
        if (description != null)
          Text(
            description,
            style: KitText.sm.style(color: colors.mutedForeground),
          ),
      ],
    );
  }
}

/// A row that goes somewhere, with what's set there at its end, or what
/// it's for under its title. A [destructive] one is in the danger color
/// and has no chevron, since it acts rather than opens.
class LinkRow extends StatelessWidget {
  const LinkRow({
    super.key,
    required this.title,
    required this.onPressed,
    this.icon,
    this.value,
    this.description,
    this.destructive = false,
  });

  final String title;
  final VoidCallback? onPressed;
  final String? icon;
  final String? value;
  final String? description;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final icon = this.icon;
    final value = this.value;
    return _PressRow(
      onPressed: onPressed,
      child: Row(
        children: [
          if (icon != null) _RowIcon(icon, danger: destructive),
          _TitleAndValue(
            title: title,
            text: _RowText(
              title: title,
              description: description,
              danger: destructive,
            ),
            value: value,
          ),
          if (!destructive)
            Padding(
              padding: const EdgeInsetsDirectional.only(start: 4),
              child: KitIcon(
                Lucide.chevronRight,
                size: 16,
                color: MatineeTheme.of(context).mutedForeground,
              ),
            ),
        ],
      ),
    );
  }
}

/// A row that turns something on or off, the whole row a tap target.
class SwitchRow extends StatelessWidget {
  const SwitchRow({
    super.key,
    required this.title,
    required this.checked,
    required this.onChanged,
    this.icon,
    this.description,
  });

  final String title;
  final bool checked;
  final ValueChanged<bool>? onChanged;
  final String? icon;

  /// What the switch is for, under its title.
  final String? description;

  @override
  Widget build(BuildContext context) {
    final icon = this.icon;
    final change = onChanged;
    return _PressRow(
      onPressed: change == null ? null : () => change(!checked),
      label: title,
      checked: checked,
      child: ExcludeSemantics(
        child: Row(
          children: [
            if (icon != null) _RowIcon(icon),
            Expanded(
              child: _RowText(title: title, description: description),
            ),
            const SizedBox(width: 12),
            Switch(checked: checked, onChanged: change),
          ],
        ),
      ),
    );
  }
}

/// A row that only tells something, its value at its end.
class ValueRow extends StatelessWidget {
  const ValueRow({super.key, required this.title, required this.value});

  final String title;
  final String value;

  @override
  Widget build(BuildContext context) => _PressRow(
    onPressed: null,
    child: Row(
      children: [
        _TitleAndValue(
          title: title,
          text: _RowText(title: title),
          value: value,
        ),
      ],
    ),
  );
}

/// A choice among [options], shown at the row's end and picked from a menu
/// that opens under it, lined up with that end.
class PickerRow<T> extends StatelessWidget {
  const PickerRow({
    super.key,
    required this.title,
    required this.options,
    required this.current,
    required this.onPicked,
    this.description,
  });

  final String title;

  /// What the choice is for, under the title.
  final String? description;
  final List<(T, String)> options;
  final T current;
  final ValueChanged<T> onPicked;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    var shown = '$current';
    for (final (value, label) in options) {
      if (value == current) shown = label;
    }
    return Menu(
      side: MenuSide.end,
      trigger: (context, toggle, isOpen, focus) => PressIndication(
        onPressed: toggle,
        focusNode: focus,
        label: '$title, $shown',
        builder: (context, state) => ColoredBox(
          color: colors.foreground.withValues(
            alpha: state == PressState.idle && !isOpen ? 0 : .06,
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: ExcludeSemantics(
              child: Row(
                children: [
                  _TitleAndValue(
                    title: title,
                    text: _RowText(title: title, description: description),
                    value: shown,
                  ),
                  Padding(
                    padding: const EdgeInsetsDirectional.only(start: 4),
                    child: KitIcon(
                      Lucide.chevronDown,
                      size: 16,
                      color: colors.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      children: [
        for (final (value, label) in options)
          MenuItem(
            label: label,
            selected: value == current,
            autofocus: value == current,
            onPressed: () {
              if (value != current) onPicked(value);
            },
          ),
      ],
    );
  }
}
