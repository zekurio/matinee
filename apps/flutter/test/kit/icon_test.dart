import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/icon.dart';

void main() {
  // An icon drawn as a tinted SVG picture took a layer of its own in every
  // frame; drawn as paths, it takes none, and it must draw the same paths.
  test('a Lucide icon draws its strokes as the SVG does', () {
    final glyph = IconGlyph.of(Lucide.arrowLeft)!;
    expect(glyph.width, 24);
    expect(glyph.height, 24);
    expect(glyph.strokes, hasLength(2));
    for (final stroke in glyph.strokes) {
      expect(stroke.fill, isFalse);
      expect(stroke.width, 2);
      expect(stroke.cap, StrokeCap.round);
      expect(stroke.join, StrokeJoin.round);
    }
    // m12 19-7-7 7-7: from (12, 19) to (5, 12) to (12, 5).
    expect(
      glyph.strokes.first.path.getBounds(),
      const Rect.fromLTRB(5, 5, 12, 19),
    );
  });

  test('a filled icon fills and strokes, a dot in currentColor fills', () {
    final play = IconGlyph.of(Lucide.play)!;
    expect(play.strokes.map((s) => s.fill), [true, false]);
    final key = IconGlyph.of(Lucide.keyRound)!;
    expect(key.strokes.where((s) => s.fill), hasLength(1));
  });

  test('a stroke width given in the SVG is kept', () {
    final thin = IconGlyph.of(
      Lucide.arrowLeft.replaceFirst('stroke-width="2"', 'stroke-width="1.5"'),
    )!;
    expect(thin.strokes.first.width, 1.5);
  });

  test('an SVG with more than paths draws as a picture', () {
    const masked = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>
  <rect width="24" height="24" fill="url(#g)"/>
</svg>''';
    expect(IconGlyph.of(masked), isNull);
  });

  testWidgets('an opaque icon paints without a layer, a translucent one with', (
    tester,
  ) async {
    await tester.pumpWidget(
      const Directionality(
        textDirection: TextDirection.ltr,
        child: Row(
          children: [
            KitIcon(Lucide.play, color: Color(0xFFFF0000)),
            KitIcon(Lucide.pause, color: Color(0x80FF0000)),
          ],
        ),
      ),
    );
    expect(find.byType(CustomPaint), findsNWidgets(2));
    expect(find.byType(Opacity), findsOneWidget);
    expect(
      tester.widget<Opacity>(find.byType(Opacity)).opacity,
      closeTo(0x80 / 0xFF, 1e-3),
    );
  });
}
