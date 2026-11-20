import 'package:flutter/material.dart' as material;
import 'package:flutter/widgets.dart';

import 'theme.dart';
import 'tokens.dart';

export 'package:flutter/material.dart' show RangeValues;

class Slider extends StatelessWidget {
  const Slider({
    super.key,
    required this.value,
    required this.onChanged,
    this.min = 0,
    this.max = 1,
    this.divisions,
    this.buffered,
    this.onChangeStart,
    this.onChangeEnd,
    this.label,
    this.formatValue,
    this.compact = false,
  });

  final double value;
  final ValueChanged<double>? onChanged;
  final double min;
  final double max;
  final int? divisions;
  final double? buffered;
  final ValueChanged<double>? onChangeStart;
  final ValueChanged<double>? onChangeEnd;
  final String? label;
  final String Function(double)? formatValue;
  final bool compact;

  @override
  Widget build(BuildContext context) => _SliderStyle(
    compact: compact,
    label: label,
    child: material.Slider(
      value: value,
      min: min,
      max: max,
      divisions: divisions,
      secondaryTrackValue: buffered,
      onChanged: onChanged,
      onChangeStart: onChangeStart,
      onChangeEnd: onChangeEnd,
      semanticFormatterCallback: formatValue,
    ),
  );
}

class RangeSlider extends StatelessWidget {
  const RangeSlider({
    super.key,
    required this.values,
    required this.onChanged,
    this.min = 0,
    this.max = 1,
    this.divisions,
    this.onChangeStart,
    this.onChangeEnd,
    this.label,
    this.formatValue,
    this.compact = false,
  });

  final material.RangeValues values;
  final ValueChanged<material.RangeValues>? onChanged;
  final double min;
  final double max;
  final int? divisions;
  final ValueChanged<material.RangeValues>? onChangeStart;
  final ValueChanged<material.RangeValues>? onChangeEnd;
  final String? label;
  final String Function(double)? formatValue;
  final bool compact;

  @override
  Widget build(BuildContext context) => _SliderStyle(
    compact: compact,
    label: label,
    child: material.RangeSlider(
      values: values,
      min: min,
      max: max,
      divisions: divisions,
      onChanged: onChanged,
      onChangeStart: onChangeStart,
      onChangeEnd: onChangeEnd,
      semanticFormatterCallback: formatValue,
    ),
  );
}

class _SliderStyle extends StatelessWidget {
  const _SliderStyle({
    required this.compact,
    required this.label,
    required this.child,
  });

  final bool compact;
  final String? label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final radius = compact ? 6.0 : 10.0;
    return Semantics(
      label: label,
      child: material.SliderTheme(
        data: material.SliderThemeData(
          padding: EdgeInsets.symmetric(horizontal: radius, vertical: 6),
          trackHeight: 4,
          activeTrackColor: colors.accent,
          inactiveTrackColor: colors.muted,
          disabledActiveTrackColor: colors.accent.withValues(alpha: .5),
          disabledInactiveTrackColor: colors.muted.withValues(alpha: .5),
          thumbColor: const Color(0xFFFFFFFF),
          disabledThumbColor: Color.alphaBlend(
            const Color(0x80FFFFFF),
            colors.background,
          ),
          overlappingShapeStrokeColor: colors.accent,
          overlayColor: colors.accent.withValues(alpha: .5),
          overlayShape: material.RoundSliderOverlayShape(
            overlayRadius: radius + 3,
          ),
          showValueIndicator: material.ShowValueIndicator.never,
          trackShape: const _Track(),
          rangeTrackShape: const _RangeTrack(),
          thumbShape: _Thumb(radius, colors),
          rangeThumbShape: _RangeThumb(radius, colors),
          tickMarkShape: material.SliderTickMarkShape.noTickMark,
          rangeTickMarkShape: const material.RoundRangeSliderTickMarkShape(
            tickMarkRadius: 0,
          ),
          minThumbSeparation: 0,
        ),
        child: material.Material(
          type: material.MaterialType.transparency,
          child: child,
        ),
      ),
    );
  }
}

/// The track the web draws: the full width of the control, its ends under
/// the thumbs at rest (`thumbAlignment="edge"`). The thumbs travel between
/// the control's padded edges, so the track runs a thumb radius past them.
void _paintTrack(
  Canvas canvas,
  Rect travel,
  double reach,
  material.SliderThemeData theme,
  Animation<double> enableAnimation, {
  required double start,
  required double end,
  (double, double)? buffered,
}) {
  final inactive = ColorTween(
    begin: theme.disabledInactiveTrackColor,
    end: theme.inactiveTrackColor,
  ).evaluate(enableAnimation)!;
  final active = ColorTween(
    begin: theme.disabledActiveTrackColor,
    end: theme.activeTrackColor,
  ).evaluate(enableAnimation)!;
  final track = RRect.fromRectAndRadius(
    Rect.fromLTRB(
      travel.left - reach,
      travel.top,
      travel.right + reach,
      travel.bottom,
    ),
    Radius.circular(travel.height / 2),
  );
  canvas
    ..save()
    ..clipRRect(track)
    ..drawRRect(track, Paint()..color = inactive);
  if (buffered case (final from, final to)) {
    canvas.drawRect(
      Rect.fromLTRB(from, track.top, to, track.bottom),
      Paint()..color = Color.lerp(inactive, active, .4)!,
    );
  }
  canvas
    ..drawRect(
      Rect.fromLTRB(start, track.top, end, track.bottom),
      Paint()..color = active,
    )
    ..restore();
}

class _Track extends material.SliderTrackShape
    with material.BaseSliderTrackShape {
  const _Track();

  @override
  Rect getPreferredRect({
    required RenderBox parentBox,
    Offset offset = Offset.zero,
    required material.SliderThemeData sliderTheme,
    bool isEnabled = false,
    bool isDiscrete = false,
  }) => Rect.fromLTWH(
    offset.dx,
    offset.dy + (parentBox.size.height - sliderTheme.trackHeight!) / 2,
    parentBox.size.width,
    sliderTheme.trackHeight!,
  );

  @override
  void paint(
    PaintingContext context,
    Offset offset, {
    required RenderBox parentBox,
    required material.SliderThemeData sliderTheme,
    required Animation<double> enableAnimation,
    required Offset thumbCenter,
    Offset? secondaryOffset,
    bool isEnabled = false,
    bool isDiscrete = false,
    required TextDirection textDirection,
  }) {
    final travel = getPreferredRect(
      parentBox: parentBox,
      offset: offset,
      sliderTheme: sliderTheme,
      isEnabled: isEnabled,
      isDiscrete: isDiscrete,
    );
    final reach =
        sliderTheme.thumbShape!.getPreferredSize(isEnabled, false).width / 2;
    final ltr = textDirection == TextDirection.ltr;
    _paintTrack(
      context.canvas,
      travel,
      reach,
      sliderTheme,
      enableAnimation,
      start: ltr ? travel.left - reach : thumbCenter.dx,
      end: ltr ? thumbCenter.dx : travel.right + reach,
      buffered: switch (secondaryOffset) {
        final offset? when ltr && offset.dx > thumbCenter.dx => (
          thumbCenter.dx,
          offset.dx,
        ),
        final offset? when !ltr && offset.dx < thumbCenter.dx => (
          offset.dx,
          thumbCenter.dx,
        ),
        _ => null,
      },
    );
  }
}

class _RangeTrack extends material.RangeSliderTrackShape
    with material.BaseRangeSliderTrackShape {
  const _RangeTrack();

  @override
  bool get isRounded => false;

  @override
  Rect getPreferredRect({
    required RenderBox parentBox,
    Offset offset = Offset.zero,
    required material.SliderThemeData sliderTheme,
    bool isEnabled = false,
    bool isDiscrete = false,
  }) => Rect.fromLTWH(
    offset.dx,
    offset.dy + (parentBox.size.height - sliderTheme.trackHeight!) / 2,
    parentBox.size.width,
    sliderTheme.trackHeight!,
  );

  @override
  void paint(
    PaintingContext context,
    Offset offset, {
    required RenderBox parentBox,
    required material.SliderThemeData sliderTheme,
    required Animation<double> enableAnimation,
    required Offset startThumbCenter,
    required Offset endThumbCenter,
    bool isEnabled = false,
    bool isDiscrete = false,
    required TextDirection textDirection,
  }) {
    final travel = getPreferredRect(
      parentBox: parentBox,
      offset: offset,
      sliderTheme: sliderTheme,
      isEnabled: isEnabled,
      isDiscrete: isDiscrete,
    );
    final reach =
        sliderTheme.rangeThumbShape!.getPreferredSize(isEnabled, false).width /
        2;
    _paintTrack(
      context.canvas,
      travel,
      reach,
      sliderTheme,
      enableAnimation,
      start: startThumbCenter.dx,
      end: endThumbCenter.dx,
    );
  }
}

void _paintThumb(
  Canvas canvas,
  Offset center,
  double radius,
  KitColors colors,
  double enabled,
) {
  final fill = Color.lerp(
    Color.alphaBlend(const Color(0x80FFFFFF), colors.background),
    const Color(0xFFFFFFFF),
    enabled,
  )!;
  canvas
    ..drawCircle(
      center,
      radius,
      Paint()..color = colors.accent.withValues(alpha: .5 + enabled * .5),
    )
    ..drawCircle(center, radius - 1, Paint()..color = fill);
}

class _Thumb extends material.SliderComponentShape {
  const _Thumb(this.radius, this.colors);

  final double radius;
  final KitColors colors;

  @override
  Size getPreferredSize(bool isEnabled, bool isDiscrete) =>
      Size.fromRadius(radius);

  @override
  void paint(
    PaintingContext context,
    Offset center, {
    required Animation<double> activationAnimation,
    required Animation<double> enableAnimation,
    required bool isDiscrete,
    required TextPainter labelPainter,
    required RenderBox parentBox,
    required material.SliderThemeData sliderTheme,
    required TextDirection textDirection,
    required double value,
    required double textScaleFactor,
    required Size sizeWithOverflow,
  }) => _paintThumb(
    context.canvas,
    center,
    radius,
    colors,
    enableAnimation.value,
  );
}

class _RangeThumb extends material.RangeSliderThumbShape {
  const _RangeThumb(this.radius, this.colors);

  final double radius;
  final KitColors colors;

  @override
  Size getPreferredSize(bool isEnabled, bool isDiscrete) =>
      Size.fromRadius(radius);

  @override
  void paint(
    PaintingContext context,
    Offset center, {
    required Animation<double> activationAnimation,
    required Animation<double> enableAnimation,
    bool isDiscrete = false,
    bool isEnabled = false,
    bool isOnTop = false,
    TextDirection textDirection = TextDirection.ltr,
    required material.SliderThemeData sliderTheme,
    material.Thumb thumb = material.Thumb.start,
    bool isPressed = false,
  }) => _paintThumb(
    context.canvas,
    center,
    radius,
    colors,
    enableAnimation.value,
  );
}
