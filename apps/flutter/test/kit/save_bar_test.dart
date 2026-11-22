import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';

/// The bar as a phone shows it, 360 dp wide, with the German labels that
/// wrapped beside the buttons before.
Future<void> _pump(
  WidgetTester tester, {
  SaveBarStatus status = SaveBarStatus.unsaved,
  String? message,
  int attention = 0,
  bool settle = true,
}) async {
  tester.view.physicalSize = const Size(360, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    Directionality(
      textDirection: TextDirection.ltr,
      child: MediaQuery(
        data: const MediaQueryData(size: Size(360, 800)),
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
                SaveBarStatus.unsaved => 'Änderungen speichern',
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

final _savedTick = find.byWidgetPredicate(
  (widget) => widget is KitIcon && widget.svg == Lucide.check,
);

void main() {
  // The bug it pins: "Ungespeicherte Änderungen" wrapped onto two lines beside
  // Reset and Save at a phone's width, and the full-width slab looked bolted on.
  testWidgets('a German bar fits a phone without wrapping its status', (
    tester,
  ) async {
    await _pump(tester);

    expect(tester.takeException(), isNull);
    final status = find.text('Ungespeicherte Änderungen');
    expect(status, findsOneWidget);
    expect(tester.getSize(status).height, lessThan(30));
    expect(find.text('Zurücksetzen'), findsOneWidget);
    expect(find.text('Änderungen speichern'), findsOneWidget);
    expect(tester.getSize(find.byType(SaveBar)).width, 360);
  });

  testWidgets('saving spins, then shows a tick, then a failure stays', (
    tester,
  ) async {
    await _pump(tester, status: SaveBarStatus.saving, settle: false);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(Spinner), findsOneWidget);
    expect(find.text('Wird gespeichert …'), findsOneWidget);

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
      find.text('Änderungen konnten nicht gespeichert werden'),
      findsOneWidget,
    );
    expect(find.text('Der Server hat abgelehnt.'), findsOneWidget);
    expect(find.text('Erneut versuchen'), findsOneWidget);
  });

  testWidgets('an attempt to leave shakes the bar', (tester) async {
    await _pump(tester);
    final before = tester.getTopLeft(find.text('Ungespeicherte Änderungen')).dx;

    await _pump(tester, attention: 1, settle: false);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 60));

    expect(
      tester.getTopLeft(find.text('Ungespeicherte Änderungen')).dx,
      isNot(before),
    );
  });
}
