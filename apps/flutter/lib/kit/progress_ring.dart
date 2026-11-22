import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'theme.dart';

class ProgressRing extends StatelessWidget {
  const ProgressRing(this.progress, {super.key, this.size = 20});

  final double? progress;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final value = progress?.clamp(0.0, 1.0);
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(end: value ?? 0),
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 700),
      builder: (context, shown, child) => CustomPaint(
        size: Size.square(size),
        painter: _RingPainter(
          value == null ? null : shown,
          colors.foreground.withValues(alpha: .2),
          colors.accent,
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter(this.progress, this.track, this.accent);

  final double? progress;
  final Color track;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final unit = size.shortestSide / 24;
    final center = size.center(Offset.zero);
    final radius = unit * 9;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = unit * 2.5
      ..color = track;
    canvas.drawCircle(center, radius, paint);
    paint
      ..color = accent
      ..strokeCap = StrokeCap.round;
    if (progress case final fraction?) {
      if (fraction == 1) {
        canvas.drawCircle(center, radius, paint);
      } else if (fraction > 0) {
        canvas.drawArc(
          Rect.fromCircle(center: center, radius: radius),
          -math.pi / 2,
          2 * math.pi * fraction,
          false,
          paint,
        );
      }
    } else {
      for (var i = 0; i < 12; i++) {
        final angle = (2 * math.pi * i / 12) - math.pi / 2;
        canvas.drawCircle(
          center + Offset(math.cos(angle), math.sin(angle)) * radius,
          unit * 1.25,
          Paint()..color = accent,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_RingPainter oldDelegate) =>
      progress != oldDelegate.progress ||
      track != oldDelegate.track ||
      accent != oldDelegate.accent;
}
