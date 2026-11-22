import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../seek_bar.dart' show formatClock;
import 'tv_seek.dart';

/// How high the overlay's block reaches from the bottom, for the subtitles
/// to clear it.
const tvOverlayHeight = 190.0;

/// The time bubble's height, one line of [TvType.title] in its padding.
const _bubbleHeight = 26.0 + 8;

/// Between the heading and the focused seek bar: the bubble, 6 over the
/// bar's box, and 6 clear of the heading.
const _bubbleRoom = 6 + _bubbleHeight + 6;

/// How wide the trickplay frame over the seek bar is, as the Kotlin TV
/// player draws it.
const tvTrickplayWidth = 240.0;

/// How wide the player's buttons are, but play's.
const _small = 40.0;

/// How wide play is: a step up from the others, the height of the app's
/// other buttons.
const _play = TvButtons.height;

/// The menus the TV player opens at the right edge, as the Kotlin app's:
/// audio, subtitles, and the rest (quality, speed, and the picture) in one.
enum TvPlayerMenu { audio, subtitles, settings }

/// Where focus goes in the player: the play button, the seek bar, each
/// menu's button, and the button the player offers by itself, in the
/// controls' row ([action]) or alone on the picture ([corner]).
class TvPlayerTargets {
  final play = FocusNode(debugLabel: 'player/play');
  final seek = FocusNode(debugLabel: 'player/seek');
  final action = FocusNode(debugLabel: 'player/action');
  final corner = FocusNode(debugLabel: 'player/corner');
  final menus = {
    for (final menu in TvPlayerMenu.values)
      menu: FocusNode(debugLabel: 'player/${menu.name}'),
  };

  void dispose() {
    for (final node in [play, seek, action, corner, ...menus.values]) {
      node.dispose();
    }
  }
}

/// The one thing to do now that the player offers by itself, like the next
/// episode while the credits roll, or Skip intro: [label], and [countdown],
/// the seconds until it happens without a press, if it will.
typedef TvPictureAction = ({
  String label,
  int? countdown,
  VoidCallback onPressed,
});

/// What the seek bar's keys do: step or glide toward a direction, and seek
/// where they got to.
typedef TvSeekKeys = ({
  void Function(int direction, bool repeat, Duration at) press,
  VoidCallback release,
});

/// The episodes either side, for the buttons outside the skips.
typedef TvEpisodeButtons = ({VoidCallback? previous, VoidCallback? next});

/// A single button on the picture, with no card or controls around it, as
/// the Kotlin app's `TvPictureButton`: [action]'s label, then its
/// countdown dimmer, like "Next episode · 7". The picture behind it can be
/// any frame, so it rests dark rather than in the faint white of other
/// controls, and a shadow keeps its edge on a white frame once focus fills
/// it white.
class TvPictureButton extends StatelessWidget {
  const TvPictureButton({super.key, required this.action, this.focusNode});

  final TvPictureAction action;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return DecoratedBox(
      decoration: const BoxDecoration(
        borderRadius: KitRadius.pill,
        boxShadow: [BoxShadow(color: Color(0x66000000), blurRadius: 12)],
      ),
      child: TvButton(
        label: action.label,
        detail: switch (action.countdown) {
          // A minute or more reads as the time it is, like the seek bar's.
          final seconds? when seconds >= 60 =>
            '· ${formatClock(seconds.toDouble())}',
          final seconds? => '· $seconds',
          null => null,
        },
        rest: colors.background.withValues(alpha: .72),
        focusNode: focusNode,
        onPressed: action.onPressed,
      ),
    );
  }
}

/// The TV player's controls, kept low and small so the picture stays the
/// thing to look at, as the Kotlin app's `TvOverlay`: a scrim up from the
/// bottom, the title at the left, one wide seek bar with the time on
/// either side, and one row of small round buttons, play and the skips at
/// the left with an episode's previous and next outside them, the menus at
/// the right, and [action] beside the menus when there is one. All of it
/// inside the overscan margins.
class TvPlayerOverlay extends StatefulWidget {
  const TvPlayerOverlay({
    super.key,
    required this.targets,
    required this.title,
    required this.subtitle,
    required this.playing,
    required this.position,
    required this.duration,
    required this.buffered,
    required this.scrubbing,
    required this.back,
    required this.ahead,
    required this.keys,
    required this.playRests,
    required this.subtitlesOn,
    required this.onTogglePlay,
    required this.onSkip,
    required this.onMenu,
    this.action,
    this.episodes,
    this.preview,
  });

  final TvPlayerTargets targets;
  final String title;

  /// The episode's code and show, over the title.
  final String? subtitle;
  final bool playing;
  final double position;
  final double duration;
  final double? buffered;

  /// Whether the keys have moved the bar ahead of the video.
  final bool scrubbing;

  /// The skip lengths, or null while the server hasn't said them.
  final int? back;
  final int? ahead;
  final TvSeekKeys keys;

  /// Play looks focused while nothing else here has focus, since focus
  /// rests there as the controls come.
  final bool playRests;
  final bool subtitlesOn;
  final VoidCallback onTogglePlay;
  final ValueChanged<int> onSkip;
  final ValueChanged<TvPlayerMenu> onMenu;
  final TvPictureAction? action;
  final TvEpisodeButtons? episodes;

  /// The trickplay frame at a time, for the seek bar.
  final Widget Function(double seconds)? preview;

  @override
  State<TvPlayerOverlay> createState() => _TvPlayerOverlayState();
}

class _TvPlayerOverlayState extends State<TvPlayerOverlay> {
  // Focus reaches play a frame after the controls start to show, and
  // following it to the letter turned the button from dark to white and
  // back in the fade, so play stays lit until another control takes focus.
  var _inside = false;
  var _onPlay = false;

  /// The seek bar has focus, so its time floats over it.
  var _onSeek = false;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final targets = widget.targets;
    final playLit = widget.playRests && !(_inside && !_onPlay);
    final episodes = widget.episodes;
    return Focus(
      canRequestFocus: false,
      skipTraversal: true,
      onFocusChange: (inside) => setState(() => _inside = inside),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // About half black behind the title, two thirds behind the bar,
          // and four fifths at the bottom edge, so the picture stays
          // watchable with the controls up.
          const Align(
            alignment: Alignment.bottomCenter,
            child: FractionallySizedBox(
              heightFactor: .62,
              widthFactor: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: [0, .3, .55, 1],
                    colors: [
                      Color(0x00000000),
                      Color(0x80000000),
                      Color(0xA6000000),
                      Color(0xCC000000),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomLeft,
            child: Padding(
              padding: Overscan.padding,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Heading(title: widget.title, subtitle: widget.subtitle),
                  // The time over the focused bar takes no room of its own,
                  // so the heading moves up out of its way rather than
                  // sit under it. The trickplay frame, while seeking, is
                  // what to look at, and covers it.
                  AnimatedContainer(
                    duration: TvMotion.move,
                    curve: TvMotion.easing,
                    height: _onSeek || widget.scrubbing ? _bubbleRoom : 12,
                  ),
                  Focus(
                    canRequestFocus: false,
                    skipTraversal: true,
                    onFocusChange: (focused) =>
                        setState(() => _onSeek = focused),
                    child: TvSeekBar(
                      focusNode: targets.seek,
                      below: targets.play,
                      position: widget.position,
                      duration: widget.duration,
                      buffered: widget.buffered,
                      scrubbing: widget.scrubbing,
                      keys: widget.keys,
                      onTogglePlay: widget.onTogglePlay,
                      preview: widget.preview,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      if (episodes?.previous case final previous?) ...[
                        TvRoundButton(
                          icon: Lucide.skipBack,
                          label: l.playerPreviousEpisode,
                          size: _small,
                          iconSize: 20,
                          onPressed: previous,
                        ),
                        const SizedBox(width: 12),
                      ],
                      if (widget.back case final seconds?) ...[
                        _SkipButton(
                          icon: Lucide.rotateCcw,
                          seconds: seconds,
                          label: l.playerSkipBack(seconds),
                          onPressed: () => widget.onSkip(-seconds),
                        ),
                        const SizedBox(width: 12),
                      ],
                      TvRoundButton(
                        icon: widget.playing ? Lucide.pause : Lucide.play,
                        label: widget.playing ? l.playerPause : l.playerPlay,
                        size: _play,
                        iconSize: 22,
                        lit: playLit,
                        focusNode: targets.play,
                        onFocusChange: (focused) =>
                            setState(() => _onPlay = focused),
                        onPressed: widget.onTogglePlay,
                      ),
                      if (widget.ahead case final seconds?) ...[
                        const SizedBox(width: 12),
                        _SkipButton(
                          icon: Lucide.rotateCw,
                          seconds: seconds,
                          label: l.playerSkipForward(seconds),
                          onPressed: () => widget.onSkip(seconds),
                        ),
                      ],
                      if (episodes?.next case final next?) ...[
                        const SizedBox(width: 12),
                        TvRoundButton(
                          icon: Lucide.skipForward,
                          label: l.playerNextEpisode,
                          size: _small,
                          iconSize: 20,
                          onPressed: next,
                        ),
                      ],
                      const Spacer(),
                      if (widget.action case final action?) ...[
                        TvPictureButton(
                          action: action,
                          focusNode: targets.action,
                        ),
                        const SizedBox(width: 16),
                      ],
                      for (final (menu, icon, label) in [
                        (
                          TvPlayerMenu.audio,
                          Lucide.audioLines,
                          l.playerMenuAudio,
                        ),
                        (
                          TvPlayerMenu.subtitles,
                          Lucide.captions,
                          l.playerMenuSubtitles,
                        ),
                        (
                          TvPlayerMenu.settings,
                          Lucide.settings,
                          l.playerMenuSettings,
                        ),
                      ]) ...[
                        if (menu != TvPlayerMenu.audio)
                          const SizedBox(width: 12),
                        _MenuButton(
                          icon: icon,
                          label: label,
                          on:
                              menu == TvPlayerMenu.subtitles &&
                              widget.subtitlesOn,
                          focusNode: targets.menus[menu]!,
                          onPressed: () => widget.onMenu(menu),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A soft shadow under text on the picture, so it still reads where the
/// scrim is light and the scene bright.
const _onPicture = [
  Shadow(color: Color(0x99000000), offset: Offset(0, 2), blurRadius: 10),
];

/// The title, with the episode's code and show above it.
class _Heading extends StatelessWidget {
  const _Heading({required this.title, required this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (subtitle case final text?)
          Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TvType.label.style(
              color: colors.foreground.withValues(alpha: .75),
              shadows: _onPicture,
            ),
          ),
        Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TvType.headline.style(
            color: colors.foreground,
            shadows: _onPicture,
          ),
        ),
      ],
    );
  }
}

/// A skip arrow with how far it skips in its middle, as the phone draws it,
/// as big as play so the number reads from the couch.
class _SkipButton extends StatelessWidget {
  const _SkipButton({
    required this.icon,
    required this.seconds,
    required this.label,
    required this.onPressed,
  });

  final String icon;
  final int seconds;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => TvFocusable(
    onPressed: onPressed,
    label: label,
    builder: (context, focused) => TvControl(
      focused: focused,
      builder: (context, content) => SizedBox.square(
        dimension: _play,
        child: Stack(
          alignment: Alignment.center,
          children: [
            KitIcon(icon, size: 38, color: content),
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                '$seconds',
                textAlign: TextAlign.center,
                style: TvType.iconNumber.style(color: content),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// A menu's button: its icon in a circle, which opens to say the menu's
/// name while focused, as the app's other icon buttons do, with the web
/// player's accent line under the icon while [on], as for subtitles that
/// show, at a TV's size. Focus returns to it when the menu closes.
class _MenuButton extends StatelessWidget {
  const _MenuButton({
    required this.icon,
    required this.label,
    required this.focusNode,
    required this.onPressed,
    this.on = false,
  });

  final String icon;
  final String label;
  final FocusNode focusNode;
  final VoidCallback onPressed;
  final bool on;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return TvFocusable(
      focusNode: focusNode,
      onPressed: onPressed,
      label: label,
      builder: (context, focused) => TvControl(
        focused: focused,
        builder: (context, content) => ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: _small,
            maxHeight: _small,
            minWidth: _small,
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: AnimatedSize(
              duration: focused ? TvMotion.enter : TvMotion.exit,
              curve: focused ? TvMotion.easing : TvMotion.exitEasing,
              alignment: AlignmentDirectional.centerStart,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    alignment: Alignment.bottomCenter,
                    children: [
                      KitIcon(icon, size: 20, color: content),
                      if (on)
                        Positioned(
                          bottom: -7,
                          child: Container(
                            width: 20,
                            height: 4,
                            decoration: BoxDecoration(
                              color: colors.accent,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                    ],
                  ),
                  if (focused)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(
                        start: 8,
                        end: 4,
                      ),
                      child: Text(
                        label,
                        maxLines: 1,
                        style: TvType.label.style(color: content),
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

/// The seek bar, as the Kotlin app's `TvSeekBar`. Focused, it thickens,
/// shows its dot, and the time floats above the dot; Left and Right step
/// by the skip lengths and glide while held, and the player seeks when the
/// key comes up, with [preview]'s trickplay frame over the time while the
/// keys move it, when the server made frames. Select plays or pauses, Down
/// goes to play.
class TvSeekBar extends StatelessWidget {
  const TvSeekBar({
    super.key,
    required this.focusNode,
    required this.below,
    required this.position,
    required this.duration,
    required this.buffered,
    required this.scrubbing,
    required this.keys,
    required this.onTogglePlay,
    this.preview,
  });

  final FocusNode focusNode;

  /// The trickplay frame at a time, [tvTrickplayWidth] wide.
  final Widget Function(double seconds)? preview;

  /// Where Down goes.
  final FocusNode below;
  final double position;
  final double duration;
  final double? buffered;
  final bool scrubbing;
  final TvSeekKeys keys;
  final VoidCallback onTogglePlay;

  KeyEventResult _key(KeyEvent event) {
    final key = event.logicalKey;
    final direction = switch (key) {
      LogicalKeyboardKey.arrowLeft => -1,
      LogicalKeyboardKey.arrowRight => 1,
      _ => 0,
    };
    if (direction != 0) {
      if (!seekable(duration)) return KeyEventResult.ignored;
      switch (event) {
        case KeyDownEvent():
          keys.press(direction, false, event.timeStamp);
        case KeyRepeatEvent():
          keys.press(direction, true, event.timeStamp);
        case KeyUpEvent():
          keys.release();
      }
      return KeyEventResult.handled;
    }
    if (isTvSelectKey(key)) {
      if (event is KeyUpEvent) {
        scrubbing ? keys.release() : onTogglePlay();
      }
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.arrowDown) {
      if (event is KeyDownEvent) below.requestFocus();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final length = duration < 0 ? 0.0 : duration;
    final time = TvType.facts.style(
      color: colors.foreground,
      shadows: _onPicture,
    );
    return Row(
      children: [
        Text(formatClock(position), style: time),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TvFocusable(
              focusNode: focusNode,
              label: l.a11yPlayerSeek,
              value: l.a11yPlayerPosition(
                formatClock(position),
                formatClock(length),
              ),
              button: false,
              onFocusChange: (focused) {
                if (!focused) keys.release();
              },
              onKey: _key,
              builder: (context, focused) => _Track(
                focused: focused,
                fraction: seekFraction(position, length),
                loaded: seekFraction(buffered ?? 0, length),
                bubble: focused || scrubbing ? formatClock(position) : null,
                frame: scrubbing ? preview?.call(position) : null,
              ),
            ),
          ),
        ),
        Text(
          formatClock(length),
          textAlign: TextAlign.end,
          style: time.copyWith(color: colors.foreground.withValues(alpha: .75)),
        ),
      ],
    );
  }
}

class _Track extends StatelessWidget {
  const _Track({
    required this.focused,
    required this.fraction,
    required this.loaded,
    required this.bubble,
    this.frame,
  });

  final bool focused;
  final double fraction;
  final double loaded;
  final String? bubble;
  final Widget? frame;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return TweenAnimationBuilder<double>(
      tween: Tween(end: focused ? 1 : 0),
      duration: TvMotion.color,
      builder: (context, t, _) => SizedBox(
        height: 28,
        child: LayoutBuilder(
          builder: (context, box) => Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: CustomPaint(
                  painter: _TrackPainter(
                    fraction: fraction,
                    loaded: loaded,
                    thickness: 5 + 3 * t,
                    thumb: 11 * t,
                    played: colors.accent,
                    thumbColor: colors.foreground,
                  ),
                ),
              ),
              if (bubble case final text?)
                // Floats above the bar without taking room, centred on the
                // dot and kept on screen.
                Positioned(
                  bottom: 28 + 6,
                  left: 0,
                  right: 0,
                  child: CustomSingleChildLayout(
                    delegate: _BubbleLayout(fraction),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (frame case final picture?) ...[
                          DecoratedBox(
                            position: DecorationPosition.foreground,
                            decoration: BoxDecoration(
                              borderRadius: TvCards.radius,
                              border: Border.all(
                                color: colors.foreground,
                                width: 2,
                              ),
                            ),
                            child: ClipRRect(
                              borderRadius: TvCards.radius,
                              child: picture,
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],
                        Container(
                          height: _bubbleHeight,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: colors.foreground,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            text,
                            style: TvType.title
                                .style(color: colors.background)
                                .copyWith(
                                  fontFeatures: const [
                                    FontFeature.tabularFigures(),
                                  ],
                                ),
                          ),
                        ),
                      ],
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

class _BubbleLayout extends SingleChildLayoutDelegate {
  const _BubbleLayout(this.fraction);

  final double fraction;

  @override
  // Room for the trickplay frame over the time; it takes no layout room.
  Size getSize(BoxConstraints constraints) => Size(constraints.maxWidth, 240);

  @override
  BoxConstraints getConstraintsForChild(BoxConstraints constraints) =>
      constraints.loosen();

  @override
  Offset getPositionForChild(Size size, Size child) {
    final x = (size.width * fraction - child.width / 2).clamp(
      0.0,
      (size.width - child.width).clamp(0.0, double.infinity),
    );
    return Offset(x, size.height - child.height);
  }

  @override
  bool shouldRelayout(_BubbleLayout old) => old.fraction != fraction;
}

class _TrackPainter extends CustomPainter {
  const _TrackPainter({
    required this.fraction,
    required this.loaded,
    required this.thickness,
    required this.thumb,
    required this.played,
    required this.thumbColor,
  });

  final double fraction;
  final double loaded;
  final double thickness;
  final double thumb;
  final Color played;
  final Color thumbColor;

  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height / 2;
    void line(double to, Color color) => canvas.drawLine(
      Offset(0, y),
      Offset(to, y),
      Paint()
        ..color = color
        ..strokeWidth = thickness
        ..strokeCap = StrokeCap.round,
    );
    line(size.width, const Color(0x40FFFFFF));
    line(size.width * loaded, const Color(0x73FFFFFF));
    line(size.width * fraction, played);
    if (thumb > 0) {
      canvas.drawCircle(
        Offset(size.width * fraction, y),
        thumb,
        Paint()..color = thumbColor,
      );
    }
  }

  @override
  bool shouldRepaint(_TrackPainter old) =>
      old.fraction != fraction ||
      old.loaded != loaded ||
      old.thickness != thickness ||
      old.thumb != thumb ||
      old.played != played;
}
