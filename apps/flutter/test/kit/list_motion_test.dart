import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/list_motion.dart';
import 'package:matinee/kit/motion.dart';

const _extent = 100.0;

/// A list of rows by [ids], each [_extent] tall, as a screen's.
Widget _list(List<String> ids, {bool reduceMotion = false}) => MediaQuery(
  data: MediaQueryData(disableAnimations: reduceMotion),
  child: Directionality(
    textDirection: TextDirection.ltr,
    child: CustomScrollView(
      slivers: [
        ListMotion(
          ids: ids,
          child: SliverList.builder(
            itemCount: ids.length,
            itemBuilder: (context, index) => ListItemMotion(
              key: ValueKey(ids[index]),
              id: ids[index],
              child: SizedBox(height: _extent, child: Text(ids[index])),
            ),
          ),
        ),
      ],
    ),
  ),
);

/// The layer row [id] paints into, under its item.
ContainerLayer _layer(WidgetTester tester, String id) {
  final boundary = tester.renderObject<RenderRepaintBoundary>(
    find
        .ancestor(of: find.text(id), matching: find.byType(RepaintBoundary))
        .first,
  );
  return boundary.debugLayer!;
}

/// How far row [id] is drawn from where it's laid out.
Offset _shift(WidgetTester tester, String id) {
  // SAFETY: a repaint boundary paints into an offset layer.
  return (_layer(tester, id) as OffsetLayer).offset;
}

/// How opaque row [id] is drawn, by the fade over it if it has one.
double _opacity(WidgetTester tester, String id) =>
    switch (_layer(tester, id).parent) {
      OpacityLayer(:final alpha?) => alpha / 255,
      _ => 1,
    };

void main() {
  final ease = KitMotion.easing.transform;

  testWidgets('a sort moves the rows that stay from where they were', (
    tester,
  ) async {
    await tester.pumpWidget(_list(['a', 'b', 'c']));
    await tester.pumpWidget(_list(['c', 'a', 'b']));
    await tester.pump(KitMotion.move ~/ 2);

    // a was at the top and is now a row down: it's drawn on its way there.
    expect(_shift(tester, 'a').dy, moreOrLessEquals(-_extent * (1 - ease(.5))));
    expect(
      _shift(tester, 'c').dy,
      moreOrLessEquals(2 * _extent * (1 - ease(.5))),
    );

    await tester.pumpAndSettle();
    expect(_shift(tester, 'a'), Offset.zero);
  });

  testWidgets('a row put in fades in, and the rows after it move down', (
    tester,
  ) async {
    await tester.pumpWidget(_list(['a', 'b']));
    await tester.pumpWidget(_list(['a', 'x', 'b']));
    await tester.pump(KitMotion.move ~/ 2);

    expect(_opacity(tester, 'x'), moreOrLessEquals(ease(.5), epsilon: .01));
    expect(_shift(tester, 'b').dy, lessThan(0));
    expect(_shift(tester, 'a'), Offset.zero);

    await tester.pumpAndSettle();
    expect(_opacity(tester, 'x'), 1);
  });

  testWidgets('a list growing at its end moves nothing', (tester) async {
    await tester.pumpWidget(_list(['a', 'b']));
    await tester.pumpWidget(_list(['a', 'b', 'c']));
    await tester.pump(KitMotion.move ~/ 2);

    expect(_opacity(tester, 'c'), 1);
    expect(_shift(tester, 'b'), Offset.zero);
  });

  testWidgets('with less motion asked for, rows change in place', (
    tester,
  ) async {
    await tester.pumpWidget(_list(['a', 'b', 'c'], reduceMotion: true));
    await tester.pumpWidget(_list(['c', 'a', 'b'], reduceMotion: true));
    await tester.pump(KitMotion.move ~/ 2);

    expect(_shift(tester, 'a'), Offset.zero);
  });
}
