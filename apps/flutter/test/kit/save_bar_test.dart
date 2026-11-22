import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';

/// The bar as a phone shows it, 360 dp wide unless [width] says otherwise,
/// with the German labels that wrapped beside the buttons before.
Future<void> _pump(
  WidgetTester tester, {
  SaveBarStatus status = SaveBarStatus.unsaved,
  String? message,
  int attention = 0,
  bool settle = true,
  double width = 360,
}) async {
  tester.view.physicalSize = Size(width, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    Directionality(
      textDirection: TextDirection.ltr,
      child: MediaQuery(
        data: MediaQueryData(size: Size(width, 800)),
        child: MatineeTheme.wrap(
          matineeDark,
          Align(
            alignment: Alignment.bottomCenter,
            child: SaveBar(
              status: status,
              statusLabel: status == SaveBarStatus.failed
                  ? 'Änderungen konnten nicht gespeichert werden'
                  : 'Ungespeicherte Änderungen',
              resetLabel: 'Zurücksetzen',
              saveLabel: switch (status) {
                SaveBarStatus.saving => 'Wird gespeichert …',
                SaveBarStatus.saved => 'Gespeichert',
                SaveBarStatus.failed => 'Erneut versuchen',
                SaveBarStatus.unsaved => 'Speichern',
              },
              message: message,
              attention: attention,
              onReset: () {},
              onSave: () {},
            ),
          ),
        ),
      ),
    ),
  );
  if (settle) {
    await tester.pumpAndSettle();
  }
}

/// What the bar reads out without showing it.
Finder _said(String label) => find.byWidgetPredicate(
  (widget) => widget is Semantics && widget.properties.label == label,
);

final _savedTick = find.byWidgetPredicate(
  (widget) => widget is KitIcon && widget.svg == Lucide.check,
);

void main() {
  // The bug it pins: "Ungespeicherte Änderungen" wrapped onto two lines beside
  // Reset and Save at a phone's width, and the full-width slab looked bolted on.
  testWidgets('a phone has Reset and Save side by side, half each', (
    tester,
  ) async {
    await _pump(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('Ungespeicherte Änderungen'), findsNothing);
    expect(_said('Ungespeicherte Änderungen'), findsOneWidget);
    final reset = find.widgetWithText(MatineeButton, 'Zurücksetzen');
    final save = find.widgetWithText(MatineeButton, 'Speichern');
    expect(tester.getSize(reset).width, tester.getSize(save).width);
    expect(tester.getSize(find.byType(SaveBar)).width, 360);
  });

  testWidgets('a wide bar has the status beside the buttons', (tester) async {
    // Wide enough for the test font, whose every letter is a square.
    await _pump(tester, width: 1100);

    expect(tester.takeException(), isNull);
    final status = find.text('Ungespeicherte Änderungen');
    expect(status, findsOneWidget);
    expect(
      tester.getCenter(status).dy,
      moreOrLessEquals(tester.getCenter(find.text('Speichern')).dy, epsilon: 1),
    );
  });

  testWidgets('saving spins, then shows a tick, then a failure stays', (
    tester,
  ) async {
    await _pump(tester, status: SaveBarStatus.saving, settle: false);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(Spinner), findsOneWidget);
    expect(_said('Wird gespeichert …'), findsOneWidget);

    await _pump(tester, status: SaveBarStatus.saved);
    expect(find.byType(Spinner), findsNothing);
    expect(find.text('Gespeichert'), findsOneWidget);
    expect(_savedTick, findsOneWidget);

    await _pump(
      tester,
      status: SaveBarStatus.failed,
      message: 'Der Server hat abgelehnt.',
    );
    expect(
      find.text(
        'Änderungen konnten nicht gespeichert werden. '
        'Der Server hat abgelehnt.',
      ),
      findsOneWidget,
    );
    expect(find.text('Erneut versuchen'), findsOneWidget);
  });

  testWidgets('an attempt to leave shakes the bar', (tester) async {
    await _pump(tester);
    final before = tester.getTopLeft(find.text('Zurücksetzen')).dx;

    await _pump(tester, attention: 1, settle: false);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 60));

    expect(tester.getTopLeft(find.text('Zurücksetzen')).dx, isNot(before));
  });
}
