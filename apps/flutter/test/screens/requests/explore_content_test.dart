import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'explore_fixtures.dart';

/// Lays the tab out at [size], then at its bottom, so every row is built and
/// checked for overflow.
Future<void> _pumpAndCheck(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(exploreApp());
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);

  final scroll = tester.state<ScrollableState>(
    find
        .byWidgetPredicate(
          (widget) =>
              widget is Scrollable &&
              widget.axisDirection == AxisDirection.down,
        )
        .first,
  );
  scroll.position.jumpTo(scroll.position.maxScrollExtent);
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
}

void main() {
  testWidgets('Explore renders its Discover rows on a phone', (tester) async {
    await _pumpAndCheck(tester, const Size(412, 915));
    expect(find.text('Popular movies'), findsOneWidget);
    expect(find.text('Popular shows'), findsOneWidget);
    expect(find.text('Because you watched The Last of Us'), findsOneWidget);
    expect(find.text('Dune: Part Two'), findsWidgets);
    expect(find.text('The Bear'), findsWidgets);
    expect(find.text('Breaking Bad'), findsWidgets);
  });

  testWidgets('Explore renders its Discover rows on a tablet', (tester) async {
    await _pumpAndCheck(tester, const Size(1280, 800));
    expect(find.text('Popular movies'), findsOneWidget);
    expect(find.text('Popular shows'), findsOneWidget);
    expect(find.text('Because you watched The Last of Us'), findsOneWidget);
    expect(find.text('Dune: Part Two'), findsWidgets);
    expect(find.text('The Bear'), findsWidgets);
    expect(find.text('Breaking Bad'), findsWidgets);
  });
}
