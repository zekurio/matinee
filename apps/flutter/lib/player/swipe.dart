import 'dart:math' as math;

/*
 * The arithmetic of swipes on the video, with Findroid's numbers, so a swipe
 * goes as far there as here.
 */

/// The part of the video's height a swipe crosses to go from nothing to full.
const swipeFullRange = 0.66;

/// Seconds a sideways swipe moves the video for each logical pixel the
/// finger travels.
const swipeSecondsPerPixel = 0.25;

/// How fast the video plays while a finger holds it.
const holdSpeed = 2.0;

/// A brightness or volume, from 0 to 1, that started at [start] after the
/// finger moved [dragY] pixels down a video [height] pixels high. Up raises it.
double swipeLevel(double start, double dragY, double height) {
  final from = start.isNaN ? 0.0 : start.clamp(0.0, 1.0);
  if (height <= 0 || dragY.isNaN) return from;
  return (from - dragY / (height * swipeFullRange)).clamp(0.0, 1.0);
}

/// Some screens turn their backlight off at 0, so the lowest brightness
/// stays just above.
const minBrightness = 0.01;

/*
 * A window's brightness is the backlight's power, and the eye goes by
 * ratios, so equal steps of it look huge near the bottom and like nothing
 * near the top. A swipe's level goes through the curve the system's own
 * slider uses, the hybrid log-gamma one in Android's BrightnessUtils, so
 * each bit of the swipe looks like the same step.
 */
const _hlgR = 0.5;
const _hlgA = 0.17883277;
const _hlgB = 0.28466892;
const _hlgC = 0.55991073;

/// The window brightness, from [minBrightness] to 1, for a swipe [level]
/// from 0 to 1.
double brightnessOfLevel(double level) {
  final at = level.isNaN ? 0.0 : level.clamp(0.0, 1.0);
  final power = at <= _hlgR
      ? math.pow(at / _hlgR, 2)
      : math.exp((at - _hlgC) / _hlgA) + _hlgB;
  return (minBrightness + (1 - minBrightness) * power / 12).clamp(
    minBrightness,
    1.0,
  );
}

/// The swipe level, from 0 to 1, that gives a window [brightness].
double levelOfBrightness(double brightness) {
  if (brightness.isNaN) return 0;
  final power =
      (brightness.clamp(minBrightness, 1.0) - minBrightness) /
      (1 - minBrightness) *
      12;
  final level = power <= 1
      ? math.sqrt(power) * _hlgR
      : _hlgA * math.log(power - _hlgB) + _hlgC;
  return level.clamp(0.0, 1.0);
}

/// Where a sideways swipe of [drag] logical pixels lands from [from]
/// seconds, kept within the video.
double swipeSeek(double from, double drag, double duration) {
  final to = drag.isNaN ? from : from + drag * swipeSecondsPerPixel;
  return to.clamp(0.0, math.max(0.0, duration));
}
