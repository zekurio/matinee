import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';

/// The bar as a phone shows it, 360 dp wide unless [width] says otherwise,
/// with the German labels that wrapped beside the buttons before.
Future<void> _pump(
  WidgetTester tester, {
  SaveBarStatus status = SaveBarStatus.unsaved,
  String? message,
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
              onReset: () {},
              onSave: () {},
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  // The bug it pins: a wide bar showed a failure twice, over the buttons and
  // beside them, and a screen reader heard the status once for the bar and
  // again for each place it showed.
  testWidgets('a failure shows once and reads once, at either width', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    const status = 'Änderungen konnten nicht gespeichert werden';
    const reason = 'Der Server hat abgelehnt.';
    for (final width in [360.0, 1400.0]) {
      await _pump(
        tester,
        status: SaveBarStatus.failed,
        message: reason,
        width: width,
      );
      expect(find.textContaining(status), findsOneWidget);
      expect(find.textContaining(reason), findsOneWidget);
      // Beside the buttons on the wide bar, with the reason over them.
      expect(find.text(status), width > 360 ? findsOneWidget : findsNothing);
      expect(
        tester.getSemantics(find.bySemanticsLabel(RegExp(status))).label,
        '$status. $reason',
      );
    }

    await _pump(tester, width: 1400);
    expect(
      tester.getSemantics(find.bySemanticsLabel(RegExp('Ungespeicherte'))),
      isSemantics(label: 'Ungespeicherte Änderungen', isLiveRegion: true),
    );
    semantics.dispose();
  });
}
