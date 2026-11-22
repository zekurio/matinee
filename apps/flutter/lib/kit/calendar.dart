import 'package:flutter/material.dart' as material;
import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart' show DateFormat;

import 'button.dart';
import 'icon.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

class Calendar extends StatefulWidget {
  const Calendar({
    super.key,
    required this.selected,
    required this.onSelected,
    this.latest,
    this.today,
  });

  final DateTime? selected;
  final ValueChanged<DateTime>? onSelected;
  final DateTime? latest;
  final DateTime? today;

  @override
  State<Calendar> createState() => _CalendarState();
}

class _CalendarState extends State<Calendar> {
  static DateTime _monthOf(DateTime date) => DateTime(date.year, date.month);

  late DateTime _shown = _monthOf(
    widget.selected ?? widget.today ?? DateTime.now(),
  );

  DateTime _clampMonth(DateTime date) {
    final last = widget.latest;
    if (last != null && date.isAfter(_monthOf(last))) return _monthOf(last);
    return date;
  }

  @override
  void didUpdateWidget(Calendar oldWidget) {
    super.didUpdateWidget(oldWidget);
    final date = widget.selected;
    if (date != null && date != oldWidget.selected) {
      _shown = _monthOf(date);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final strings = material.MaterialLocalizations.of(context);
    final weekday = DateFormat.E(
      Localizations.localeOf(context).toLanguageTag(),
    );
    final today = material.DateUtils.dateOnly(widget.today ?? DateTime.now());
    final shown = _clampMonth(_shown);
    final firstWeekday = strings.firstDayOfWeekIndex;
    final lead = (shown.weekday % 7 - firstWeekday + 7) % 7;
    final days = material.DateUtils.getDaysInMonth(shown.year, shown.month);
    final weeks = (lead + days + 6) ~/ 7;
    final previous = DateTime(shown.year, shown.month - 1);
    final next = DateTime(shown.year, shown.month + 1);
    final ltr = Directionality.of(context) == TextDirection.ltr;
    const shape = BorderRadius.all(Radius.circular(KitRadius.md));

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 240),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                MatineeButton(
                  onPressed: _clampMonth(previous) != previous
                      ? null
                      : () => setState(() => _shown = previous),
                  leading: ltr ? Lucide.chevronLeft : Lucide.chevronRight,
                  label: strings.previousMonthTooltip,
                  look: ButtonLook.ghost,
                  shape: shape,
                  size: ButtonSize.iconSm,
                ),
                Expanded(
                  child: Semantics(
                    liveRegion: true,
                    child: Text(
                      strings.formatMonthYear(shown),
                      textAlign: TextAlign.center,
                      style: KitText.sm.style(
                        color: colors.foreground,
                        weight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
                MatineeButton(
                  onPressed: _clampMonth(next) != next
                      ? null
                      : () => setState(() => _shown = next),
                  leading: ltr ? Lucide.chevronRight : Lucide.chevronLeft,
                  label: strings.nextMonthTooltip,
                  look: ButtonLook.ghost,
                  shape: shape,
                  size: ButtonSize.iconSm,
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                for (var column = 0; column < 7; column++)
                  Expanded(
                    child: Text(
                      weekday.format(
                        DateTime(2024, 1, 7 + (firstWeekday + column) % 7),
                      ),
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: KitText.px13.style(color: colors.mutedForeground),
                    ),
                  ),
              ],
            ),
            for (var row = 0; row < weeks; row++) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  for (var column = 0; column < 7; column++)
                    Expanded(
                      child: _day(
                        strings,
                        shown,
                        today,
                        1 + row * 7 + column - lead,
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _day(
    material.MaterialLocalizations strings,
    DateTime shown,
    DateTime today,
    int dayOfMonth,
  ) {
    final date = DateTime(shown.year, shown.month, dayOfMonth);
    final outside = date.month != shown.month;
    final colors = MatineeTheme.of(context);
    final selected = material.DateUtils.isSameDay(date, widget.selected);
    final current = date == today;
    final onSelected = widget.onSelected;
    final latest = widget.latest;
    final disabled =
        onSelected == null ||
        (latest != null && date.isAfter(material.DateUtils.dateOnly(latest)));
    const shape = BorderRadius.all(Radius.circular(KitRadius.md));
    return PressIndication(
      onPressed: disabled ? null : () => onSelected(date),
      label: strings.formatFullDate(date),
      selected: selected,
      shape: shape,
      builder: (context, state) => AspectRatio(
        aspectRatio: 1,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: shape,
            color: selected
                ? colors.accent
                : (current || state != PressState.idle)
                ? colors.muted
                : null,
          ),
          child: Center(
            child: ExcludeSemantics(
              child: Text(
                strings.formatDecimal(date.day),
                style: KitText.sm.style(
                  color: selected
                      ? colors.accentForeground
                      : (disabled || outside
                                ? colors.mutedForeground
                                : colors.foreground)
                            .withValues(alpha: disabled ? .5 : 1),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
