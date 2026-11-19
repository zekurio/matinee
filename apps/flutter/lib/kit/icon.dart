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
  });

  final String svg;
  final double size;
  final Color? color;
  final String? label;
  final double? strokeWidth;

  @override
  Widget build(BuildContext context) => SvgPicture.string(
    strokeWidth == null
        ? svg
        : svg.replaceFirst('stroke-width="2"', 'stroke-width="$strokeWidth"'),
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
}
