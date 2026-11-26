import 'package:flutter/widgets.dart';

import 'icon.dart';
import 'motion.dart';
import 'press_indication.dart';
import 'staggered.dart';
import 'theme.dart';
import 'tokens.dart';
import 'tone.dart';

/// The room media pages lay their cards out with.
abstract final class CardMetrics {
  /// The page's side margin on a phone, which rails and grids start at.
  static const gutter = 16.0;

  /// Between the cards of a rail.
  static const gap = 12.0;

  /// Posters, stills, and the cards that hold them.
  static const radius = BorderRadius.all(Radius.circular(KitRadius.sm));

  static const poster = 2 / 3;
  static const wide = 16 / 9;

  /// How tall a card [width] wide is with its art at [aspect] and
  /// [CardText]'s two lines under it, at the text size [scaler] gives.
  static double height(double width, double aspect, TextScaler scaler) =>
      width / aspect + CardText.height(scaler);
}

/// The 2:3 or 16:9 frame art sits in: on its title's tone, rounded, with a
/// hairline over the edge, or a [dashed] one for something that isn't
/// here. [children] stack in it, filling it, over the tone; the art goes
/// first, its marks after.
class ArtFrame extends StatelessWidget {
  const ArtFrame({
    super.key,
    required this.toneKey,
    required this.aspectRatio,
    this.dashed = false,
    this.children = const [],
  });

  final String toneKey;
  final double aspectRatio;
  final bool dashed;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final clipped = ClipRRect(
      borderRadius: CardMetrics.radius,
      child: Tone(
        toneKey: toneKey,
        child: Stack(
          fit: StackFit.expand,
          alignment: Alignment.center,
          children: children,
        ),
      ),
    );
    if (dashed) {
      return AspectRatio(
        aspectRatio: aspectRatio,
        child: CustomPaint(
          foregroundPainter: DashedOutline(
            colors.foreground.withValues(alpha: .45),
          ),
          child: clipped,
        ),
      );
    }
    return AspectRatio(
      aspectRatio: aspectRatio,
      child: DecoratedBox(
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(
          border: Border.all(color: colors.border),
          borderRadius: CardMetrics.radius,
        ),
        child: ClipRRect(
          borderRadius: CardMetrics.radius,
          child: Tone(
            toneKey: toneKey,
            child: Stack(
              fit: StackFit.expand,
              alignment: Alignment.center,
              children: children,
            ),
          ),
        ),
      ),
    );
  }
}

/// A card's rounded edge drawn dashed, for the place of something that
/// isn't here: the rest of a season, a season the server lacks.
class DashedOutline extends CustomPainter {
  const DashedOutline(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final outline = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          (Offset.zero & size).deflate(.5),
          const Radius.circular(KitRadius.sm),
        ),
      );
    for (final metric in outline.computeMetrics()) {
      for (var at = 0.0; at < metric.length; at += 10) {
        canvas.drawPath(metric.extractPath(at, at + 6), paint);
      }
    }
  }

  @override
  bool shouldRepaint(DashedOutline old) => old.color != color;
}

/// The round check on something watched, in the accent.
class WatchedBadge extends StatelessWidget {
  const WatchedBadge({super.key, required this.label, this.size = 20});

  final String label;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: colors.accent, shape: BoxShape.circle),
      child: KitIcon(
        Lucide.check,
        size: size * .6,
        color: colors.accentForeground,
        label: label,
      ),
    );
  }
}

/// How far into a file the person is, over its picture, as the web's cards
/// draw it: clear of the edges by [inset], the accent on a dark track.
class WatchProgressBar extends StatelessWidget {
  const WatchProgressBar({super.key, required this.progress, this.inset = 8});

  /// 0 to 1.
  final double progress;
  final double inset;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(inset, 0, inset, inset),
    child: ClipRRect(
      borderRadius: KitRadius.pill,
      child: SizedBox(
        height: 4,
        width: double.infinity,
        child: ColoredBox(
          color: const Color(0x73000000),
          child: FractionallySizedBox(
            alignment: AlignmentDirectional.centerStart,
            widthFactor: progress.clamp(0, 1),
            child: ColoredBox(color: MatineeTheme.of(context).accent),
          ),
        ),
      ),
    ),
  );
}

/// A card's second line: [text], after [icon] when there is one, and what
/// a screen reader says for it, [label], when the icon carries meaning the
/// words alone don't, as the score's star does.
@immutable
final class CardDetail {
  const CardDetail(this.text, {this.icon, this.label});

  final String text;

  /// A [Lucide] icon, drawn before [text].
  final String? icon;
  final String? label;
}

/// Name and detail under a card, one line each.
class CardText extends StatelessWidget {
  const CardText({
    super.key,
    required this.primary,
    this.secondary,
    this.secondaryIcon,
    this.score,
    this.untitled = false,
  });

  final String primary;
  final String? secondary;

  /// A [Lucide] icon before [secondary], as the score's star.
  final String? secondaryIcon;

  /// A score after [secondary], by a star in the warning color, as an
  /// episode's. It stays whole while [secondary] gives way.
  final String? score;

  /// Nothing named it, so the name is a stand-in, in the regular weight.
  final bool untitled;

  /// How tall it is with both lines, at the text size [scaler] gives.
  static double height(TextScaler scaler) =>
      8 + _line(scaler, KitText.sm) + _line(scaler, KitText.px13) + 1;

  /// A box as tall as it is with both lines, to hold its place.
  static Widget placeholder(BuildContext context) =>
      SizedBox(height: height(MediaQuery.textScalerOf(context)));

  /// A line's height, rounded up to the whole pixel the text lays out in:
  /// at a text size like 130%, a 16 tall line is 20.8, and two of them
  /// would run past a box sized for exactly that.
  static double _line(TextScaler scaler, KitText text) =>
      (scaler.scale(text.size) * text.lineHeight / text.size).ceilToDouble();

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final detail = secondary;
    final score = this.score;
    final style = KitText.px13.style(color: colors.mutedForeground);
    final words = detail == null
        ? null
        : Text.rich(
            TextSpan(
              children: [
                if (secondaryIcon case final icon?)
                  WidgetSpan(
                    alignment: PlaceholderAlignment.middle,
                    child: Padding(
                      padding: const EdgeInsetsDirectional.only(end: 4),
                      child: KitIcon(
                        icon,
                        size: 12,
                        color: colors.mutedForeground,
                      ),
                    ),
                  ),
                TextSpan(text: detail),
              ],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: style,
          );
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            primary,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: KitText.sm.style(
              color: colors.foreground,
              weight: untitled ? FontWeight.w400 : FontWeight.w500,
            ),
          ),
          if (score == null)
            ?words
          else
            Row(
              spacing: 8,
              children: [
                if (words != null) Flexible(child: words),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  spacing: 4,
                  children: [
                    KitIcon(Lucide.star, size: 12, color: colors.warning),
                    Text(score, maxLines: 1, style: style),
                  ],
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// What a press looks like over a card's art: the foreground washed over it.
class _PressWash extends StatelessWidget {
  const _PressWash(this.state);

  final PressState state;

  @override
  Widget build(BuildContext context) {
    final opacity = switch (state) {
      PressState.pressed => .1,
      PressState.hovered => .06,
      _ => 0.0,
    };
    return IgnorePointer(
      child: AnimatedOpacity(
        opacity: opacity,
        duration: KitMotion.of(context, KitMotion.color),
        child: ColoredBox(color: MatineeTheme.of(context).foreground),
      ),
    );
  }
}

/// A movie or show as its 2:3 poster, with its name and a detail under it.
/// Until [art] shows, and when there's none, the name sits on the title's
/// tone. The card is one target, poster and words: a tap anywhere on it is
/// [onPressed] and a long press [onLongPress], while the press's wash and
/// focus ring stay on the poster. To a screen reader it's one button,
/// [name] and [detail].
class PosterCard extends StatelessWidget {
  const PosterCard({
    super.key,
    required this.name,
    this.detail,
    this.detailIcon,
    this.detailLabel,
    this.art,
    this.toneKey,
    this.watchedLabel,
    this.badge,
    this.onPressed,
    this.onLongPress,
    this.longPressLabel,
    this.absentLabel,
    this.artCovers = false,
  });

  final String name;
  final String? detail;

  /// [art] always covers the tone, as art with a blurred stand-in does
  /// while it loads and when it fails, so the name isn't laid out under it:
  /// a card that scrolls in costs a third less text.
  final bool artCovers;

  /// Set for something the server doesn't have, as a season under "More
  /// seasons": what a screen reader says for it, "Not here yet". The art
  /// dims inside a dashed frame, so it doesn't pass for the library's.
  final String? absentLabel;

  /// A [Lucide] icon before [detail], and what a screen reader says for
  /// the two in place of [detail], as [CardDetail] has them.
  final String? detailIcon;
  final String? detailLabel;

  /// The picture, over the tone: a widget that draws nothing until it
  /// loads, so the name shows through.
  final Widget? art;

  /// What picks the tone; [name] when null.
  final String? toneKey;

  /// Set when it's watched: the check's words for a screen reader.
  final String? watchedLabel;

  /// A mark at the top end in place of the check, as a request's state.
  final Widget? badge;
  final VoidCallback? onPressed;

  /// Opens the card's menu; [longPressLabel] says so to a screen reader.
  final VoidCallback? onLongPress;
  final String? longPressLabel;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final art = this.art;
    final watched = watchedLabel;
    final mark =
        badge ?? (watched == null ? null : WatchedBadge(label: watched));
    return PressIndication(
      onPressed: onPressed,
      onLongPress: onLongPress,
      longPressLabel: longPressLabel,
      shape: CardMetrics.radius,
      showFocusRing: false,
      label: [name, ?absentLabel, ?(detailLabel ?? detail)].join(', '),
      builder: (context, state) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          FocusOutline(
            shape: CardMetrics.radius,
            child: ArtFrame(
              toneKey: toneKey ?? name,
              aspectRatio: CardMetrics.poster,
              dashed: absentLabel != null,
              children: [
                // Dimmed art would let the name show through it, so an
                // absent card with art leaves the name to the line under it.
                if (art == null || (!artCovers && absentLabel == null))
                  ExcludeSemantics(
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          name,
                          textAlign: TextAlign.center,
                          maxLines: 4,
                          overflow: TextOverflow.ellipsis,
                          style: KitText.sm.style(
                            color: colors.foreground.withValues(alpha: .7),
                            weight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ),
                if (art != null)
                  StaggeredPart(
                    child: absentLabel == null
                        ? art
                        : Opacity(opacity: .35, child: art),
                  ),
                if (mark != null)
                  PositionedDirectional(top: 6, end: 6, child: mark),
                _PressWash(state),
              ],
            ),
          ),
          ExcludeSemantics(
            child: StaggeredPart(
              placeholder: CardText.placeholder(context),
              child: CardText(
                primary: name,
                secondary: detail,
                secondaryIcon: detailIcon,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// An episode or movie to start or resume, as a 16:9 still with its name
/// and a detail under it: Continue watching's and Next up's card. The bar
/// along the bottom is how far in the person is, the check that it's
/// watched. Play shows on the still while a mouse is over it or the card
/// has focus, as on the web's desktop; a phone's cards stay clean. Like
/// [PosterCard], the still and its words press as one.
class WideCard extends StatelessWidget {
  const WideCard({
    super.key,
    required this.name,
    this.detail,
    this.score,
    this.scoreLabel,
    this.toneKey,
    this.untitled = false,
    this.art,
    this.progress,
    this.watchedLabel,
    this.onPressed,
    this.onPlay,
    this.playLabel,
    this.onLongPress,
    this.longPressLabel,
  }) : assert(onPlay == null || playLabel != null);

  final String name;
  final String? detail;

  /// A score after [detail], by its star, as on an episode's card, and
  /// what a screen reader says for the two, as "Score 7.8".
  final String? score;
  final String? scoreLabel;
  final String? toneKey;
  final bool untitled;
  final Widget? art;

  /// 0 to 1, shown when above 0 and not [watchedLabel].
  final double? progress;
  final String? watchedLabel;
  final VoidCallback? onPressed;
  final VoidCallback? onPlay;
  final String? playLabel;
  final VoidCallback? onLongPress;
  final String? longPressLabel;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final art = this.art;
    final progress = this.progress;
    final watched = watchedLabel;
    final play = onPlay;
    return PressIndication(
      onPressed: onPressed,
      onLongPress: onLongPress,
      longPressLabel: longPressLabel,
      shape: CardMetrics.radius,
      showFocusRing: false,
      label: [name, ?detail, ?scoreLabel].join(', '),
      builder: (context, state) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          FocusOutline(
            shape: CardMetrics.radius,
            child: ArtFrame(
              toneKey: toneKey ?? name,
              aspectRatio: CardMetrics.wide,
              children: [
                Center(
                  child: KitIcon(
                    Lucide.film,
                    color: colors.mutedForeground.withValues(alpha: .4),
                  ),
                ),
                if (art != null) StaggeredPart(child: art),
                if (watched != null)
                  PositionedDirectional(
                    top: 6,
                    end: 6,
                    child: WatchedBadge(label: watched),
                  )
                else if (progress != null && progress > 0)
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: WatchProgressBar(progress: progress),
                  ),
                _PressWash(state),
                if (play != null &&
                    (state == PressState.hovered ||
                        state == PressState.focused))
                  Center(
                    child: PlayGlyph(onPressed: play, label: playLabel!),
                  ),
              ],
            ),
          ),
          ExcludeSemantics(
            child: StaggeredPart(
              placeholder: CardText.placeholder(context),
              child: CardText(
                primary: name,
                secondary: detail,
                score: score,
                untitled: untitled,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Play in the middle of a still: a dark round button.
class PlayGlyph extends StatelessWidget {
  const PlayGlyph({
    super.key,
    required this.onPressed,
    required this.label,
    this.size = 56,
  });

  final VoidCallback onPressed;
  final String label;
  final double size;

  @override
  Widget build(BuildContext context) => PressIndication(
    onPressed: onPressed,
    label: label,
    shape: KitRadius.pill,
    builder: (context, state) => Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Color.fromRGBO(0, 0, 0, state == PressState.pressed ? .5 : .35),
        shape: BoxShape.circle,
      ),
      child: KitIcon(
        Lucide.play,
        size: size * .38,
        color: const Color(0xFFFFFFFF),
      ),
    ),
  );
}

/// Someone in the cast: their round photo, or their initials on a neutral
/// circle until it loads and when there's none, with their name and role
/// under it, pressing as one, the focus ring round the photo.
class PersonCard extends StatelessWidget {
  const PersonCard({
    super.key,
    required this.name,
    this.role,
    this.photo,
    this.onPressed,
  });

  final String name;
  final String? role;

  /// The photo, over the initials: a widget that draws nothing until it
  /// loads.
  final Widget? photo;
  final VoidCallback? onPressed;

  /// How tall it is [width] wide, with two lines of name and two of role.
  static double height(double width, TextScaler scaler) =>
      width +
      8 +
      2 * CardText._line(scaler, KitText.sm) +
      2 * CardText._line(scaler, KitText.xs);

  /// "MO" for Masi Oka, "Z" for zekurio.
  static String initials(String name) {
    final words = name
        .split(RegExp(r'[ \-_.]'))
        .where((word) => word.trim().isNotEmpty)
        .toList();
    if (words.isEmpty) return '?';
    final first = words.first.characters.first;
    if (words.length == 1) return first.toUpperCase();
    return '$first${words.last.characters.first}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final photo = this.photo;
    final role = this.role;
    return PressIndication(
      onPressed: onPressed,
      shape: CardMetrics.radius,
      showFocusRing: false,
      label: [name, ?role].join(', '),
      builder: (context, state) => ExcludeSemantics(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AspectRatio(
              aspectRatio: 1,
              child: FocusOutline(
                shape: KitRadius.pill,
                child: ClipOval(
                  child: ColoredBox(
                    color: colors.secondary,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Center(
                          child: Text(
                            initials(name),
                            style: KitText.xxl.style(
                              color: colors.mutedForeground,
                              weight: FontWeight.w500,
                            ),
                          ),
                        ),
                        ?photo,
                        _PressWash(state),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              name,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: KitText.sm.style(
                color: colors.foreground,
                weight: FontWeight.w500,
              ),
            ),
            if (role != null)
              Text(
                role,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: KitText.xs.style(color: colors.mutedForeground),
              ),
          ],
        ),
      ),
    );
  }
}

/// A short fact in a box: a content rating, outlined, or a file's
/// resolution or sound, filled.
class Badge extends StatelessWidget {
  const Badge(this.text, {super.key, this.outlined = false});

  final String text;
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    const shape = BorderRadius.all(Radius.circular(4));
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: shape,
        color: outlined ? null : colors.foreground.withValues(alpha: .12),
        border: outlined
            ? Border.all(color: colors.foreground.withValues(alpha: .3))
            : null,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        child: Text(
          text,
          maxLines: 1,
          style: KitText.xs.style(
            color: colors.foreground.withValues(alpha: .85),
            weight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
