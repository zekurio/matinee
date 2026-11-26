import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/title/title_parts.dart';

Widget testApp(Widget home) => ProviderScope(
  child: MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: MatineeTheme.data(matineeDark),
    home: home,
  ),
);

List<Widget> _sections(int count) => [
  for (var i = 0; i < count; i++)
    SizedBox(height: 150, child: Text('section $i')),
];

void main() {
  // Built in one frame, a title page took two frames' time at 120 Hz while
  // it faded in.
  testWidgets('over a spinner, it builds a section a frame, then shows', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    Widget page(bool loaded) => testApp(
      FadeSwitcher(
        value: loaded,
        child: loaded
            ? TitleScaffold(sections: _sections(20))
            : const Text('loading'),
      ),
    );
    await tester.pumpWidget(page(false));
    await tester.pumpWidget(page(true));
    final built = <int>[];
    for (var frame = 0; frame < 12; frame++) {
      built.add(
        List.generate(20, (i) => i)
            .where(
              (i) => find
                  .text('section $i', skipOffstage: false)
                  .evaluate()
                  .isNotEmpty,
            )
            .length,
      );
      await tester.pump(const Duration(milliseconds: 8));
    }
    // 150 tall and 24 apart, five sections fill the 800 and the next two
    // its cache; the eighth starts past it, so it isn't built and the
    // page shows.
    expect(built.take(8), [1, 2, 3, 4, 5, 6, 7, 7], reason: '$built');
    await tester.pumpAndSettle();
    expect(find.text('loading'), findsNothing);
    expect(find.text('section 0'), findsOneWidget);
  });

  testWidgets('opening with its data, it builds at once', (tester) async {
    await tester.pumpWidget(
      testApp(
        FadeSwitcher(value: 1, child: TitleScaffold(sections: _sections(3))),
      ),
    );
    expect(find.text('section 2'), findsOneWidget);
  });
}
