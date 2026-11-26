import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/frame_stats.dart';

void main() {
  test('a window becomes one line with its percentiles and slow counts', () {
    final stats = FrameStats(
      build: _ms([1, 2, 3, 4, 5]),
      raster: _ms([1, 9, 2]),
      total: _ms([10, 11, 12]),
      budgetMs: 8.3,
    );

    expect(
      stats.line,
      'frame-stats frames=5 budget=8.3 '
      'build_p50=3.0 build_p90=5.0 build_max=5.0 '
      'raster_p50=2.0 raster_p90=9.0 raster_max=9.0 '
      'slow_build=0 slow_raster=1 slow_total=3',
    );
  });

  test('a frame exactly on the budget is not slow', () {
    final stats = FrameStats(
      build: _ms([10]),
      raster: _ms([10]),
      total: _ms([10]),
      budgetMs: 10,
    );

    expect(stats.line, contains('slow_build=0 slow_raster=0 slow_total=0'));
  });

  test('the budget follows the display, with 60 Hz as the fallback', () {
    expect(frameBudgetMs(120), closeTo(8.333, 0.001));
    expect(frameBudgetMs(60), closeTo(16.667, 0.001));
    expect(frameBudgetMs(0), closeTo(16.667, 0.001));
    expect(frameBudgetMs(double.nan), closeTo(16.667, 0.001));
    expect(frameBudgetMs(double.infinity), closeTo(16.667, 0.001));
  });
}

List<Duration> _ms(List<int> values) => [
  for (final value in values) Duration(microseconds: value * 1000),
];
