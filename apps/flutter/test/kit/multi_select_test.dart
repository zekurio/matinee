import 'package:flutter/material.dart' show Material, MaterialApp, TextField;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';

/// A field with [MultiSelect]'s look on a 360-wide page, its value kept where
/// the test can see it.
Future<List<String>> _pump(
  WidgetTester tester, {
  List<String> value = const [],
  double width = 360,
  List<MultiSelectChoice> choices = const [
    MultiSelectChoice(value: 'drama', label: 'Drama', count: '12'),
    MultiSelectChoice(value: 'comedy', label: 'Comedy', count: '4'),
    MultiSelectChoice(value: 'horror', label: 'Horror', count: '7'),
  ],
}) async {
  tester.view.physicalSize = Size(width, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final current = [...value];
  late StateSetter setOuter;
  await tester.pumpWidget(
    MaterialApp(
      locale: const Locale('en'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Material(
        child: MatineeTheme.wrap(
          matineeDark,
          StatefulBuilder(
            builder: (context, setState) {
              setOuter = setState;
              return Align(
                alignment: Alignment.topLeft,
                child: SizedBox(
                  width: width,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: MultiSelect(
                      choices: choices,
                      value: current,
                      onChanged: (next) => setOuter(() {
                        current
                          ..clear()
                          ..addAll(next);
                      }),
                      placeholder: 'Add a genre',
                      label: 'Genres',
                      empty: 'No genre by that name',
                      removeLabel: (label) => 'Remove $label',
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    ),
  );
  return current;
}

/// A row under the field, by the words a screen reader hears and its count.
Finder _choice(String label) => find.byWidgetPredicate(
  (widget) => widget is PressIndication && widget.label == label,
);

/// A chip's × inside the field.
Finder _remove(String label) => find.byWidgetPredicate(
  (widget) => widget is PressIndication && widget.label == label,
);

void main() {
  testWidgets('picking values keeps each as a chip in the field', (
    tester,
  ) async {
    final value = await _pump(tester);
    expect(find.text('Drama'), findsNothing);
    expect(value, isEmpty);

    await tester.tap(find.byType(TextField));
    await tester.pumpAndSettle();
    expect(find.text('Drama'), findsOneWidget);
    expect(find.text('12'), findsOneWidget);

    await tester.tap(_choice('Drama, 12'));
    await tester.pumpAndSettle();
    expect(value, ['drama']);
    // The row stays, ticked, and the chip joins it in the field.
    expect(find.text('Drama'), findsNWidgets(2));
    expect(_remove('Remove Drama'), findsOneWidget);

    await tester.tap(_choice('Comedy, 4'));
    await tester.pumpAndSettle();
    expect(value, ['drama', 'comedy']);
    expect(_remove('Remove Drama'), findsOneWidget);
    expect(_remove('Remove Comedy'), findsOneWidget);
  });

  testWidgets('typing narrows the list, and a chosen chip comes off', (
    tester,
  ) async {
    final value = await _pump(tester, value: const ['drama']);
    await tester.tap(find.byType(TextField));
    await tester.pumpAndSettle();
    expect(_choice('Comedy, 4'), findsOneWidget);
    expect(_choice('Horror, 7'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'com');
    await tester.pumpAndSettle();
    expect(_choice('Comedy, 4'), findsOneWidget);
    expect(_choice('Horror, 7'), findsNothing);
    expect(_choice('Drama, 12'), findsNothing);

    await tester.enterText(find.byType(TextField), 'zzz');
    await tester.pumpAndSettle();
    expect(find.text('No genre by that name'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '');
    await tester.pumpAndSettle();
    await tester.tap(_remove('Remove Drama'));
    await tester.pumpAndSettle();
    expect(value, isEmpty);
    expect(_remove('Remove Drama'), findsNothing);
  });

  testWidgets('a value the choices no longer hold is named by itself', (
    tester,
  ) async {
    await _pump(tester, value: const ['lost']);
    expect(find.text('lost'), findsOneWidget);
    expect(_remove('Remove lost'), findsOneWidget);
  });
}
