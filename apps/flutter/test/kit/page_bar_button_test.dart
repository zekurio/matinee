import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';

/// A filter button in a bar, at [count] filters on and [textScale].
Future<void> _pump(
  WidgetTester tester, {
  required int count,
  double textScale = 1,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: MatineeTheme.data(matineeLight),
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: Center(
          child: PageBarButton(
            icon: Lucide.listFilter,
            label: count > 0 ? '$count filters on' : 'Filter',
            count: count,
            onPressed: () {},
          ),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('a filter button with nothing on has no badge', (tester) async {
    await _pump(tester, count: 0);
    expect(find.byType(Text), findsNothing);
    expect(tester.takeException(), isNull);
  });

  // The bug it pins: a tinted icon read as a pressed button, and said
  // nothing about how many filters were on.
  testWidgets('a filter button with two filters on shows 2', (tester) async {
    await _pump(tester, count: 2);
    expect(find.text('2'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the badge stays inside the button at the largest text', (
    tester,
  ) async {
    await _pump(tester, count: 2, textScale: 1.3);
    expect(find.text('2'), findsOneWidget);
    expect(tester.getSize(find.text('2')).height, lessThanOrEqualTo(48));
    expect(tester.takeException(), isNull);
  });
}
