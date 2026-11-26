import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';

/// One window of drawn frames, summed up as a `frame-stats` line.
///
/// The arithmetic is free of Flutter bindings so a test can feed it plain
/// durations.
final class FrameStats {
  FrameStats({
    required List<Duration> build,
    required List<Duration> raster,
    required List<Duration> total,
    required double budgetMs,
  }) : _build = _milliseconds(build),
       _raster = _milliseconds(raster),
       _total = _milliseconds(total),
       _budget = budgetMs;

  final List<double> _build;
  final List<double> _raster;
  final List<double> _total;
  final double _budget;

  /// The line `adb logcat` shows, with times in milliseconds to one decimal
  /// place.
  String get line {
    final build = _summary(_build);
    final raster = _summary(_raster);
    return 'frame-stats frames=${_build.length} '
        'budget=${_budget.toStringAsFixed(1)} '
        'build_p50=${build.p50.toStringAsFixed(1)} '
        'build_p90=${build.p90.toStringAsFixed(1)} '
        'build_max=${build.max.toStringAsFixed(1)} '
        'raster_p50=${raster.p50.toStringAsFixed(1)} '
        'raster_p90=${raster.p90.toStringAsFixed(1)} '
        'raster_max=${raster.max.toStringAsFixed(1)} '
        'slow_build=${_slow(_build)} '
        'slow_raster=${_slow(_raster)} '
        'slow_total=${_slow(_total)}';
  }

  /// How many of [values] went over the frame budget.
  int _slow(List<double> values) =>
      values.where((value) => value > _budget).length;
}

/// The frame budget in milliseconds at [refreshRate] Hz, or 60 Hz's when the
/// display reports a rate that can't be used.
double frameBudgetMs(double refreshRate) =>
    refreshRate > 0 && refreshRate.isFinite ? 1000 / refreshRate : 1000 / 60;

/// Collects the scheduler's frame timings and prints one [FrameStats] line
/// for each window of about a second in which frames were drawn.
final class FrameTimingLog {
  FrameTimingLog({required this.budgetMs});

  final double budgetMs;

  final List<Duration> _build = [];
  final List<Duration> _raster = [];
  final List<Duration> _total = [];
  int? _startMicros;

  /// Takes one batch of timings from the scheduler, which delivers them about
  /// once a second, and closes the window when a batch arrives a second or
  /// more after its first frame.
  void add(List<FrameTiming> timings) {
    if (timings.isEmpty) return;
    _startMicros ??= timings.first.timestampInMicroseconds(
      FramePhase.vsyncStart,
    );
    for (final timing in timings) {
      _build.add(timing.buildDuration);
      _raster.add(timing.rasterDuration);
      _total.add(timing.totalSpan);
    }
    final elapsed =
        timings.last.timestampInMicroseconds(FramePhase.vsyncStart) -
        _startMicros!;
    if (elapsed < Duration.microsecondsPerSecond) return;
    debugPrint(
      FrameStats(
        build: _build,
        raster: _raster,
        total: _total,
        budgetMs: budgetMs,
      ).line,
    );
    _build.clear();
    _raster.clear();
    _total.clear();
    _startMicros = null;
  }
}

/// Starts the frame timing log when the build passes
/// `--dart-define=MATINEE_FRAME_STATS=true`, and does nothing otherwise.
void startFrameStats() {
  if (!const bool.fromEnvironment('MATINEE_FRAME_STATS')) return;
  final log = FrameTimingLog(budgetMs: frameBudgetMs(_displayRefreshRate()));
  SchedulerBinding.instance.addTimingsCallback(log.add);
}

/// The first view's refresh rate, or zero when there is no view to ask.
double _displayRefreshRate() {
  final views = PlatformDispatcher.instance.views;
  return views.isEmpty ? 0 : views.first.display.refreshRate;
}

List<double> _milliseconds(List<Duration> durations) => [
  for (final duration in durations) duration.inMicroseconds / 1000,
];

({double p50, double p90, double max}) _summary(List<double> values) {
  final sorted = [...values]..sort();
  return (
    p50: _percentile(sorted, 50),
    p90: _percentile(sorted, 90),
    max: sorted.isEmpty ? 0 : sorted.last,
  );
}

/// The nearest-rank percentile of [sorted], zero for an empty list.
double _percentile(List<double> sorted, int percent) {
  if (sorted.isEmpty) return 0;
  final rank = ((percent / 100) * (sorted.length - 1)).round();
  return sorted[rank];
}
