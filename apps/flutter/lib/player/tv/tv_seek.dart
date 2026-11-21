import 'dart:math' as math;

/// Seconds of video a held key moves per second at first, as a multiple of
/// one press's step.
const _holdStartSteps = 3.0;

/// Seconds a held key takes to double its speed.
const _holdDoublingSeconds = 1.5;

/// The fastest a held key moves: this share of the video per second.
const _holdMaxShare = .1;

/// The longest gap between two repeats that counts in full, so a stall
/// doesn't jump.
const _holdGap = Duration(milliseconds: 250);

/// Whether a video [duration] seconds long has a length to seek in.
bool seekable(double duration) => duration.isFinite && duration > 0;

/// [seconds] kept within the video, or 0 while its length is unknown.
double seekClamp(double seconds, double duration) {
  if (!seekable(duration) || seconds.isNaN) return 0;
  return seconds.clamp(0, duration).toDouble();
}

/// How far along the bar [seconds] sits, from 0 to 1.
double seekFraction(double seconds, double duration) =>
    seekable(duration) ? seekClamp(seconds, duration) / duration : 0;

/// Where Left and Right on a remote have taken the seek bar, as the Kotlin
/// app's `KeySeek`. A press steps by the skip length; a held key glides on
/// from there, faster the longer it's held, up to a tenth of the video a
/// second. The player seeks once, to [target], when the key comes up.
class KeySeek {
  /// Where the keys have got to, until [release].
  double? get target => _target;
  double? _target;

  Duration _heldSince = Duration.zero;
  Duration _last = Duration.zero;

  /// A key down: [repeat] is whether the system repeats it while held, and
  /// [at] the event's time. Moves on from [target], or from [from] for a
  /// first press, by [step] seconds toward [direction].
  double? press({
    required double from,
    required int direction,
    required double step,
    required double duration,
    required bool repeat,
    required Duration at,
  }) {
    if (!seekable(duration) || direction == 0) return null;
    final start = _target;
    final sign = direction < 0 ? -1 : 1;
    final double next;
    if (start == null || !repeat) {
      _heldSince = at;
      next = (start ?? from) + sign * step;
    } else {
      final held = (at - _heldSince).inMicroseconds / 1e6;
      final base = step * _holdStartSteps;
      final rate = math.min(
        base * math.pow(2, held / _holdDoublingSeconds),
        math.max(duration * _holdMaxShare, base),
      );
      final gap = at - _last;
      final counted = gap < Duration.zero
          ? Duration.zero
          : gap > _holdGap
          ? _holdGap
          : gap;
      next = start + sign * rate * counted.inMicroseconds / 1e6;
    }
    _last = at;
    return _target = seekClamp(next, duration);
  }

  /// The key came up: where to seek, if the keys moved.
  double? release() {
    final at = _target;
    _target = null;
    return at;
  }
}

/// How close a refresh rate must come to a multiple of the frame rate, in
/// Hz, to count as exact.
const _exactHz = .01;

/// How close one may come at all, as 24 Hz for a 23.976 fps file when no
/// 23.976 Hz mode exists.
const _nearHz = .05;

/// The refresh rate among [rates] that plays [fps] evenly, as the Kotlin
/// app's `matchingRefreshRate`: an exact multiple before a near one, and
/// the lowest multiple first, so 24 fps takes 24 Hz before 48 or 120. Null
/// when none fits, or for no frame rate.
double? matchingRefreshRate(List<double> rates, double? fps) {
  if (fps == null || !fps.isFinite || fps <= 0) return null;
  final fits = <({double rate, int multiple, double off})>[];
  for (final rate in rates) {
    final multiple = (rate / fps).round();
    if (multiple < 1) continue;
    final off = (rate - multiple * fps).abs();
    if (off > _nearHz * multiple) continue;
    fits.add((rate: rate, multiple: multiple, off: off));
  }
  if (fits.isEmpty) return null;
  int exact(({double rate, int multiple, double off}) fit) =>
      fit.off > _exactHz * fit.multiple ? 1 : 0;
  fits.sort((a, b) {
    final byExact = exact(a).compareTo(exact(b));
    if (byExact != 0) return byExact;
    final byMultiple = a.multiple.compareTo(b.multiple);
    if (byMultiple != 0) return byMultiple;
    return a.off.compareTo(b.off);
  });
  return fits.first.rate;
}
