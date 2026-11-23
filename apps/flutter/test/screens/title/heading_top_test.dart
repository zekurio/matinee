import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/title/title_parts.dart';

void main() {
  // The bug it pins: on a phone held sideways the backdrop is so short
  // that the poster started under Back and Home.
  for (final (name, size, top) in const [
    ('a phone on its side', Size(844, 390), 0.0),
    ('a phone on its side with a status bar', Size(844, 390), 24.0),
    ('a tablet', Size(1280, 800), 24.0),
  ]) {
    testWidgets('on $name the heading starts below the buttons', (
      tester,
    ) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.view.padding = FakeViewPadding(top: top);
      addTearDown(tester.view.reset);
      late double heading;
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          theme: MatineeTheme.data(matineeDark),
          home: Builder(
            builder: (context) {
              heading = headingTop(context);
              return const Stack(children: [ItemTopBar()]);
            },
          ),
        ),
      );
      await tester.pumpAndSettle();

      final buttons = find.byType(RoundIconButton);
      expect(buttons, findsNWidgets(2));
      for (final button in buttons.evaluate()) {
        expect(
          tester.getRect(find.byWidget(button.widget)).bottom,
          lessThanOrEqualTo(heading),
        );
      }
    });
  }
}
