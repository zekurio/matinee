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
  });

  final String title;

  /// The episode code and show, under the title; null for a movie.
  final String? subtitle;
  final String backLabel;
  final VoidCallback onBack;

  /// The buttons at the end of the top bar, from [PlayerMenuButton].
  final List<Widget> menus;
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
                  ...menus,
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
/// pause, skip ahead, and the next episode, 32 apart. While [loading], the
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
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    spacing: 32,
    children: [
      ?episodes?.$1,
      if (back case final skip?) _SkipButton(skip, Lucide.rotateCcw),
      SizedBox.square(
        dimension: 96,
        child: loading
            ? null
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
      if (ahead case final skip?) _SkipButton(skip, Lucide.rotateCw),
      ?episodes?.$2,
    ],
  );
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
