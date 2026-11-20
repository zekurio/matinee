import 'dart:ui' show ImageFilter;

import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

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
    final icon = SvgPicture.string(
      drawn,
      width: size,
      height: size,
      semanticsLabel: label,
      excludeFromSemantics: label == null,
      colorFilter: ColorFilter.mode(
        color ??
            DefaultTextStyle.of(context).style.color ??
            MatineeTheme.of(context).foreground,
        BlendMode.srcIn,
      ),
    );
    final shadows = this.shadows;
    if (shadows == null || shadows.isEmpty) return icon;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        for (final shadow in shadows)
          Transform.translate(
            offset: shadow.offset,
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(
                sigmaX: shadow.blurSigma,
                sigmaY: shadow.blurSigma,
              ),
              child: SvgPicture.string(
                drawn,
                width: size,
                height: size,
                excludeFromSemantics: true,
                colorFilter: ColorFilter.mode(shadow.color, BlendMode.srcIn),
              ),
            ),
          ),
        icon,
      ],
    );
  }
}
