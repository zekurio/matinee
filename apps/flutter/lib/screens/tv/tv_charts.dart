import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../profile/profile_data.dart';

/*
 * The profile's two charts on a TV. Each is one focus stop, so the page scrolls
 * to it and passes it with one press. Focused, the arrows move a mark across
 * its bars or squares, and the line above the chart reads out the one marked,
 * as touching it does on the phone. The mark is the text color, as a focused
 * control fills with it; an arrow past the chart's edge leaves it.
 */

/// How tall the watch-time bars can grow.
const _barsHeight = 180.0;

/// Beside the bars, for the scale's figures.
const _scaleWidth = 88.0;

/// A move of [at] among [count] places for [event]: [back] and [forward]
/// step it. The new place, or null at an end or for another key, so the
/// press moves focus on as usual.
int? _step(
  KeyEvent event,
  LogicalKeyboardKey back,
  LogicalKeyboardKey forward,
  int count,
  int at,
) {
  final key = event.logicalKey;
  final next = key == back
      ? at - 1
      : key == forward
      ? at + 1
      : null;
  if (next == null || next < 0 || next >= count) return null;
  return next;
}

/// Whether [event] is one an arrow acts on: a press or its repeat.
bool _acts(KeyEvent event) => event is KeyDownEvent || event is KeyRepeatEvent;

/// The range's watch time: the total, large, over watch time per day,
/// week, or month as bars. Focused, a bar is marked, the newest first, and
/// the total's place reads that day, week, or month out instead.
class TvWatchTimeChart extends StatefulWidget {
  const TvWatchTimeChart({
    super.key,
    required this.stats,
    required this.focusNode,
  });

  final WatchStats stats;
  final FocusNode focusNode;

  @override
  State<TvWatchTimeChart> createState() => _TvWatchTimeChartState();
}

class _TvWatchTimeChartState extends State<TvWatchTimeChart> {
  late int _picked = widget.stats.buckets.length - 1;

  @override
  void didUpdateWidget(TvWatchTimeChart old) {
    super.didUpdateWidget(old);
    if (!identical(old.stats, widget.stats)) {
      _picked = widget.stats.buckets.length - 1;
    }
  }

  KeyEventResult _key(KeyEvent event) {
    final next = _step(
      event,
      LogicalKeyboardKey.arrowLeft,
      LogicalKeyboardKey.arrowRight,
      widget.stats.buckets.length,
      _picked,
    );
    if (next == null) return KeyEventResult.ignored;
    if (_acts(event)) setState(() => _picked = next);
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final locale = l.localeName;
    final stats = widget.stats;
    final buckets = stats.buckets;
    var top = 0.0;
    for (final bucket in buckets) {
      if (bucket.watchSeconds > top) top = bucket.watchSeconds;
    }
    top = scaleTop(top);
    return TvFocusable(
      focusNode: widget.focusNode,
      label: l.statsWatchTime,
      button: false,
      onKey: _key,
      builder: (context, focused) {
        final shown = focused && _picked >= 0 && _picked < buckets.length
            ? buckets[_picked]
            : null;
        final muted = TvType.caption.style(color: colors.mutedForeground);
        return Padding(
          padding: const EdgeInsetsDirectional.only(
            start: TvPage.start,
            end: TvPage.end,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                shown == null
                    ? '${l.statsWatchTime} · ${rangeName(stats.range, l)}'
                    : '${bucketName(shown.start, stats.unit, l, locale)}'
                          ' · ${l.statsPlayCount(shown.plays)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TvType.facts.style(color: colors.mutedForeground),
              ),
              Text(
                formatWatchTime(
                  shown?.watchSeconds ?? stats.totals.watchSeconds,
                  l,
                ),
                maxLines: 1,
                style: TvType.display.style(color: colors.foreground),
              ),
              if (buckets.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 20),
                  child: SizedBox(
                    height: _barsHeight,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(
                          child: CustomPaint(
                            painter: _BarsPainter(
                              values: [for (final b in buckets) b.watchSeconds],
                              top: top,
                              picked: shown == null ? null : _picked,
                              accent: colors.accent,
                              mark: colors.foreground,
                              line: colors.border,
                            ),
                          ),
                        ),
                        SizedBox(
                          width: _scaleWidth,
                          child: Padding(
                            padding: const EdgeInsetsDirectional.only(
                              start: 14,
                            ),
                            child: Stack(
                              children: [
                                Positioned(
                                  top: 4,
                                  child: Text(
                                    formatWatchTime(top, l),
                                    maxLines: 1,
                                    style: muted,
                                  ),
                                ),
                                Positioned(
                                  top: _barsHeight / 2 + 4,
                                  child: Text(
                                    formatWatchTime(top / 2, l),
                                    maxLines: 1,
                                    style: muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsetsDirectional.only(
                    top: 8,
                    end: _scaleWidth,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          bucketName(
                            buckets.first.start,
                            stats.unit,
                            l,
                            locale,
                          ),
                          maxLines: 1,
                          style: muted,
                        ),
                      ),
                      if (buckets.length > 1)
                        Text(
                          bucketName(buckets.last.start, stats.unit, l, locale),
                          maxLines: 1,
                          style: muted,
                        ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _BarsPainter extends CustomPainter {
  const _BarsPainter({
    required this.values,
    required this.top,
    required this.picked,
    required this.accent,
    required this.mark,
    required this.line,
  });

  final List<double> values;
  final double top;
  final int? picked;
  final Color accent;
  final Color mark;
  final Color line;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..color = line
      ..strokeWidth = 1;
    for (final y in [0.0, size.height / 2, size.height]) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), stroke);
    }
    if (values.isEmpty) return;
    // All time can hold hundreds of months, so the bars thin out to lines
    // rather than leave the chart.
    final slot = size.width / values.length;
    final gap = (slot * .25).clamp(0, 8).toDouble();
    final radius = Radius.circular(((slot - gap) / 2).clamp(0, 4).toDouble());
    final picked = this.picked;
    // The marked slot shows even where nothing was watched.
    if (picked != null) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(picked * slot, 0, slot, size.height),
          const Radius.circular(6),
        ),
        Paint()..color = mark.withValues(alpha: .1),
      );
    }
    for (final (index, value) in values.indexed) {
      if (value <= 0 || top <= 0) continue;
      final height = (value / top * size.height).clamp(3, size.height);
      final color = picked == null
          ? accent
          : index == picked
          ? mark
          : accent.withValues(alpha: .45);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(
            index * slot + gap / 2,
            size.height - height,
            slot - gap,
            height.toDouble(),
          ),
          radius,
        ),
        Paint()..color = color,
      );
    }
  }

  @override
  bool shouldRepaint(_BarsPainter old) =>
      old.picked != picked ||
      old.top != top ||
      old.accent != accent ||
      old.mark != mark ||
      old.line != line ||
      !_sameValues(old.values, values);

  static bool _sameValues(List<double> a, List<double> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

/// A square of the viewing times, and the room between them.
const _cellHeight = 24.0;
const _cellGap = 4.0;

/// Beside the squares, for the weekdays' names.
const _weekdayWidth = 64.0;

/// When in the week watching starts, as the phone's heatmap draws it: a
/// square per hour of each weekday, deeper for more. Under the title the
/// busiest time; focused, a square is marked, the busiest first, and the
/// line reads that hour and its watch time out instead.
class TvViewingTimes extends StatefulWidget {
  const TvViewingTimes({
    super.key,
    required this.stats,
    required this.focusNode,
  });

  final WatchStats stats;
  final FocusNode focusNode;

  @override
  State<TvViewingTimes> createState() => _TvViewingTimesState();
}

class _TvViewingTimesState extends State<TvViewingTimes> {
  // Weekdays count 1 to 7 from Monday, hours 0 to 23, as the server sends
  // them.
  late ActivityCell _peak = _peakOf(widget.stats);
  late int _day = _peak.weekday;
  late int _hour = _peak.hour;

  static ActivityCell _peakOf(WatchStats stats) => stats.activity.reduce(
    (best, cell) => cell.watchSeconds > best.watchSeconds ? cell : best,
  );

  @override
  void didUpdateWidget(TvViewingTimes old) {
    super.didUpdateWidget(old);
    if (!identical(old.stats, widget.stats)) {
      _peak = _peakOf(widget.stats);
      _day = _peak.weekday;
      _hour = _peak.hour;
    }
  }

  KeyEventResult _key(KeyEvent event) {
    final hour = _step(
      event,
      LogicalKeyboardKey.arrowLeft,
      LogicalKeyboardKey.arrowRight,
      24,
      _hour,
    );
    final day = _step(
      event,
      LogicalKeyboardKey.arrowUp,
      LogicalKeyboardKey.arrowDown,
      7,
      _day - 1,
    );
    if (hour == null && day == null) return KeyEventResult.ignored;
    if (_acts(event)) {
      setState(() {
        if (hour != null) _hour = hour;
        if (day != null) _day = day + 1;
      });
    }
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final locale = l.localeName;
    final seconds = {
      for (final cell in widget.stats.activity)
        (cell.weekday, cell.hour): cell.watchSeconds,
    };
    var max = 1.0;
    for (final value in seconds.values) {
      if (value > max) max = value;
    }
    return TvFocusable(
      focusNode: widget.focusNode,
      label: l.statsHeatmapTitle,
      button: false,
      onKey: _key,
      builder: (context, focused) {
        final muted = TvType.caption.style(color: colors.mutedForeground);
        final line = focused
            ? '${l.tvStatsHeatmapCell(weekdayName(_day, locale), hourName(_hour, locale), hourName((_hour + 1) % 24, locale))}'
                  ' · ${formatWatchTime(seconds[(_day, _hour)] ?? 0, l)}'
            : l.statsHeatmapPeak(
                weekdayName(_peak.weekday, locale),
                hourName(_peak.hour, locale),
              );
        return Padding(
          padding: const EdgeInsetsDirectional.only(
            start: TvPage.start,
            end: TvPage.end,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                l.statsHeatmapTitle,
                maxLines: 1,
                style: TvType.title.style(color: colors.foreground),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 16),
                child: Text(
                  line,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TvType.facts.style(
                    color: focused ? colors.foreground : colors.mutedForeground,
                  ),
                ),
              ),
              Row(
                children: [
                  SizedBox(
                    width: _weekdayWidth,
                    child: Column(
                      spacing: _cellGap,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (var weekday = 1; weekday <= 7; weekday++)
                          SizedBox(
                            height: _cellHeight,
                            child: Align(
                              alignment: AlignmentDirectional.centerStart,
                              child: Text(
                                weekdayName(weekday, locale, short: true),
                                maxLines: 1,
                                style: TvType.caption.style(
                                  color: focused && weekday == _day
                                      ? colors.foreground
                                      : colors.mutedForeground,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: SizedBox(
                      height: _cellHeight * 7 + _cellGap * 6,
                      child: CustomPaint(
                        painter: _CellsPainter(
                          seconds: seconds,
                          max: max,
                          marked: focused ? (_day, _hour) : null,
                          accent: colors.accent,
                          mark: colors.foreground,
                          empty: colors.foreground.withValues(alpha: .06),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              // The hours under the squares, every three.
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  children: [
                    const SizedBox(width: _weekdayWidth),
                    for (var hour = 0; hour < 24; hour += 3)
                      Expanded(
                        child: Text(
                          hourName(hour, locale),
                          maxLines: 1,
                          style: muted,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _CellsPainter extends CustomPainter {
  const _CellsPainter({
    required this.seconds,
    required this.max,
    required this.marked,
    required this.accent,
    required this.mark,
    required this.empty,
  });

  final Map<(int, int), double> seconds;
  final double max;
  final (int, int)? marked;
  final Color accent;
  final Color mark;
  final Color empty;

  @override
  void paint(Canvas canvas, Size size) {
    final width = (size.width - _cellGap * 23) / 24;
    const radius = Radius.circular(4);
    for (var weekday = 1; weekday <= 7; weekday++) {
      for (var hour = 0; hour < 24; hour++) {
        final value = seconds[(weekday, hour)] ?? 0;
        final color = marked == (weekday, hour)
            ? mark
            : value > 0
            ? accent.withValues(alpha: .3 + .7 * value / max)
            : empty;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(
              hour * (width + _cellGap),
              (weekday - 1) * (_cellHeight + _cellGap),
              width,
              _cellHeight,
            ),
            radius,
          ),
          Paint()..color = color,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_CellsPainter old) =>
      old.marked != marked ||
      old.max != max ||
      old.accent != accent ||
      old.mark != mark ||
      old.empty != empty ||
      !identical(old.seconds, seconds);
}
