import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';

void main() {
  double opacity(WidgetTester tester) => tester
      .widget<FadeTransition>(
        find
            .ancestor(
              of: find.byType(Spinner),
              matching: find.byType(FadeTransition),
            )
            .first,
      )
      .opacity
      .value;

  // A page whose read comes back quickly opens without a spinner flashing
  // first; one that takes a while shows it.
  testWidgets('the spinner waits before it shows', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MatineeTheme.data(matineeDark),
        home: const LoadingState(label: 'Loading'),
      ),
    );
    expect(opacity(tester), 0);
    await tester.pump(const Duration(milliseconds: 350));
    expect(opacity(tester), 0);
    await tester.pump(const Duration(milliseconds: 300));
    expect(opacity(tester), 1);
    // A screen reader hears it from the start.
    expect(find.bySemanticsLabel('Loading'), findsOneWidget);
  });
}
