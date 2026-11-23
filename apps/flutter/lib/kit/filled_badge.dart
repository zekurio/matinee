import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'icon.dart';
import 'tokens.dart';

/// A filled, rounded badge: a mark and a word in the colours the caller
/// picks, as the web's request state badges fill one. [ink] is what reads on
/// [fill]; [border] sits on its edge, the full colour of [fill] by default.
/// [glyph] stands in for [icon], for a mark that isn't a [Lucide] glyph as a
/// request's progress ring is, and [trailing] follows the word, as a
/// chevron does on a badge that opens what it says.
class FilledBadge extends StatelessWidget {
  const FilledBadge({
    super.key,
    required this.label,
    required this.fill,
    required this.ink,
    this.border,
    this.icon,
    this.glyph,
    this.trailing,
  });

  final String label;
  final Color fill;
  final Color ink;
  final Color? border;

  /// A [Lucide] icon before [label].
  final String? icon;

  /// A mark before [label] in place of [icon], already coloured.
  final Widget? glyph;
  final String? trailing;

  /// The badge's height at the text size [scaler] gives: 20 at 100%, and
  /// taller as the words grow, so they never clip.
  static double heightOf(TextScaler scaler) =>
      math.max(20, scaler.scale(KitText.xs.lineHeight) + 4);

  @override
  Widget build(BuildContext context) {
    final size = heightOf(MediaQuery.textScalerOf(context));
    final mark =
        glyph ??
        (icon == null ? null : KitIcon(icon!, size: size * .6, color: ink));
    return Container(
      height: size,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: KitRadius.pill,
        border: Border.all(color: border ?? fill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 4,
        children: [
          ?mark,
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                label,
                maxLines: 1,
                style: KitText.xs.style(color: ink, weight: FontWeight.w600),
              ),
            ),
          ),
          if (trailing case final trailing?)
            KitIcon(trailing, size: size * .6, color: ink),
        ],
      ),
    );
  }
}
