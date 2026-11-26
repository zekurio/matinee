import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';

/// [child] on the kit's dark theme, as a screen shows it.
Widget _app(Widget child) => MaterialApp(
  home: MatineeTheme.wrap(
    matineeDark,
    Align(alignment: Alignment.topLeft, child: child),
  ),
);

void main() {
  testWidgets('the bottom bar stays 80 tall when the labels don\'t fit', (
    tester,
  ) async {
    await _pumpTabs(tester, [
      'Home',
      'Media',
      'A name no tab on a phone has room for',
    ]);
    expect(find.byType(Text), findsNothing);
    expect(tester.getSize(find.byType(TabBar)).height, 80);
    expect(tester.getSize(_tab('Home')).height, 80);
  });

  // The bar keeps what it measured for the next build; a bar with other
  // labels, or at another text size, must measure again.
  testWidgets('labels show again once they fit again', (tester) async {
    await _pumpTabs(tester, ['Home', 'Media']);
    expect(find.text('Media'), findsOneWidget);
    await _pumpTabs(tester, ['Home', 'Media'], textScale: 6);
    expect(find.byType(Text), findsNothing);
    await _pumpTabs(tester, ['Home', 'Media']);
    expect(find.text('Media'), findsOneWidget);
    await _pumpTabs(tester, ['Home', 'A name no tab on a phone has room for']);
    expect(find.byType(Text), findsNothing);
  });

  // The router builds the shell on every navigation, and the bar's tabs
  // built again each time, in a page's first frame.
  testWidgets('built again with the same tabs, the bar keeps its own', (
    tester,
  ) async {
    final state = TabBarState('Home');
    addTearDown(state.dispose);
    var second = 'Media';
    late StateSetter rebuild;
    await tester.pumpWidget(
      _app(
        SizedBox(
          width: 400,
          child: StatefulBuilder(
            builder: (context, setState) {
              rebuild = setState;
              // New items each time, as the shell makes them.
              return TabBar(
                items: [
                  for (final label in ['Home', second])
                    TabBarItem(id: label, icon: Lucide.house, label: label),
                ],
                state: state,
                onSelected: (_) {},
              );
            },
          ),
        ),
      ),
    );
    final before = tester.widget(_tab('Media'));
    rebuild(() {});
    await tester.pump();
    expect(identical(tester.widget(_tab('Media')), before), isTrue);
    rebuild(() => second = 'Library');
    await tester.pump();
    expect(_tab('Library'), findsOneWidget);
  });

  testWidgets('four tabs fit the narrowest phone at the largest text', (
    tester,
  ) async {
    await _pumpTabs(
      tester,
      ['Home', 'Media', 'Downloads', 'Explore'],
      width: 320,
      textScale: 3,
    );
    expect(tester.takeException(), isNull);
    expect(tester.getSize(find.byType(TabBar)).height, 80);
    for (final label in ['Home', 'Media', 'Downloads', 'Explore']) {
      final size = tester.getSize(_tab(label));
      expect(size.width, greaterThanOrEqualTo(48), reason: label);
      expect(size.height, 80, reason: label);
    }
  });
}

/// The tab that reads [label].
Finder _tab(String label) => find.byWidgetPredicate(
  (widget) => widget is PressIndication && widget.label == label,
);

/// A bottom bar of tabs named [labels], [width] across.
Future<void> _pumpTabs(
  WidgetTester tester,
  List<String> labels, {
  double width = 400,
  double textScale = 1,
}) async {
  final state = TabBarState(labels.first);
  addTearDown(state.dispose);
  await tester.pumpWidget(
    _app(
      MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: SizedBox(
          width: width,
          child: TabBar(
            items: [
              for (final label in labels)
                TabBarItem(id: label, icon: Lucide.house, label: label),
            ],
            state: state,
          ),
        ),
      ),
    ),
  );
}
