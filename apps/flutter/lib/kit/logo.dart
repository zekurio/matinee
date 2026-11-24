import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'logo.g.dart';
import 'theme.dart';

/// The sunset mark with the wordmark beside it, from brand/. [height] is
/// the word's, which the mark matches; the round letters dip a little
/// below it. The mark keeps the brand's sunset and is never the accent;
/// the word is in the theme's text color, as the headings beside it are,
/// so Material You tints it too.
class Logo extends StatelessWidget {
  const Logo({super.key, this.height = 24, this.label});

  final double height;

  /// What a screen reader says, usually the app's name.
  final String? label;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final art = colors.isDark ? LogoArt.dark : LogoArt.light;
    final ink = colors.isDark ? LogoArt.darkInk : LogoArt.lightInk;
    final rgb = (colors.foreground.toARGB32() & 0xFFFFFF)
        .toRadixString(16)
        .padLeft(6, '0');
    return SvgPicture.string(
      art.replaceFirst('fill="$ink"', 'fill="#$rgb"'),
      width: height * LogoArt.aspect,
      height: height * (1 + LogoArt.depth),
      semanticsLabel: label,
      excludeFromSemantics: label == null,
    );
  }
}

/// The sunset mark alone, [size] square: the logo's art seen through the mark's
/// 24-unit icon box, which the art places with the first path's `translate(x y)
/// scale(s)`.
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 24});

  final double size;

  static String _crop(String art) {
    final place = RegExp(
      r'translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)',
    ).firstMatch(art);
    if (place == null) return art;
    final [x, y, scale] = [
      for (final i in [1, 2, 3]) double.parse(place.group(i)!),
    ];
    final side = 24 * scale;
    return art.replaceFirst(
      RegExp(r'viewBox="[^"]*"'),
      'viewBox="$x $y $side $side"',
    );
  }

  static final _dark = _crop(LogoArt.dark);
  static final _light = _crop(LogoArt.light);

  @override
  Widget build(BuildContext context) {
    final dark = MatineeTheme.of(context).isDark;
    return ClipRect(
      child: SvgPicture.string(
        dark ? _dark : _light,
        width: size,
        height: size,
        excludeFromSemantics: true,
      ),
    );
  }
}
