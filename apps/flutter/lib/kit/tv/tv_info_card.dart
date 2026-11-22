import 'package:flutter/widgets.dart';

import '../icon.dart';
import '../theme.dart';
import '../tokens.dart';
import '../tone.dart';
import 'tv_focus.dart';
import 'tv_metrics.dart';

/// Sizes of a [TvInfoCard] and what's on it.
abstract final class TvInfoCards {
  /// How many lines a card's problem may take, filled or not, so every
  /// card keeps its height whether something went wrong or not.
  static const problemLines = 3;

  /// Its poster's height, which the lines beside it fill, the problem's
  /// three included.
  static const posterHeight = 178.0;

  /// Its poster's width, 2:3.
  static const posterWidth = posterHeight / 1.5;

  /// The room around the poster and the lines.
  static const padding = 14.0;

  /// The room between one line beside the poster and the next.
  static const gap = 6.0;

  /// The row where an admin's card says who asked; empty on an asker's
  /// own, so every card puts its badge in the same place.
  static const whoHeight = 22.0;

  /// Its height, wherever it sits: the poster's, and the room around it.
  static const height = posterHeight + 2 * padding;

  /// Its width in a row; a grid stretches it to its cell.
  static const rowWidth = 360.0;

  /// How much it grows with focus, less than a poster, since it's wide
  /// and its neighbours sit close.
  static const focusScale = 1.04;
}

/// A wide card on a TV: a poster on the left and lines about it on the
/// right, from the top with an even gap, on the theme's plain card surface
/// and border so the words stay as easy to read as the theme makes them.
/// The whole card is one focus target with the picture look, and Select
/// runs [onPressed]. [width] null fills its cell.
class TvInfoCard extends StatelessWidget {
  const TvInfoCard({
    super.key,
    required this.toneKey,
    required this.poster,
    required this.children,
    required this.onPressed,
    this.width = TvInfoCards.rowWidth,
    this.focusNode,
    this.label,
    this.onFocused,
  });

  final String toneKey;

  /// The poster, over [toneKey]'s tone until it loads.
  final Widget? poster;
  final List<Widget> children;
  final VoidCallback onPressed;
  final double? width;
  final FocusNode? focusNode;

  /// What a screen reader says.
  final String? label;
  final VoidCallback? onFocused;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final poster = this.poster;
    return SizedBox(
      width: width,
      height: TvInfoCards.height,
      child: TvFocusable(
        focusNode: focusNode,
        onPressed: onPressed,
        label: label,
        onFocusChange: (focused) {
          if (focused) onFocused?.call();
        },
        builder: (context, focused) => TvPictureFocus(
          focused: focused,
          scale: TvInfoCards.focusScale,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: TvCards.radius,
              border: Border.all(color: colors.border),
            ),
            child: Padding(
              padding: const EdgeInsets.all(TvInfoCards.padding),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: TvInfoCards.padding,
                children: [
                  ExcludeSemantics(
                    child: ClipRRect(
                      borderRadius: const BorderRadius.all(Radius.circular(6)),
                      child: SizedBox(
                        width: TvInfoCards.posterWidth,
                        height: TvInfoCards.posterHeight,
                        child: Tone(toneKey: toneKey, child: poster),
                      ),
                    ),
                  ),
                  Expanded(
                    child: ExcludeSemantics(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: TvInfoCards.gap,
                        children: children,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A pill that says where something stands at a glance from the sofa: a
/// [glyph] or an [icon] in [mark], and [text] in [ink], on [fill] inside
/// [edge], either of which may be none.
class TvBadge extends StatelessWidget {
  const TvBadge({
    super.key,
    required this.text,
    required this.mark,
    required this.ink,
    this.icon,
    this.glyph,
    this.fill,
    this.edge,
  });

  final String text;
  final String? icon;

  /// In place of [icon], as a ring of how much is in.
  final Widget? glyph;
  final Color mark;
  final Color ink;
  final Color? fill;
  final Color? edge;

  /// Its height, and its mark's size.
  static const height = 30.0;
  static const iconSize = 16.0;

  @override
  Widget build(BuildContext context) {
    final icon = this.icon;
    final edge = this.edge;
    return Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 11),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: KitRadius.pill,
        border: edge == null ? null : Border.all(color: edge, width: 1.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 7,
        children: [
          ?glyph,
          if (glyph == null && icon != null)
            KitIcon(icon, size: iconSize, color: mark),
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TvType.caption
                  .style(color: ink)
                  .copyWith(
                    fontWeight: FontWeight.w600,
                    fontVariations: const [FontVariation('wght', 600)],
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
