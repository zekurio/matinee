import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'logo.g.dart';
import 'theme.dart';

/// The sunset mark with the wordmark beside it, from brand/. [height] is
/// the word's, which the mark matches; the round letters dip a little
/// below it. The colors are the brand's own, for a light or a dark page,
/// and never the accent.
class Logo extends StatelessWidget {
  const Logo({super.key, this.height = 24, this.label});

  final double height;

  /// What a screen reader says, usually the app's name.
  final String? label;

  @override
  Widget build(BuildContext context) {
    final dark = MatineeTheme.of(context).isDark;
    return SvgPicture.string(
      dark ? LogoArt.dark : LogoArt.light,
      width: height * LogoArt.aspect,
      height: height * (1 + LogoArt.depth),
      semanticsLabel: label,
      excludeFromSemantics: label == null,
    );
  }
}
