import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import '../kit/kit.dart';

const _clear = Color(0x00000000);

/// A soft shadow under the middle buttons and their numbers, so they read
/// over a bright picture, as the Kotlin TV overlay's text does.
const _onPicture = [
  Shadow(color: Color(0x99000000), offset: Offset(0, 2), blurRadius: 10),
];

/// The picture dimmed a little behind the controls while they show, so
/// the middle buttons read where the top and bottom shades don't reach.
/// It sits under the subtitles, which the controls already lift clear.
class PlayerDim extends StatelessWidget {
  const PlayerDim({super.key});

  static const color = Color(0x59000000);

  @override
  Widget build(BuildContext context) =>
      const IgnorePointer(child: ColoredBox(color: color));
}

/// The controls over the video, laid out as the Kotlin phone player's
/// `Controls`, which a tablet shares at the same sizes: the title and the
/// menu buttons up top, play in the middle between the skips and, for an
/// episode, the previous and next episodes outside them, and at the bottom
/// [seekBar] the full width, with nothing beside it or under it. The top
/// and bottom are shaded so they read over bright video, and the middle
/// buttons carry a shadow; [PlayerDim], under the subtitles, dims the rest
/// of the picture while they show.
class PlayerControls extends StatelessWidget {
  const PlayerControls({
    super.key,
    required this.title,
    required this.subtitle,
    required this.backLabel,
    required this.onBack,
    required this.menus,
    required this.transport,
    required this.seekBar,
    this.moreLabel = 'More',
  });

  final String title;

  /// The episode code and show, under the title; null for a movie.
  final String? subtitle;
  final String backLabel;
  final VoidCallback onBack;

  /// The buttons at the end of the top bar. Those that don't fit beside
  /// the back button and some of the title go in a menu behind the last
  /// place, which [moreLabel] names.
  final List<PlayerMenuButton> menus;
  final String moreLabel;
  final Widget transport;
  final Widget seekBar;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Stack(
      fit: StackFit.expand,
      children: [
        const Align(alignment: Alignment.topCenter, child: _Scrim(top: true)),
        const Align(
          alignment: Alignment.bottomCenter,
          child: _Scrim(top: false),
        ),
        Align(
          alignment: Alignment.topCenter,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  PlayerBackButton(label: backLabel, onPressed: onBack),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: KitText.xl
                              .style(
                                color: colors.foreground,
                                weight: FontWeight.w600,
                              )
                              .copyWith(letterSpacing: -.5),
                        ),
                        if (subtitle case final line?)
                          Text(
                            line,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: KitText.sm.style(
                              color: colors.foreground.withValues(alpha: .75),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  _Menus(menus: menus, moreLabel: moreLabel),
                ],
              ),
            ),
          ),
        ),
        Center(child: transport),
        Align(
          alignment: Alignment.bottomCenter,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              child: seekBar,
            ),
          ),
        ),
      ],
    );
  }
}

/// The top bar's buttons, as many as leave the title [_titleRoom], and the
/// rest behind a last button that opens them as a menu.
class _Menus extends StatelessWidget {
  const _Menus({required this.menus, required this.moreLabel});

  final List<PlayerMenuButton> menus;
  final String moreLabel;

  static const _button = 52.0;

  /// The least of the title that stays beside the buttons.
  static const _titleRoom = 64.0;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final padding = MediaQuery.paddingOf(context);
    // The bar's padding, the back button, and the gaps either side of the title.
    final room = width - padding.horizontal - 24 - _button - 16 - _titleRoom;
    final fits = math.max(1, (room / _button).floor());
    if (menus.length <= fits) {
      return Row(mainAxisSize: MainAxisSize.min, children: menus);
    }
    final shown = menus.take(fits - 1).toList();
    final rest = menus.skip(fits - 1).toList();
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ...shown,
        Menu(
          trigger: (context, toggle, open, focus) => PlayerMenuButton(
            icon: Lucide.ellipsis,
            label: moreLabel,
            onPressed: toggle,
          ),
          children: [
            for (final menu in rest)
              MenuItem(
                label: menu.state == null
                    ? menu.label
                    : '${menu.label}: ${menu.state}',
                icon: menu.icon,
                onPressed: menu.onPressed,
              ),
          ],
        ),
      ],
    );
  }
}

class _Scrim extends StatelessWidget {
  const _Scrim({required this.top});

  final bool top;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: SizedBox(
      height: 160,
      width: double.infinity,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: top
                ? const [Color(0xBF000000), _clear]
                : const [_clear, Color(0xD9000000)],
          ),
        ),
      ),
    ),
  );
}

/// The arrow that closes the player, bare at the top bar's start.
class PlayerBackButton extends StatelessWidget {
  const PlayerBackButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => PlayerMenuButton(
    icon: Lucide.arrowLeft,
    label: label,
    onPressed: onPressed,
  );
}

/// One of the top bar's buttons: audio, subtitles, speed, quality. [active]
/// draws the accent line under it that says subtitles are on.
class PlayerMenuButton extends StatelessWidget {
  const PlayerMenuButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.active = false,
    this.state,
  });

  final String icon;
  final String label;
  final VoidCallback? onPressed;
  final bool active;

  /// What a screen reader hears it set to, like the subtitles that are on.
  final String? state;

  @override
  Widget build(BuildContext context) {
    final button = RoundIconButton(
      icon: icon,
      label: label,
      value: state,
      onPressed: onPressed,
      size: 52,
      iconSize: 26,
      background: _clear,
    );
    if (!active) return button;
    return Stack(
      alignment: Alignment.bottomCenter,
      children: [
        button,
        Positioned(
          bottom: 8,
          child: IgnorePointer(
            child: Container(
              width: 20,
              height: 2,
              decoration: BoxDecoration(
                color: MatineeTheme.of(context).accent,
                borderRadius: KitRadius.pill,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// The middle of the controls: the previous episode, skip back, play or
/// pause, skip ahead, and the next episode, 32 apart where there's room and
/// closer, then smaller, where there isn't (see [transportFit]). While [loading], the
/// play button's place stays empty for the spinner drawn at the center.
class PlayerTransport extends StatelessWidget {
  const PlayerTransport({
    super.key,
    required this.playing,
    required this.loading,
    required this.playLabel,
    required this.pauseLabel,
    required this.onTogglePlay,
    this.back,
    this.ahead,
    this.episodes,
  });

  final bool playing;
  final bool loading;
  final String playLabel;
  final String pauseLabel;
  final VoidCallback? onTogglePlay;
  final PlayerSkip? back;
  final PlayerSkip? ahead;

  /// The previous and next episode buttons, for an episode; null for a movie.
  final (PlayerEpisodeButton, PlayerEpisodeButton)? episodes;

  @override
  Widget build(BuildContext context) {
    final buttons = <(double, Widget)>[
      if (episodes case (final previous, _)) (64, previous),
      if (back case final skip?) (72, _SkipButton(skip, Lucide.rotateCcw)),
      (
        96,
        loading
            ? const SizedBox.shrink()
            : RoundIconButton(
                icon: playing ? Lucide.pause : Lucide.play,
                label: playing ? pauseLabel : playLabel,
                onPressed: onTogglePlay,
                // Bare like the skips beside it, and bigger to lead without a circle.
                size: 96,
                iconSize: 48,
                background: _clear,
                iconShadows: _onPicture,
              ),
      ),
      if (ahead case final skip?) (72, _SkipButton(skip, Lucide.rotateCw)),
      if (episodes case (_, final next)) (64, next),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final fit = transportFit([
          for (final (size, _) in buttons) size,
        ], constraints.maxWidth);
        return Row(
          mainAxisSize: MainAxisSize.min,
          spacing: fit.gap,
          children: [
            for (final (size, button) in buttons)
              SizedBox.square(
                dimension: size * fit.scale,
                child: FittedBox(
                  child: SizedBox.square(dimension: size, child: button),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// How the middle row fits [width]: the gaps narrow from 32 to 8 first,
/// then the buttons shrink together, never past what [width] leaves. At the
/// narrowest width the app supports, 320, they stay above 48 across.
({double gap, double scale}) transportFit(List<double> sizes, double width) {
  const widest = 32.0;
  const narrowest = 8.0;
  final buttons = sizes.fold(0.0, (sum, size) => sum + size);
  final gaps = math.max(0, sizes.length - 1);
  if (!width.isFinite || buttons + gaps * widest <= width) {
    return (gap: widest, scale: 1);
  }
  if (buttons + gaps * narrowest <= width) {
    return (gap: (width - buttons) / gaps, scale: 1);
  }
  final scale = ((width - gaps * narrowest) / buttons).clamp(0.0, 1.0);
  return (gap: narrowest, scale: scale.toDouble());
}

/// A skip button's seconds, what it says to a screen reader, and its action.
typedef PlayerSkip = ({int seconds, String label, VoidCallback? onPressed});

/// Skips back or forward, with how far in the middle of its arrow.
class _SkipButton extends StatelessWidget {
  const _SkipButton(this.skip, this.icon);

  final PlayerSkip skip;
  final String icon;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: skip.onPressed,
      label: skip.label,
      shape: BorderRadius.circular(36),
      builder: (context, state) => SizedBox.square(
        dimension: 72,
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: colors.foreground.withValues(
              alpha: switch (state) {
                PressState.pressed => .12,
                PressState.idle => 0.0,
                _ => .08,
              },
            ),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              KitIcon(
                icon,
                size: 40,
                color: colors.foreground,
                shadows: _onPicture,
              ),
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: ExcludeSemantics(
                  child: Text(
                    '${skip.seconds}',
                    // It sits inside the arrow, so it grows only as far as that leaves.
                    textScaler: MediaQuery.textScalerOf(context)
                        .clamp(maxScaleFactor: 1.3),
                    style: KitText.xs
                        .style(
                          color: colors.foreground,
                          weight: FontWeight.w600,
                        )
                        .copyWith(shadows: _onPicture),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Plays the episode either side of this one, or sits dimmed when there's none.
class PlayerEpisodeButton extends StatelessWidget {
  const PlayerEpisodeButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final String icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => RoundIconButton(
    icon: icon,
    label: label,
    onPressed: onPressed,
    size: 64,
    iconSize: 30,
    background: _clear,
    iconShadows: _onPicture,
  );
}
