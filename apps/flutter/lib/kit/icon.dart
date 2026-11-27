import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:vector_graphics_compiler/vector_graphics_compiler.dart' as vg;

import 'theme.dart';

export 'lucide.g.dart';

class KitIcon extends StatelessWidget {
  const KitIcon(
    this.svg, {
    super.key,
    this.size = 20,
    this.color,
    this.label,
    this.strokeWidth,
    this.shadows,
  });

  final String svg;
  final double size;
  final Color? color;
  final String? label;
  final double? strokeWidth;

  /// Drawn under the icon as text's shadows are, for an icon over a
  /// picture.
  final List<Shadow>? shadows;

  @override
  Widget build(BuildContext context) {
    final drawn = strokeWidth == null
        ? svg
        : svg.replaceFirst('stroke-width="2"', 'stroke-width="$strokeWidth"');
    final color =
        this.color ??
        DefaultTextStyle.of(context).style.color ??
        MatineeTheme.of(context).foreground;
    final glyph = IconGlyph.of(drawn);
    final Widget icon;
    if (glyph == null) {
      icon = SvgPicture.string(
        drawn,
        width: size,
        height: size,
        semanticsLabel: label,
        excludeFromSemantics: label == null,
        colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
      );
    } else {
      final opaque = color.withValues(alpha: 1);
      final painted = _Painted(glyph: glyph, size: size, color: opaque);
      // A translucent icon is drawn whole and then made see-through, as
      // the SVG's tint does, so where its strokes cross isn't darker.
      final seen = color.a == 1
          ? painted
          : Opacity(opacity: color.a, child: painted);
      icon = label == null
          ? seen
          : Semantics(container: true, image: true, label: label, child: seen);
    }
    final shadows = this.shadows;
    if (shadows == null || shadows.isEmpty) return icon;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        for (final shadow in shadows)
          Transform.translate(
            offset: shadow.offset,
            // The tint and the blur in one layer: the icon in the shadow's
            // color, then blurred.
            child: ImageFiltered(
              imageFilter: ui.ImageFilter.compose(
                outer: ui.ImageFilter.blur(
                  sigmaX: shadow.blurSigma,
                  sigmaY: shadow.blurSigma,
                ),
                inner: ColorFilter.mode(shadow.color, BlendMode.srcIn),
              ),
              child: glyph == null
                  ? SvgPicture.string(
                      drawn,
                      width: size,
                      height: size,
                      excludeFromSemantics: true,
                    )
                  : _Painted(
                      glyph: glyph,
                      size: size,
                      color: const Color(0xFF000000),
                    ),
            ),
          ),
        icon,
      ],
    );
  }
}

/// An icon's SVG as the paths it draws, to paint in any color without the
/// layer an SVG picture needs to take a tint. Each is parsed once, on its
/// first use, as the SVG library parses it.
@visibleForTesting
final class IconGlyph {
  IconGlyph._(this.width, this.height, this.strokes);

  final double width;
  final double height;
  final List<GlyphStroke> strokes;

  static final _parsed = <String, IconGlyph?>{};

  /// The glyph [svg] draws, or null for an SVG with more in it than
  /// filled and stroked paths, which then draws as a picture.
  static IconGlyph? of(String svg) => _parsed.putIfAbsent(svg, () {
    final vg.VectorInstructions instructions;
    try {
      instructions = vg.parseWithoutOptimizers(svg);
    } on Object {
      return null;
    }
    final strokes = <GlyphStroke>[];
    for (final command in instructions.commands) {
      if (command.type != vg.DrawCommandType.path) return null;
      final paintId = command.paintId;
      final pathId = command.objectId;
      if (paintId == null || pathId == null) return null;
      final paint = instructions.paints[paintId];
      if (paint.blendMode != vg.BlendMode.srcOver) return null;
      final path = _path(instructions.paths[pathId]);
      if (path == null) return null;
      final fill = paint.fill;
      if (fill != null) {
        if (fill.shader != null) return null;
        strokes.add(GlyphStroke(path, fill: true));
      }
      final stroke = paint.stroke;
      if (stroke != null) {
        if (stroke.shader != null) return null;
        strokes.add(
          GlyphStroke(
            path,
            fill: false,
            width: stroke.width,
            cap: switch (stroke.cap) {
              vg.StrokeCap.round => StrokeCap.round,
              vg.StrokeCap.square => StrokeCap.square,
              vg.StrokeCap.butt || null => StrokeCap.butt,
            },
            join: switch (stroke.join) {
              vg.StrokeJoin.round => StrokeJoin.round,
              vg.StrokeJoin.bevel => StrokeJoin.bevel,
              vg.StrokeJoin.miter || null => StrokeJoin.miter,
            },
            miterLimit: stroke.miterLimit,
          ),
        );
      }
    }
    return IconGlyph._(instructions.width, instructions.height, strokes);
  });

  static ui.Path? _path(vg.Path source) {
    final path = ui.Path()
      ..fillType = source.fillType == vg.PathFillType.evenOdd
          ? PathFillType.evenOdd
          : PathFillType.nonZero;
    for (final command in source.commands) {
      switch (command) {
        case vg.MoveToCommand(:final x, :final y):
          path.moveTo(x, y);
        case vg.LineToCommand(:final x, :final y):
          path.lineTo(x, y);
        case vg.CubicToCommand(
          :final x1,
          :final y1,
          :final x2,
          :final y2,
          :final x3,
          :final y3,
        ):
          path.cubicTo(x1, y1, x2, y2, x3, y3);
        case vg.CloseCommand():
          path.close();
        default:
          return null;
      }
    }
    return path;
  }

  /// Draws the glyph into [size] in [color], fitted as the SVG picture
  /// fits its view box, and clipped to it.
  void paint(Canvas canvas, Size size, Color color) {
    final scale = (size.width / width) < (size.height / height)
        ? size.width / width
        : size.height / height;
    canvas
      ..save()
      ..translate(
        (size.width - width * scale) / 2,
        (size.height - height * scale) / 2,
      )
      ..scale(scale)
      ..clipRect(Rect.fromLTWH(0, 0, width, height));
    for (final stroke in strokes) {
      final paint = Paint()..color = color;
      if (!stroke.fill) {
        paint
          ..style = PaintingStyle.stroke
          ..strokeCap = stroke.cap
          ..strokeJoin = stroke.join;
        if (stroke.miterLimit case final limit?) paint.strokeMiterLimit = limit;
        // SVG's default stroke is 1 wide, Flutter's a hairline.
        final width = stroke.width;
        if (width != null && width != 0) paint.strokeWidth = width;
      }
      canvas.drawPath(stroke.path, paint);
    }
    canvas.restore();
  }
}

/// One path an [IconGlyph] fills or strokes.
@visibleForTesting
final class GlyphStroke {
  const GlyphStroke(
    this.path, {
    required this.fill,
    this.width,
    this.cap = StrokeCap.butt,
    this.join = StrokeJoin.miter,
    this.miterLimit,
  });

  final ui.Path path;
  final bool fill;
  final double? width;
  final StrokeCap cap;
  final StrokeJoin join;
  final double? miterLimit;
}

class _Painted extends StatelessWidget {
  const _Painted({
    required this.glyph,
    required this.size,
    required this.color,
  });

  final IconGlyph glyph;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => CustomPaint(
    size: Size.square(size),
    painter: _GlyphPainter(glyph, color),
  );
}

class _GlyphPainter extends CustomPainter {
  const _GlyphPainter(this.glyph, this.color);

  final IconGlyph glyph;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) => glyph.paint(canvas, size, color);

  @override
  bool shouldRepaint(_GlyphPainter old) =>
      old.glyph != glyph || old.color != color;
}
