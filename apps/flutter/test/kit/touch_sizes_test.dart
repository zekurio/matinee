import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/shell/header.dart';

/// [child] on the kit's dark theme, as a screen shows it.
Widget _app(Widget child) => MaterialApp(
  home: MatineeTheme.wrap(
    matineeDark,
    Align(alignment: Alignment.topLeft, child: child),
  ),
);

void main() {
  testWidgets('a header button is 48 square, a phone thumb target', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        HeaderButton(icon: Lucide.search, label: 'Search', onPressed: () {}),
      ),
    );
    expect(tester.getSize(find.byType(HeaderButton)), const Size(48, 48));
  });

  testWidgets('the switch track is 52 by 32 with a 48 tall target', (
    tester,
  ) async {
    await tester.pumpWidget(_app(Switch(checked: true, onChanged: (_) {})));
    final track = find.descendant(
      of: find.byType(Switch),
      matching: find.byType(AnimatedContainer),
    );
    expect(tester.getSize(track), const Size(52, 32));
    expect(
      tester.getSize(
        find.descendant(
          of: find.byType(AnimatedAlign),
          matching: find.byType(Container),
        ),
      ),
      const Size(24, 24),
    );
    expect(tester.getSize(find.byType(PressIndication)).height, 48);
  });

  testWidgets('a bottom tab is at least 72 tall with its label', (
    tester,
  ) async {
    final state = TabBarState('home');
    addTearDown(state.dispose);
    await tester.pumpWidget(
      _app(
        SizedBox(
          width: 400,
          child: TabBar(
            items: const [
              TabBarItem(id: 'home', icon: Lucide.house, label: 'Home'),
              TabBarItem(id: 'media', icon: Lucide.libraryBig, label: 'Media'),
              TabBarItem(
                id: 'downloads',
                icon: Lucide.download,
                label: 'Downloads',
              ),
            ],
            state: state,
          ),
        ),
      ),
    );
    expect(find.text('Home'), findsOneWidget);
    for (final label in ['Home', 'Media', 'Downloads']) {
      final tab = find.byWidgetPredicate(
        (widget) => widget is PressIndication && widget.label == label,
      );
      expect(
        tester.getSize(tab).height,
        greaterThanOrEqualTo(72),
        reason: label,
      );
    }
  });
}
