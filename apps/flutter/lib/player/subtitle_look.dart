import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/player.g.dart' as wire show SubtitleEdgeMessage;
import '../platform/player_system.g.dart' as wire;
import 'player.dart' show PlayerSubtitles;
import 'player_motion.dart';
import 'player_preferences.dart';
import 'player_system.dart';

/// How the player draws a line of subtitles. mpv draws its own, and takes only
/// [scale] of this.
@immutable
class SubtitleLook {
  const SubtitleLook({
    required this.color,
    required this.background,
    required this.edge,
    required this.edgeColor,
    required this.scale,
    this.window = const Color(0x00000000),
  });

  /// The app's own look, from Settings' choices.
  factory SubtitleLook.own(PlayerPrefs prefs) => SubtitleLook(
    color: Color(prefs.subtitleColor.argb),
    background: switch (prefs.subtitleBackground) {
      SubtitleBackground.none => const Color(0x00000000),
      SubtitleBackground.shaded => const Color(
        0xFF000000,
      ).withValues(alpha: .45),
      SubtitleBackground.black => const Color(0xFF000000),
    },
    edge: prefs.subtitleEdge,
    edgeColor: const Color(0xFF000000),
    scale: prefs.subtitleScale,
  );

  /// The system's caption style as Android draws it. Its typeface stays
  /// behind, since it can't cross to Dart.
  factory SubtitleLook.system(wire.CaptionStyleMessage style) => SubtitleLook(
    color: Color(style.foreground),
    background: Color(style.background),
    edge: switch (style.edge) {
      wire.CaptionEdgeMessage.none => SubtitleEdge.none,
      wire.CaptionEdgeMessage.outline => SubtitleEdge.outline,
      wire.CaptionEdgeMessage.shadow => SubtitleEdge.shadow,
      wire.CaptionEdgeMessage.raised => SubtitleEdge.raised,
      wire.CaptionEdgeMessage.depressed => SubtitleEdge.depressed,
    },
    edgeColor: Color(style.edgeColor),
    scale: style.scale,
    window: Color(style.window),
  );

  final Color color;

  /// Behind the text, transparent for none.
  final Color background;
  final SubtitleEdge edge;
  final Color edgeColor;

  /// On top of the size the player picks for the screen.
  final double scale;

  /// Behind the whole cue, around the text's background, as Android's
  /// caption window.
  final Color window;

  @override
  bool operator ==(Object other) =>
      other is SubtitleLook &&
      other.color == color &&
      other.background == background &&
      other.edge == edge &&
      other.edgeColor == edgeColor &&
      other.scale == scale &&
      other.window == window;

  @override
  int get hashCode =>
      Object.hash(color, background, edge, edgeColor, scale, window);
}

/// What the engine needs of [prefs] to draw subtitles as the player
/// would: Media3 draws its cues natively, in this look.
PlayerSubtitles playerSubtitles(PlayerPrefs prefs) {
  final own = SubtitleLook.own(prefs);
  return PlayerSubtitles(
    scale: prefs.subtitleScale,
    system: prefs.subtitleSystemStyle,
    color: own.color.toARGB32(),
    background: own.background.toARGB32(),
    edge: switch (prefs.subtitleEdge) {
      SubtitleEdge.outline => wire.SubtitleEdgeMessage.outline,
      SubtitleEdge.none => wire.SubtitleEdgeMessage.none,
      _ => wire.SubtitleEdgeMessage.shadow,
    },
  );
}

/// The system's caption style, which Settings > Accessibility > Caption
/// preferences sets, or null where the platform has none. It's read again
/// each time the app comes back, as from those settings.
final systemCaptionStyleProvider = FutureProvider<wire.CaptionStyleMessage?>((
  ref,
) {
  final listener = AppLifecycleListener(onShow: ref.invalidateSelf);
  ref.onDispose(listener.dispose);
  return ref.watch(playerSystemProvider).captionStyle();
});

/// The look [prefs] asks for: the system's caption style when it says to,
/// else the app's own choices. Until the system answers, the app's own.
SubtitleLook subtitleLook(WidgetRef ref, PlayerPrefs prefs) {
  final own = SubtitleLook.own(prefs);
  if (!prefs.subtitleSystemStyle) return own;
  final style = ref.watch(systemCaptionStyleProvider).value;
  return style == null ? own : SubtitleLook.system(style);
}

/// One cue, centered, at [size] times the look's scale: the text over its
/// background, inside the window, with a shadow or an outline drawn under
/// the fill.
class SubtitleLine extends StatelessWidget {
  const SubtitleLine(
    this.text, {
    super.key,
    required this.look,
    this.size = 20,
  });

  final InlineSpan text;
  final SubtitleLook look;
  final double size;

  @override
  Widget build(BuildContext context) {
    final fontSize = size * look.scale;
    // The edge's offsets are in physical pixels.
    final pixel = 1 / MediaQuery.devicePixelRatioOf(context);
    final base = TextStyle(
      color: look.color,
      fontSize: fontSize,
      height: 1.3,
      fontWeight: FontWeight.w500,
      shadows: switch (look.edge) {
        SubtitleEdge.shadow => [
          Shadow(
            color: look.edgeColor,
            offset: Offset(0, 2 * pixel),
            blurRadius: 6 * pixel,
          ),
        ],
        // A hard edge above and to the left, or below and to the right, as
        // Android draws them.
        SubtitleEdge.raised => [
          Shadow(color: look.edgeColor, offset: Offset(-2 * pixel, -2 * pixel)),
        ],
        SubtitleEdge.depressed => [
          Shadow(color: look.edgeColor, offset: Offset(2 * pixel, 2 * pixel)),
        ],
        _ => null,
      },
    );
    Widget line = Text.rich(text, textAlign: TextAlign.center, style: base);
    if (look.edge == SubtitleEdge.outline) {
      line = Stack(
        alignment: Alignment.center,
        children: [
          Text.rich(
            text,
            textAlign: TextAlign.center,
            style: base.copyWith(
              color: null,
              foreground: Paint()
                ..style = PaintingStyle.stroke
                ..strokeWidth = fontSize * .14
                ..strokeJoin = StrokeJoin.round
                ..color = look.edgeColor,
            ),
          ),
          line,
        ],
      );
    }
    final background = look.background.a > 0;
    final window = look.window.a > 0;
    return Container(
      padding: EdgeInsets.all(window ? 6 : 0),
      decoration: BoxDecoration(
        color: look.window,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: background ? 8 : 0,
          vertical: 2,
        ),
        decoration: BoxDecoration(
          color: look.background,
          borderRadius: BorderRadius.circular(4),
        ),
        child: line,
      ),
    );
  }
}

/// The cues showing now, centred at the bottom over the video, as both
/// players draw them: [bottom] up from the edge, which moves with the
/// controls rather than jumping as they come and go, and [side] in from
/// each edge, at [size] times the look's scale.
class SubtitleLayer extends StatelessWidget {
  const SubtitleLayer({
    super.key,
    required this.cues,
    required this.look,
    required this.bottom,
    this.side = 48,
    this.size = 20,
  });

  final List<InlineSpan> cues;
  final SubtitleLook look;
  final double bottom;
  final double side;
  final double size;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: Align(
      alignment: Alignment.bottomCenter,
      child: AnimatedPadding(
        duration: PlayerMotion.move,
        curve: PlayerMotion.easing,
        padding: EdgeInsets.fromLTRB(side, 0, side, bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          spacing: 2,
          children: [
            for (final cue in cues) SubtitleLine(cue, look: look, size: size),
          ],
        ),
      ),
    ),
  );
}
