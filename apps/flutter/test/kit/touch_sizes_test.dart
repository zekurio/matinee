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
