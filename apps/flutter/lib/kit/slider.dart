import 'package:flutter/material.dart' as material;
import 'package:flutter/widgets.dart';

import 'theme.dart';
import 'tokens.dart';

export 'package:flutter/material.dart' show RangeValues;

class RangeSlider extends StatelessWidget {
  const RangeSlider({
    super.key,
    required this.values,
    required this.onChanged,
    this.min = 0,
    this.max = 1,
    this.divisions,
    this.onChangeEnd,
    this.label,
    this.formatValue,
  });

  final material.RangeValues values;
  final ValueChanged<material.RangeValues>? onChanged;
  final double min;
  final double max;
  final int? divisions;
  final ValueChanged<material.RangeValues>? onChangeEnd;
  final String? label;
  final String Function(double)? formatValue;

  @override
  Widget build(BuildContext context) => _SliderStyle(
    label: label,
    child: material.RangeSlider(
      values: values,
      min: min,
      max: max,
      divisions: divisions,
      onChanged: onChanged,
      onChangeEnd: onChangeEnd,
      semanticFormatterCallback: formatValue,
    ),
  );
}

class _SliderStyle extends StatelessWidget {
  const _SliderStyle({required this.label, required this.child});

  final String? label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    const radius = 10.0;
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
          rangeTrackShape: const _RangeTrack(),
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
  canvas
    ..drawRect(
      Rect.fromLTRB(start, track.top, end, track.bottom),
      Paint()..color = active,
    )
    ..restore();
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
