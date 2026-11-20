import 'dart:math' as math;

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../kit/kit.dart';
import 'player_motion.dart';

/// The time played and the full length over the seek track, as the Kotlin
/// player's `SeekBar` lays them out: the times on their own row, the track
/// the full width under them, with nothing beside it.
class SeekBar extends StatelessWidget {
  const SeekBar({
    super.key,
    required this.position,
    required this.duration,
    required this.buffered,
    required this.scrubbing,
    required this.back,
    required this.ahead,
    required this.label,
    required this.describe,
    required this.onScrub,
    required this.onScrubEnd,
    required this.onSeek,
  });

  /// Where the bar shows: the scrubbed time while scrubbing.
  final double position;
  final double duration;
  final double? buffered;
  final bool scrubbing;

  /// How far a left or right key moves the bar, as the skip buttons do.
  final double? back;
  final double? ahead;
  final String label;

  /// What a screen reader hears as the bar's value, like "1:02 of 23:40".
  final String Function(String position, String duration) describe;
  final ValueChanged<double>? onScrub;
  final VoidCallback? onScrubEnd;
  final ValueChanged<double>? onSeek;

  @override
  Widget build(BuildContext context) {
    final length = math.max(0.0, duration);
    final style = KitText.sm.style(color: MatineeTheme.of(context).foreground);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            SeekClock(seconds: position, duration: length, style: style),
            const Spacer(),
            SeekClock(
              seconds: length,
              duration: length,
              style: style,
              alignment: AlignmentDirectional.centerEnd,
            ),
          ],
        ),
        SeekTrack(
          position: position,
          duration: length,
          buffered: buffered ?? 0,
          back: back,
          ahead: ahead,
          scrubbing: scrubbing,
          label: label,
          describe: describe,
          onScrub: onScrub,
          onScrubEnd: onScrubEnd,
          onSeek: onSeek,
        ),
      ],
    );
  }
}

/// A time beside the seek bar, with tabular figures and as wide as the
/// longest time [duration] can show, so neither it nor what sits beside it
/// moves as it counts (the Kotlin player's `SteadyText`).
class SeekClock extends StatelessWidget {
  const SeekClock({
    super.key,
    required this.seconds,
    required this.duration,
    required this.style,
    this.alignment = AlignmentDirectional.centerStart,
  });

  final double seconds;
  final double duration;
  final TextStyle style;
  final AlignmentGeometry alignment;

  @override
  Widget build(BuildContext context) {
    final tabular = style.copyWith(
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return Stack(
      alignment: alignment,
      children: [
        // Holds the width of the widest time; every digit is as wide as a 0.
        ExcludeSemantics(
          child: Opacity(
            opacity: 0,
            child: Text(
              formatClock(duration).replaceAll(RegExp('[0-9]'), '0'),
              style: tabular,
              maxLines: 1,
              softWrap: false,
            ),
          ),
        ),
        Text(
          formatClock(seconds),
          style: tabular,
          maxLines: 1,
          softWrap: false,
        ),
      ],
    );
  }
}

/// The seek bar as the web player draws it: a thin line, what's buffered in
/// a lighter shade, what's played in the accent, and a dot to drag.
///
/// A finger taps or drags it, scrubbing until it lifts. A keyboard or remote
/// focuses it and scrubs by [back] with left and [ahead] with right, seeking
/// when the key comes up. A screen reader hears it as a slider and moves it
/// by the same steps, seeking at once through [onSeek].
class SeekTrack extends StatefulWidget {
  const SeekTrack({
    super.key,
    required this.position,
    required this.duration,
    required this.buffered,
    required this.back,
    required this.ahead,
    required this.scrubbing,
    required this.label,
    required this.describe,
    required this.onScrub,
    required this.onScrubEnd,
    required this.onSeek,
  });

  final double position;
  final double duration;
  final double buffered;
  final double? back;
  final double? ahead;
  final bool scrubbing;
  final String label;
  final String Function(String position, String duration) describe;
  final ValueChanged<double>? onScrub;
  final VoidCallback? onScrubEnd;
  final ValueChanged<double>? onSeek;

  @override
  State<SeekTrack> createState() => _SeekTrackState();
}

class _SeekTrackState extends State<SeekTrack> {
  bool _focused = false;

  /// Where held arrow keys got to, so each repeat steps on from there.
  double? _keyed;

  bool get _enabled =>
      widget.duration.isFinite &&
      widget.duration > 0 &&
      widget.onScrub != null &&
      widget.onScrubEnd != null;

  double _clamp(double seconds) =>
      _enabled ? seconds.clamp(0.0, widget.duration).toDouble() : 0;

  double _at(double x, double width) {
    if (!_enabled || width <= 0) return 0;
    return (x / width).clamp(0.0, 1.0) * widget.duration;
  }

  void _endKeys() {
    if (_keyed == null) return;
    _keyed = null;
    widget.onScrubEnd?.call();
  }

  KeyEventResult _key(FocusNode _, KeyEvent event) {
    final direction = switch (event.logicalKey) {
      LogicalKeyboardKey.arrowLeft => -1,
      LogicalKeyboardKey.arrowRight => 1,
      _ => 0,
    };
    if (direction == 0 || !_enabled) return KeyEventResult.ignored;
    if (event is KeyUpEvent) {
      _endKeys();
      return KeyEventResult.handled;
    }
    final step = direction < 0 ? widget.back : widget.ahead;
    if (step == null) return KeyEventResult.ignored;
    final to = _clamp((_keyed ?? widget.position) + direction * step);
    _keyed = to;
    widget.onScrub?.call(to);
    return KeyEventResult.handled;
  }

  void _seekBy(double step) {
    if (!_enabled) return;
    widget.onSeek?.call(_clamp(widget.position + step));
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final enabled = _enabled;
    final back = widget.back;
    final ahead = widget.ahead;
    final position = _clamp(widget.position);
    String describe(double seconds) =>
        widget.describe(formatClock(seconds), formatClock(widget.duration));
    final value = enabled ? describe(position) : formatClock(position);
    final fraction = enabled ? position / widget.duration : 0.0;
    final loaded = enabled
        ? (_clamp(widget.buffered) / widget.duration).toDouble()
        : 0.0;
    return Semantics(
      slider: true,
      label: widget.label,
      value: value,
      increasedValue: enabled && ahead != null
          ? describe(_clamp(position + ahead))
          : null,
      decreasedValue: enabled && back != null
          ? describe(_clamp(position - back))
          : null,
      enabled: enabled,
      onIncrease: enabled && ahead != null ? () => _seekBy(ahead) : null,
      onDecrease: enabled && back != null ? () => _seekBy(-back) : null,
      child: Focus(
        canRequestFocus: enabled,
        onFocusChange: (focused) {
          setState(() => _focused = focused);
          if (!focused) _endKeys();
        },
        onKeyEvent: _key,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth;
            return GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapUp: enabled
                  ? (details) {
                      widget.onScrub?.call(
                        _at(details.localPosition.dx, width),
                      );
                      widget.onScrubEnd?.call();
                    }
                  : null,
              onHorizontalDragStart: enabled
                  ? (details) => widget.onScrub?.call(
                      _at(details.localPosition.dx, width),
                    )
                  : null,
              onHorizontalDragUpdate: enabled
                  ? (details) => widget.onScrub?.call(
                      _at(details.localPosition.dx, width),
                    )
                  : null,
              onHorizontalDragEnd: enabled
                  ? (_) => widget.onScrubEnd?.call()
                  : null,
              onHorizontalDragCancel: enabled ? widget.onScrubEnd : null,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  border: _focused
                      ? Border.all(color: colors.accent, width: 2)
                      : null,
                ),
                child: SizedBox(
                  height: 48,
                  width: double.infinity,
                  child: Center(
                    // The dot grows under the finger, and while focused.
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(end: widget.scrubbing || _focused ? 11 : 8),
                      duration: PlayerMotion.color,
                      curve: PlayerMotion.easing,
                      builder: (context, thumb, _) => CustomPaint(
                        size: const Size(double.infinity, 24),
                        painter: _TrackPainter(
                          played: fraction,
                          loaded: loaded,
                          thumb: thumb,
                          line: colors.foreground,
                          accent: colors.accent,
                        ),
                      ),
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

class _TrackPainter extends CustomPainter {
  const _TrackPainter({
    required this.played,
    required this.loaded,
    required this.thumb,
    required this.line,
    required this.accent,
  });

  final double played;
  final double loaded;
  final double thumb;
  final Color line;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height / 2;
    void stroke(double to, Color color) => canvas.drawLine(
      Offset(0, y),
      Offset(to, y),
      Paint()
        ..color = color
        ..strokeWidth = 5
        ..strokeCap = StrokeCap.round,
    );
    stroke(size.width, line.withValues(alpha: .2));
    stroke(size.width * loaded, line.withValues(alpha: .35));
    final at = size.width * played;
    stroke(at, accent);
    canvas.drawCircle(Offset(at, y), thumb, Paint()..color = accent);
  }

  @override
  bool shouldRepaint(_TrackPainter old) =>
      old.played != played ||
      old.loaded != loaded ||
      old.thumb != thumb ||
      old.line != line ||
      old.accent != accent;
}

/// A time as the player shows it: 4:05, or 1:02:03 past an hour.
String formatClock(double seconds) {
  final total = seconds.isFinite ? math.max(0, seconds.toInt()) : 0;
  final hours = total ~/ 3600;
  final minutes = (total ~/ 60) % 60;
  final rest = (total % 60).toString().padLeft(2, '0');
  return hours > 0
      ? '$hours:${minutes.toString().padLeft(2, '0')}:$rest'
      : '$minutes:$rest';
}
