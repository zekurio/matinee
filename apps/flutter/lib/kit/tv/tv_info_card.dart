import 'package:flutter/widgets.dart';

import '../icon.dart';
import '../theme.dart';
import '../tokens.dart';
import '../tone.dart';
import 'tv_focus.dart';
import 'tv_metrics.dart';

/// Sizes of a [TvInfoCard] and what's on it.
abstract final class TvInfoCards {
  /// Its height, wherever it sits: the poster and four short lines.
  static const height = 180.0;

  /// Its width in a row; a grid stretches it to its cell.
  static const rowWidth = 360.0;

  /// Its poster's width, 2:3.
  static const posterWidth = 92.0;

  /// How much it grows with focus, less than a poster, since it's wide
  /// and its neighbours sit close.
  static const focusScale = 1.04;
}

/// A wide card on a TV: a poster on the left and lines about it on the
/// right, over [backdrop], darkened so the lines read on any picture.
/// The whole card is one focus target with the picture look, and Select
/// runs [onPressed]. [width] null fills its cell.
class TvInfoCard extends StatelessWidget {
  const TvInfoCard({
    super.key,
    required this.toneKey,
    required this.poster,
    required this.children,
    required this.onPressed,
    this.backdrop,
    this.width = TvInfoCards.rowWidth,
    this.focusNode,
    this.label,
    this.onFocused,
  });

  final String toneKey;

  /// The poster, over [toneKey]'s tone until it loads.
  final Widget? poster;

  /// Behind the whole card, as the same poster drawn soft.
  final Widget? backdrop;
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
    final backdrop = this.backdrop;
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
          child: Tone(
            toneKey: toneKey,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (backdrop != null) ExcludeSemantics(child: backdrop),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: AlignmentDirectional.centerStart,
                      end: AlignmentDirectional.centerEnd,
                      colors: [
                        colors.background.withValues(alpha: .62),
                        colors.background.withValues(alpha: .82),
                      ],
                    ),
                  ),
                ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: TvCards.radius,
                    border: Border.all(
                      color: colors.foreground.withValues(alpha: .1),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 14,
                    children: [
                      ExcludeSemantics(
                        child: ClipRRect(
                          borderRadius: const BorderRadius.all(
                            Radius.circular(6),
                          ),
                          child: SizedBox(
                            width: TvInfoCards.posterWidth,
                            height: TvInfoCards.posterWidth * 1.5,
                            child: Tone(toneKey: toneKey, child: poster),
                          ),
                        ),
                      ),
                      Expanded(
                        child: ExcludeSemantics(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: children,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
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
