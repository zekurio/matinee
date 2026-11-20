import 'package:flutter/widgets.dart';

import 'icon.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';
import 'tone.dart';

/// The room media pages lay their cards out with, as the Kotlin app's.
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
/// hairline over the edge. [children] stack in it, filling it, over the
/// tone; the art goes first, its marks after.
class ArtFrame extends StatelessWidget {
  const ArtFrame({
    super.key,
    required this.toneKey,
    required this.aspectRatio,
    this.children = const [],
  });

  final String toneKey;
  final double aspectRatio;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
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

/// Name and detail under a card, one line each.
class CardText extends StatelessWidget {
  const CardText({
    super.key,
    required this.primary,
    this.secondary,
    this.untitled = false,
  });

  final String primary;
  final String? secondary;

  /// Nothing named it, so the name is a stand-in, in the regular weight.
  final bool untitled;

  /// How tall it is with both lines, at the text size [scaler] gives.
  static double height(TextScaler scaler) =>
      8 + _line(scaler, KitText.sm) + _line(scaler, KitText.px13) + 1;

  /// A line's height, rounded up to the whole pixel the text lays out in:
  /// at a text size like 130%, a 16 tall line is 20.8, and two of them
  /// would run past a box sized for exactly that.
  static double _line(TextScaler scaler, KitText text) =>
      (scaler.scale(text.size) * text.lineHeight / text.size).ceilToDouble();

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final detail = secondary;
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
          if (detail != null)
            Text(
              detail,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: KitText.px13.style(color: colors.mutedForeground),
            ),
        ],
      ),
    );
  }
}

/// What a press looks like over a card's art: the foreground washed over
/// it, as the Kotlin app's `PressIndication`.
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
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : const Duration(milliseconds: 150),
        child: ColoredBox(color: MatineeTheme.of(context).foreground),
      ),
    );
  }
}

/// A movie or show as its 2:3 poster, with its name and a detail under it.
/// Until [art] shows, and when there's none, the name sits on the title's
/// tone. A tap on the poster is [onPressed]; to a screen reader the poster
/// is one button, [name] and [detail].
class PosterCard extends StatelessWidget {
  const PosterCard({
    super.key,
    required this.name,
    this.detail,
    this.art,
    this.toneKey,
    this.watchedLabel,
    this.badge,
    this.onPressed,
    this.onLongPress,
    this.longPressLabel,
  });

  final String name;
  final String? detail;

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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        PressIndication(
          onPressed: onPressed,
          onLongPress: onLongPress,
          longPressLabel: longPressLabel,
          shape: CardMetrics.radius,
          label: [name, ?detail].join(', '),
          builder: (context, state) => ArtFrame(
            toneKey: toneKey ?? name,
            aspectRatio: CardMetrics.poster,
            children: [
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
              ?art,
              if (mark != null)
                PositionedDirectional(top: 6, end: 6, child: mark),
              _PressWash(state),
            ],
          ),
        ),
        ExcludeSemantics(
          child: CardText(primary: name, secondary: detail),
        ),
      ],
    );
  }
}

/// An episode or movie to start or resume, as a 16:9 still with its name
/// and a detail under it: Continue watching's and Next up's card. The bar
/// along the bottom is how far in the person is, the check that it's
/// watched. Play shows on the still while a mouse is over it or the card
/// has focus, as on the web's desktop; a phone's cards stay clean.
class WideCard extends StatelessWidget {
  const WideCard({
    super.key,
    required this.name,
    this.detail,
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        PressIndication(
          onPressed: onPressed,
          onLongPress: onLongPress,
          longPressLabel: longPressLabel,
          shape: CardMetrics.radius,
          label: [name, ?detail].join(', '),
          builder: (context, state) => ArtFrame(
            toneKey: toneKey ?? name,
            aspectRatio: CardMetrics.wide,
            children: [
              Center(
                child: KitIcon(
                  Lucide.film,
                  color: colors.mutedForeground.withValues(alpha: .4),
                ),
              ),
              ?art,
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
                  (state == PressState.hovered || state == PressState.focused))
                Center(
                  child: PlayGlyph(onPressed: play, label: playLabel!),
                ),
            ],
          ),
        ),
        ExcludeSemantics(
          child: CardText(primary: name, secondary: detail, untitled: untitled),
        ),
      ],
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
/// under it.
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
      label: [name, ?role].join(', '),
      builder: (context, state) => ExcludeSemantics(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AspectRatio(
              aspectRatio: 1,
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
