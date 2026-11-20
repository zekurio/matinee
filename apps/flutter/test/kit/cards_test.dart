import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';

/// Three cards of one kind in a rail, recording what each was asked to do.
Future<List<String>> _rail(
  WidgetTester tester,
  Widget Function(int index, void Function(String) log) card, {
  double width = 120,
  double aspect = CardMetrics.poster,
}) async {
  final log = <String>[];
  await tester.pumpWidget(
    Directionality(
      textDirection: TextDirection.ltr,
      child: MatineeTheme.wrap(
        matineeDark,
        ListView(
          children: [
            Rail(
              title: 'Row',
              itemWidth: width,
              itemHeight: CardMetrics.height(
                width,
                aspect,
                TextScaler.noScaling,
              ),
              itemCount: 3,
              itemBuilder: (context, index) => card(index, log.add),
            ),
          ],
        ),
      ),
    ),
  );
  return log;
}

void main() {
  testWidgets("a poster card's name and detail open it as the poster does", (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final log = await _rail(
      tester,
      (index, log) => PosterCard(
        name: 'Card $index',
        detail: '199$index',
        onPressed: () => log('open $index'),
        onLongPress: () => log('menu $index'),
        longPressLabel: 'More',
      ),
    );
    // The name under the poster; the poster shows it too until art loads.
    await tester.tap(find.text('Card 1').last);
    await tester.longPress(find.text('Card 1').last);
    await tester.tap(find.text('1992'));
    await tester.longPress(find.text('1992'));
    expect(log, ['open 1', 'menu 1', 'open 2', 'menu 2']);

    // The gap between two cards is neither.
    final first = tester.getRect(find.byType(PosterCard).first);
    await tester.tapAt(
      first.centerRight + const Offset(CardMetrics.gap / 2, 0),
    );
    expect(log, hasLength(4));

    // Still one node per card, with the label it had.
    expect(
      tester.getSemantics(find.bySemanticsLabel('Card 1, 1991')),
      isSemantics(
        isButton: true,
        hasTapAction: true,
        hasLongPressAction: true,
        label: 'Card 1, 1991',
      ),
    );
    expect(find.bySemanticsLabel(RegExp('^Card 1')), findsOneWidget);
    handle.dispose();
  });

  testWidgets("a wide card's words open it and its menu", (tester) async {
    final log = await _rail(
      tester,
      width: 240,
      aspect: CardMetrics.wide,
      (index, log) => WideCard(
        name: 'Show $index',
        detail: 'S1, E$index',
        onPressed: () => log('open $index'),
        onLongPress: () => log('menu $index'),
        longPressLabel: 'More',
      ),
    );
    await tester.tap(find.text('Show 0'));
    await tester.longPress(find.text('S1, E0'));
    expect(log, ['open 0', 'menu 0']);
  });

  testWidgets("a person card's name opens them", (tester) async {
    final log = await _rail(
      tester,
      aspect: 1,
      (index, log) =>
          PersonCard(name: 'Person $index', onPressed: () => log('$index')),
    );
    await tester.tap(find.text('Person 2'));
    expect(log, ['2']);
  });
}
