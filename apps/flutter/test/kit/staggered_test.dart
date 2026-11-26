import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/staggered.dart';

/// A list 400 tall of cards 100 tall, each noting in [built] when it builds.
Widget _list(Set<int> built) => Directionality(
  textDirection: TextDirection.ltr,
  child: Align(
    alignment: Alignment.topLeft,
    child: SizedBox(
      width: 200,
      height: 400,
      child: ListView.builder(
        itemExtent: 100,
        itemCount: 100,
        itemBuilder: (context, index) => Staggered(
          builder: (context) {
            built.add(index);
            return Text('$index');
          },
        ),
      ),
    ),
  ),
);

void main() {
  test('separation is the gap between edges, negative for an overlap', () {
    const a = Rect.fromLTWH(0, 0, 100, 100);
    expect(separation(a, const Rect.fromLTWH(0, 150, 100, 100)), 50);
    expect(separation(a, const Rect.fromLTWH(130, 0, 100, 100)), 30);
    expect(separation(a, const Rect.fromLTWH(50, 50, 100, 100)), -50);
  });

  testWidgets('a list that isn\'t scrolling builds every card at once', (
    tester,
  ) async {
    final built = <int>{};
    await tester.pumpWidget(_list(built));
    // The four in view and the cache extent's 250 below.
    expect(built, {0, 1, 2, 3, 4, 5, 6});
  });

  testWidgets('while it scrolls, cards out of view build one a frame', (
    tester,
  ) async {
    final built = <int>{};
    await tester.pumpWidget(_list(built));
    final gesture = await tester.startGesture(const Offset(100, 200));
    // Past the touch slop, so the drag holds the list.
    await gesture.moveBy(const Offset(0, -40));
    await tester.pump();
    built.clear();

    // From 40 to 340: 7 to 9 come into the cache extent, out of view.
    await gesture.moveBy(const Offset(0, -300));
    await tester.pump();
    expect(built, {7});
    await tester.pump();
    expect(built, {7, 8});
    await tester.pump();
    expect(built, {7, 8, 9});
    await gesture.up();
    await tester.pumpAndSettle();
  });

  testWidgets('a card that would show builds at once', (tester) async {
    final built = <int>{};
    await tester.pumpWidget(_list(built));
    final gesture = await tester.startGesture(const Offset(100, 200));
    await gesture.moveBy(const Offset(0, -40));
    await tester.pump();
    built.clear();
    final before = Staggered.shownEmpty;

    // From 40 to 740: 7 to 13 come in at once, 7 to 11 in view, a scroll
    // the turns can't keep up with, so all in view build in the next frame.
    await gesture.moveBy(const Offset(0, -700));
    await tester.pump();
    expect(built, {7});
    await tester.pump();
    expect(built, containsAll({7, 8, 9, 10, 11}));
    expect(find.text('11'), findsOneWidget);
    expect(Staggered.shownEmpty - before, 4);
    await gesture.up();
    await tester.pumpAndSettle();
    expect(built, containsAll({12, 13}));
  });
}
