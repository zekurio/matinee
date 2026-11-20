import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import '../kit/kit.dart';
import '../l10n/app_localizations.dart';
import '../platform/player_system.g.dart' as wire;
import 'player_motion.dart';
import 'player_preferences.dart';
import 'seek_bar.dart';
import 'swipe.dart';

/// What a touch on the video does: one of the swipes, or a hold that plays
/// faster.
enum GestureKind { brightness, volume, seek, hold }

/// The gesture under the finger, which the notes over the video show.
@immutable
class GestureInfo {
  const GestureInfo(
    this.kind, {
    this.level = 0,
    this.from = 0,
    this.target = 0,
  });

  final GestureKind kind;

  /// The brightness or volume it set, from 0 to 1.
  final double level;

  /// Where a seek swipe started, and where it lands when the finger lifts.
  final double from;
  final double target;
}

/// The window's brightness and the media volume, which swipes change.
abstract class DeviceLevels {
  /// The brightness as a swipe level, and the volume, or null for a device
  /// whose volume is fixed.
  Future<({double brightness, double? volume})> read();

  /// Sets the volume to the step nearest [level] and says where it is now.
  Future<double> setVolume(double level);

  /// Sets the window's brightness to a swipe [level], or back to the
  /// system's with null.
  Future<void> setBrightness(double? level);
}

/// [DeviceLevels] through the platform.
class PlatformLevels implements DeviceLevels {
  PlatformLevels([wire.PlayerSystemApi? api])
    : _api = api ?? wire.PlayerSystemApi();

  final wire.PlayerSystemApi _api;

  @override
  Future<({double brightness, double? volume})> read() async {
    final levels = await _api.levels();
    return (
      brightness: levelOfBrightness(levels.brightness),
      volume: levels.volume,
    );
  }

  @override
  Future<double> setVolume(double level) => _api.setVolume(level);

  @override
  Future<void> setBrightness(double? level) =>
      _api.setBrightness(level == null ? null : brightnessOfLevel(level));
}

/// How far from the top and bottom, and from the sides, a swipe starts for
/// the system's own gestures.
const _edgeVertical = 48.0;
const _edgeSide = 24.0;

/// How far two fingers spread, or pinch by its inverse, before the video
/// switches between fitting and filling the screen.
const pinchFill = 1.15;

/// Touches on the video, as the Kotlin phone player has them, which has
/// them from Findroid: a tap shows and hides the controls, a double tap on
/// either half skips, up or down on the left half sets the brightness and
/// on the right half the volume, sideways seeks to where the finger lifts,
/// a finger held still plays at [holdSpeed] until it lifts, and two
/// fingers spread to fill the screen or pinch to show the video whole.
/// Which swipe it is goes by the way the finger first moves. A touch that
/// starts where the system takes its own gestures, as at the edges for
/// back, only taps. A second finger hands the touch to the pinch without
/// seeking.
class VideoGestures extends StatefulWidget {
  const VideoGestures({
    super.key,
    required this.enabled,
    required this.prefs,
    required this.levels,
    required this.duration,
    required this.position,
    required this.playing,
    required this.notes,
    required this.onTap,
    required this.onDoubleTap,
    required this.onPinch,
    required this.onSeek,
    required this.onHold,
    required this.onStart,
    required this.onBrightness,
    this.semanticsLabel,
    this.semanticsHint,
  });

  /// Whether swipes and holds work now; taps always do.
  final bool enabled;
  final PlayerPrefs prefs;
  final DeviceLevels levels;
  final double Function() duration;
  final double Function() position;
  final bool Function() playing;

  /// The gesture under way, for [GestureNotes].
  final ValueNotifier<GestureInfo?> notes;
  final VoidCallback onTap;

  /// True on the right half, which skips ahead.
  final ValueChanged<bool> onDoubleTap;

  /// True when the fingers spread to fill the screen.
  final ValueChanged<bool> onPinch;
  final ValueChanged<double> onSeek;

  /// True as a hold starts, answering whether the speed went up; false as
  /// it ends.
  final bool Function(bool start) onHold;
  final ValueChanged<GestureKind> onStart;

  /// The swipe level a brightness swipe left, to keep when settings say so.
  final ValueChanged<double> onBrightness;
  final String? semanticsLabel;
  final String? semanticsHint;

  @override
  State<VideoGestures> createState() => _VideoGesturesState();
}

class _VideoGesturesState extends State<VideoGestures> {
  final _pointers = <int, Offset>{};
  int? _first;
  Offset _origin = Offset.zero;
  Offset _moved = Offset.zero;
  bool _edge = false;
  bool _multi = false;
  bool _pinched = false;
  bool _swipeOff = false;
  double _pinchFrom = 0;
  GestureKind? _kind;
  double _start = 0;
  ({double brightness, double? volume})? _read;
  Timer? _holdTimer;
  Timer? _tapTimer;
  (Duration, Offset)? _lastTap;
  int _volumeWrites = 0;

  @override
  void dispose() {
    _holdTimer?.cancel();
    _tapTimer?.cancel();
    if (_kind == GestureKind.hold) widget.onHold(false);
    super.dispose();
  }

  bool _nearEdge(Offset at, Size size) {
    final insets = MediaQuery.systemGestureInsetsOf(context);
    final left = math.max(insets.left, _edgeSide);
    final right = math.max(insets.right, _edgeSide);
    final top = math.max(insets.top, _edgeVertical);
    final bottom = math.max(insets.bottom, _edgeVertical);
    return at.dx < left ||
        at.dx > size.width - right ||
        at.dy < top ||
        at.dy > size.height - bottom;
  }

  void _down(PointerDownEvent event) {
    _pointers[event.pointer] = event.localPosition;
    if (_pointers.length > 1) {
      _second();
      return;
    }
    final size = context.size ?? Size.zero;
    _first = event.pointer;
    _origin = event.localPosition;
    _moved = Offset.zero;
    _multi = false;
    _pinched = false;
    _swipeOff = false;
    _kind = null;
    _edge = _nearEdge(event.localPosition, size);
    if (!widget.enabled || _edge) return;
    if (widget.prefs.swipeLevels) {
      _read = null;
      unawaited(
        widget.levels
            .read()
            .then((levels) {
              if (mounted) _read = levels;
            })
            .catchError((Object _) {}),
      );
    }
    if (widget.prefs.holdSpeed && widget.playing()) {
      // Before it moves, the finger may become a hold by staying put.
      _holdTimer = Timer(kLongPressTimeout, () {
        if (_kind != null || _multi || !widget.onHold(true)) return;
        _begin(GestureKind.hold, const GestureInfo(GestureKind.hold));
      });
    }
  }

  /// A second finger: the touch is the pinch's now, and a swipe under way
  /// stops where it was without seeking.
  void _second() {
    _multi = true;
    _holdTimer?.cancel();
    _tapTimer?.cancel();
    _lastTap = null;
    _finish(lifted: false);
    final points = _pointers.values.take(2).toList();
    _pinchFrom = (points[0] - points[1]).distance;
  }

  void _begin(GestureKind kind, GestureInfo info) {
    _kind = kind;
    widget.notes.value = info;
    widget.onStart(kind);
  }

  void _move(PointerMoveEvent event) {
    _pointers[event.pointer] = event.localPosition;
    if (_multi) {
      if (_pointers.length < 2 || _pinched || _pinchFrom <= 0) return;
      final points = _pointers.values.take(2).toList();
      final ratio = (points[0] - points[1]).distance / _pinchFrom;
      final fill = ratio > pinchFill
          ? true
          : ratio < 1 / pinchFill
          ? false
          : null;
      if (fill == null) return;
      _pinched = true;
      widget.onPinch(fill);
      return;
    }
    if (event.pointer != _first) return;
    _moved += event.localDelta;
    final size = context.size ?? Size.zero;
    final kind = _kind;
    if (kind == null) {
      if (_moved.distance < kTouchSlop) return;
      _holdTimer?.cancel();
      if (!widget.enabled || _edge || _swipeOff) {
        _swipeOff = true;
        return;
      }
      final vertical = _moved.dy.abs() > _moved.dx.abs();
      final prefs = widget.prefs;
      final duration = widget.duration();
      final read = _read;
      final next = switch (vertical) {
        true when prefs.swipeLevels && _origin.dx < size.width / 2 =>
          GestureKind.brightness,
        true when prefs.swipeLevels && (read == null || read.volume != null) =>
          GestureKind.volume,
        false when prefs.swipeSeek && duration.isFinite && duration > 0 =>
          GestureKind.seek,
        _ => null,
      };
      // A swipe that's turned off stays the taps' and the pinch's.
      if (next == null) {
        _swipeOff = true;
        return;
      }
      final position = widget.position();
      _start = switch (next) {
        GestureKind.brightness => read?.brightness ?? .5,
        GestureKind.volume => read?.volume ?? .5,
        _ => 0,
      };
      _begin(
        next,
        GestureInfo(next, level: _start, from: position, target: position),
      );
    }
    switch (_kind) {
      case GestureKind.brightness:
        final level = swipeLevel(_start, _moved.dy, size.height);
        unawaited(widget.levels.setBrightness(level).catchError((Object _) {}));
        widget.notes.value = GestureInfo(GestureKind.brightness, level: level);
      case GestureKind.volume:
        final level = swipeLevel(_start, _moved.dy, size.height);
        widget.notes.value = GestureInfo(GestureKind.volume, level: level);
        final write = ++_volumeWrites;
        unawaited(
          widget.levels
              .setVolume(level)
              .then((set) {
                // The note shows the step it reached, unless a newer move came.
                if (write == _volumeWrites && _kind == GestureKind.volume) {
                  widget.notes.value = GestureInfo(
                    GestureKind.volume,
                    level: set,
                  );
                }
              })
              .catchError((Object _) {}),
        );
      case GestureKind.seek:
        final from = widget.notes.value?.from ?? widget.position();
        widget.notes.value = GestureInfo(
          GestureKind.seek,
          from: from,
          target: swipeSeek(from, _moved.dx, widget.duration()),
        );
      // Moving a held finger keeps the hold.
      case GestureKind.hold:
      case null:
        break;
    }
  }

  void _up(PointerUpEvent event) {
    final first = event.pointer == _first;
    _pointers.remove(event.pointer);
    if (!first) return;
    _first = null;
    _holdTimer?.cancel();
    final tap = !_multi && _kind == null && _moved.distance < kTouchSlop;
    _finish(lifted: true);
    if (tap) _tapped(event.timeStamp, event.localPosition);
  }

  void _cancel(PointerCancelEvent event) {
    _pointers.remove(event.pointer);
    if (event.pointer != _first) return;
    _first = null;
    _holdTimer?.cancel();
    _finish(lifted: false);
  }

  /// Ends the swipe or hold under way. A seek lands only where a finger
  /// lifted.
  void _finish({required bool lifted}) {
    final kind = _kind;
    if (kind == null) return;
    final info = widget.notes.value;
    switch (kind) {
      case GestureKind.seek:
        if (lifted && info != null) widget.onSeek(info.target);
      case GestureKind.brightness:
        if (info != null) widget.onBrightness(info.level);
      case GestureKind.hold:
        widget.onHold(false);
      case GestureKind.volume:
        break;
    }
    _kind = null;
    widget.notes.value = null;
  }

  /// A tap waits to see whether a second makes it a double tap.
  void _tapped(Duration at, Offset position) {
    final last = _lastTap;
    if (last != null &&
        at - last.$1 <= kDoubleTapTimeout &&
        (position - last.$2).distance <= kDoubleTapSlop) {
      _tapTimer?.cancel();
      _lastTap = null;
      final width = context.size?.width ?? 0;
      widget.onDoubleTap(position.dx >= width / 2);
      return;
    }
    _lastTap = (at, position);
    _tapTimer?.cancel();
    _tapTimer = Timer(kDoubleTapTimeout, () {
      _lastTap = null;
      widget.onTap();
    });
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: widget.semanticsLabel,
    onTapHint: widget.semanticsHint,
    onTap: widget.onTap,
    child: Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: _down,
      onPointerMove: _move,
      onPointerUp: _up,
      onPointerCancel: _cancel,
    ),
  );
}

/// How long a note stays after the finger lifts.
const _lingerFor = Duration(milliseconds: 800);

/// What a gesture does, while it does and for a moment after: the
/// brightness on the left, the volume on the right, and where a seek lands
/// in the middle, with its trickplay frame from [frame]. [holding] shows
/// the faster speed while a finger holds the video.
class GestureNotes extends StatefulWidget {
  const GestureNotes({
    super.key,
    required this.notes,
    required this.duration,
    required this.holding,
    this.frame,
  });

  final ValueListenable<GestureInfo?> notes;
  final double duration;
  final bool holding;

  /// The trickplay frame at a time, as wide as asked; null without one.
  final Widget? Function(double seconds, double width)? frame;

  @override
  State<GestureNotes> createState() => _GestureNotesState();
}

class _GestureNotesState extends State<GestureNotes> {
  GestureInfo? _shown;
  bool _live = false;
  Timer? _linger;

  @override
  void initState() {
    super.initState();
    widget.notes.addListener(_changed);
  }

  @override
  void didUpdateWidget(GestureNotes old) {
    super.didUpdateWidget(old);
    if (old.notes != widget.notes) {
      old.notes.removeListener(_changed);
      widget.notes.addListener(_changed);
    }
  }

  @override
  void dispose() {
    widget.notes.removeListener(_changed);
    _linger?.cancel();
    super.dispose();
  }

  void _changed() {
    final info = widget.notes.value;
    if (info != null) {
      _linger?.cancel();
      setState(() {
        _shown = info;
        _live = true;
      });
      return;
    }
    _linger?.cancel();
    _linger = Timer(_lingerFor, () {
      if (mounted) setState(() => _live = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final shown = _shown;
    final kind = _live ? shown?.kind : null;
    // The screen reader has its own way to set these, so the notes stay silent.
    return ExcludeSemantics(
      child: IgnorePointer(
        child: SafeArea(
          child: Stack(
            children: [
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: Padding(
                  padding: const EdgeInsetsDirectional.only(start: 32),
                  child: PlayerFade(
                    visible: kind == GestureKind.brightness,
                    child: _LevelNote(
                      icon: Lucide.sun,
                      level: shown?.level ?? 0,
                    ),
                  ),
                ),
              ),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: Padding(
                  padding: const EdgeInsetsDirectional.only(end: 32),
                  child: PlayerFade(
                    visible: kind == GestureKind.volume,
                    child: _LevelNote(
                      icon: (shown?.level ?? 0) <= 0
                          ? Lucide.volumeX
                          : Lucide.volume,
                      level: shown?.level ?? 0,
                    ),
                  ),
                ),
              ),
              Center(
                child: PlayerFade(
                  visible: kind == GestureKind.seek,
                  child: _SeekNote(
                    from: shown?.from ?? 0,
                    to: shown?.target ?? 0,
                    duration: widget.duration,
                    frame: widget.frame,
                  ),
                ),
              ),
              // Only while the finger holds, since the speed goes back as it lifts.
              Align(
                alignment: Alignment.topCenter,
                child: Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: PlayerFade(
                    visible: widget.holding,
                    child: _NoteBox(
                      radius: 12,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        spacing: 8,
                        children: [
                          const KitIcon(
                            Lucide.fastForward,
                            size: 18,
                            color: Color(0xFFFFFFFF),
                          ),
                          Text(
                            l.playerSpeedRate('2'),
                            style: KitText.base.style(
                              color: const Color(0xFFFFFFFF),
                              weight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoteBox extends StatelessWidget {
  const _NoteBox({
    required this.child,
    required this.radius,
    required this.padding,
  });

  final Widget child;
  final double radius;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: const Color(0x99000000),
      borderRadius: BorderRadius.circular(radius),
    ),
    child: Padding(padding: padding, child: child),
  );
}

/// A brightness or volume: how much as a number, as a bar filling up, and
/// which one.
class _LevelNote extends StatelessWidget {
  const _LevelNote({required this.icon, required this.level});

  final String icon;
  final double level;

  @override
  Widget build(BuildContext context) {
    final percent = NumberFormat.percentPattern(
      Localizations.localeOf(context).toLanguageTag(),
    );
    final style = KitText.sm.style(
      color: const Color(0xFFFFFFFF),
      weight: FontWeight.w500,
    );
    return _NoteBox(
      radius: 16,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // As wide as the fullest level, so the box and its bar hold still.
          Stack(
            alignment: Alignment.center,
            children: [
              Opacity(opacity: 0, child: Text(percent.format(1), style: style)),
              Text(percent.format(level), style: style),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: KitRadius.pill,
            child: SizedBox(
              width: 6,
              height: 120,
              child: ColoredBox(
                color: const Color(0x40FFFFFF),
                child: Align(
                  alignment: Alignment.bottomCenter,
                  child: FractionallySizedBox(
                    heightFactor: level.clamp(0.0, 1.0),
                    widthFactor: 1,
                    child: ColoredBox(color: MatineeTheme.of(context).accent),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          KitIcon(icon, size: 20, color: const Color(0xFFFFFFFF)),
        ],
      ),
    );
  }
}

/// Where a seek swipe lands: its trickplay frame, how far it moves, and the
/// time it lands at.
class _SeekNote extends StatelessWidget {
  const _SeekNote({
    required this.from,
    required this.to,
    required this.duration,
    this.frame,
  });

  final double from;
  final double to;
  final double duration;
  final Widget? Function(double seconds, double width)? frame;

  @override
  Widget build(BuildContext context) {
    final delta = to - from;
    final longest = formatClock(duration).replaceAll(RegExp('[0-9]'), '0');
    final total = formatClock(duration);
    const white = Color(0xFFFFFFFF);
    final big = KitText.xl
        .style(color: white, weight: FontWeight.w600)
        .copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
    final small = KitText.sm
        .style(color: white.withValues(alpha: .75))
        .copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
    final picture = frame?.call(to, 200);
    return _NoteBox(
      radius: 12,
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (picture != null) ...[
            ClipRRect(borderRadius: BorderRadius.circular(6), child: picture),
            const SizedBox(height: 8),
          ],
          _Steady(
            '${delta < 0 ? '-' : '+'}${formatClock(delta.abs())}',
            '+$longest',
            big,
          ),
          _Steady('${formatClock(to)} / $total', '$longest / $total', small),
        ],
      ),
    );
  }
}

/// [text] as wide as [longest], so the box around it holds still.
class _Steady extends StatelessWidget {
  const _Steady(this.text, this.longest, this.style);

  final String text;
  final String longest;
  final TextStyle style;

  @override
  Widget build(BuildContext context) => Stack(
    alignment: Alignment.center,
    children: [
      Opacity(opacity: 0, child: Text(longest, style: style, maxLines: 1)),
      Text(text, style: style, maxLines: 1),
    ],
  );
}
