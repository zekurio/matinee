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
  testWidgets('a bar button is a 24 icon in 48 square, a thumb\'s target', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        PageBarButton(icon: Lucide.search, label: 'Search', onPressed: () {}),
      ),
    );
    expect(tester.getSize(find.byType(PageBarButton)), const Size(48, 48));
    expect(tester.getSize(find.byType(KitIcon)), const Size(24, 24));
  });

  testWidgets('the switch track is 52 by 32 with a 48 tall target', (
    tester,
  ) async {
    await tester.pumpWidget(_app(Switch(checked: true, onChanged: (_) {})));
    expect(tester.getSize(find.byType(SwitchTrack)), const Size(52, 32));
    expect(
      tester.getSize(
        find.descendant(
          of: find.byType(AnimatedAlign),
          matching: find.byType(Container),
        ),
      ),
      const Size(24, 24),
    );
    expect(tester.getSize(find.byType(PressIndication)), const Size(76, 48));
  });

  testWidgets('the bottom bar is 80 tall, and each tab fills it', (
    tester,
  ) async {
    await _pumpTabs(tester, ['Home', 'Media', 'Downloads']);
    expect(find.text('Home'), findsOneWidget);
    expect(tester.getSize(find.byType(TabBar)).height, 80);
    for (final label in ['Home', 'Media', 'Downloads']) {
      expect(tester.getSize(_tab(label)).height, 80, reason: label);
    }
  });

  testWidgets('it stays 80 tall when the labels don\'t fit', (tester) async {
    await _pumpTabs(tester, [
      'Home',
      'Media',
      'A name no tab on a phone has room for',
    ]);
    expect(find.byType(Text), findsNothing);
    expect(tester.getSize(find.byType(TabBar)).height, 80);
    expect(tester.getSize(_tab('Home')).height, 80);
  });

  testWidgets('it stands on the gesture bar\'s inset', (tester) async {
    await _pumpTabs(tester, [
      'Home',
      'Media',
      'Downloads',
    ], padding: const EdgeInsets.only(bottom: 24));
    expect(tester.getSize(find.byType(TabBar)).height, 104);
    expect(tester.getSize(_tab('Home')).height, 80);
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
  EdgeInsets padding = EdgeInsets.zero,
}) async {
  final state = TabBarState(labels.first);
  addTearDown(state.dispose);
  await tester.pumpWidget(
    _app(
      MediaQuery(
        data: MediaQueryData(
          padding: padding,
          textScaler: TextScaler.linear(textScale),
        ),
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
