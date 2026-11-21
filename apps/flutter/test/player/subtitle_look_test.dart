import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/platform/player.g.dart' show SubtitleEdgeMessage;
import 'package:matinee/player/player_preferences.dart';
import 'package:matinee/player/player_system.dart';
import 'package:matinee/player/subtitle_look.dart';

Widget _frame(Widget child) => Directionality(
  textDirection: TextDirection.ltr,
  child: Center(child: child),
);

void main() {
  test("the app's own look follows Settings", () {
    final look = SubtitleLook.own(
      const PlayerPrefs(
        subtitleScale: 1.5,
        subtitleColor: SubtitleColor.cyan,
        subtitleBackground: SubtitleBackground.black,
        subtitleEdge: SubtitleEdge.none,
      ),
    );
    expect(look.color, const Color(0xFF6CE5FF));
    expect(look.background, const Color(0xFF000000));
    expect(look.edge, SubtitleEdge.none);
    expect(look.scale, 1.5);
    expect(look.window.a, 0);
    // Shaded, as it starts, is black at 45%.
    expect(
      SubtitleLook.own(const PlayerPrefs()).background,
      const Color(0xFF000000).withValues(alpha: .45),
    );
  });

  test("the system's look takes its colors, edge, and size", () {
    final look = SubtitleLook.system(
      CaptionStyleMessage(
        foreground: 0xFF00FF00,
        background: 0x80000000,
        window: 0xFF202020,
        edge: CaptionEdgeMessage.depressed,
        edgeColor: 0xFFFF0000,
        scale: 2,
      ),
    );
    expect(look.color, const Color(0xFF00FF00));
    expect(look.background, const Color(0x80000000));
    expect(look.window, const Color(0xFF202020));
    expect(look.edge, SubtitleEdge.depressed);
    expect(look.edgeColor, const Color(0xFFFF0000));
    expect(look.scale, 2);
  });

  test('the engine gets the own look, or follows the system', () {
    final own = playerSubtitles(
      const PlayerPrefs(
        subtitleScale: 1.5,
        subtitleColor: SubtitleColor.yellow,
        subtitleBackground: SubtitleBackground.none,
        subtitleEdge: SubtitleEdge.outline,
      ),
    );
    expect(own.scale, 1.5);
    expect(own.system, isFalse);
    expect(own.color, 0xFFFFE14D);
    expect(own.background, 0x00000000);
    expect(own.edge, SubtitleEdgeMessage.outline);
    expect(
      playerSubtitles(const PlayerPrefs(subtitleSystemStyle: true)).system,
      isTrue,
    );
  });

  testWidgets('a line draws at its size times the scale, outlined under it', (
    tester,
  ) async {
    const look = SubtitleLook(
      color: Color(0xFFFFFFFF),
      background: Color(0x00000000),
      edge: SubtitleEdge.outline,
      edgeColor: Color(0xFF000000),
      scale: 1.5,
    );
    await tester.pumpWidget(
      _frame(const SubtitleLine(TextSpan(text: 'Hello'), look: look)),
    );
    final texts = tester.widgetList<RichText>(find.byType(RichText)).toList();
    // The stroke first, then the fill over it.
    expect(texts, hasLength(2));
    final stroke = texts.first.text.style!;
    expect(stroke.foreground?.style, PaintingStyle.stroke);
    expect(stroke.foreground?.strokeWidth, closeTo(30 * .14, 1e-4));
    expect(texts.last.text.style?.fontSize, 30);
    expect(texts.last.text.style?.color, const Color(0xFFFFFFFF));
  });

  testWidgets('a shadow is one line with the edge color under it', (
    tester,
  ) async {
    const look = SubtitleLook(
      color: Color(0xFFFFFFFF),
      background: Color(0xFF000000),
      edge: SubtitleEdge.shadow,
      edgeColor: Color(0xFF112233),
      scale: 1,
    );
    await tester.pumpWidget(
      _frame(const SubtitleLine(TextSpan(text: 'Hello'), look: look)),
    );
    final text = tester.widget<RichText>(find.byType(RichText));
    expect(text.text.style?.shadows?.single.color, const Color(0xFF112233));
  });
}
