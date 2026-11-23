import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';

/// The room the keyboard leaves on a 360 × 800 phone with a 300 keyboard.
const _above = 500.0;

void main() {
  Future<void> pump(WidgetTester tester, Widget home) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(theme: MatineeTheme.data(matineeDark), home: home),
    );
    await tester.pumpAndSettle();
  }

  Future<void> raiseKeyboard(WidgetTester tester) async {
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    await tester.pumpAndSettle();
  }

  // The bug it pins: a page's fields stayed under the keyboard, as the
  // library editor's and Identify's did.
  testWidgets('a page ends where the keyboard starts', (tester) async {
    const body = Key('body');
    await pump(
      tester,
      const PageFrame(
        title: 'Page',
        child: SizedBox.expand(key: body),
      ),
    );
    expect(tester.getRect(find.byKey(body)).bottom, 800);

    await raiseKeyboard(tester);
    expect(tester.getRect(find.byKey(body)).bottom, _above);
  });

  // One inside another, a sheet in a page, makes room once, not twice.
  testWidgets('a room inside a room makes room once', (tester) async {
    const body = Key('body');
    await pump(
      tester,
      const PageFrame(
        title: 'Page',
        child: KeyboardRoom(child: SizedBox.expand(key: body)),
      ),
    );
    await raiseKeyboard(tester);
    expect(tester.getRect(find.byKey(body)).bottom, _above);
  });

  // The bug it pins: a dialog stayed centered on the whole screen, so the
  // keyboard covered its field and its buttons.
  testWidgets('a dialog sits above the keyboard and scrolls', (tester) async {
    const field = Key('field');
    late BuildContext opener;
    await pump(
      tester,
      Builder(
        builder: (context) {
          opener = context;
          return const SizedBox.expand();
        },
      ),
    );
    Dialog.show<void>(
      opener,
      builder: (context) => Dialog(
        title: 'Dialog',
        actions: [MatineeButton(onPressed: () {}, child: const Text('Save'))],
        child: const Column(
          children: [
            SizedBox(height: 400),
            SizedBox(key: field, height: 40, width: 200),
          ],
        ),
      ),
    ).ignore();
    await tester.pumpAndSettle();
    await raiseKeyboard(tester);

    expect(tester.takeException(), isNull);
    final dialog = tester.getRect(find.byType(Dialog));
    expect(dialog.bottom, lessThanOrEqualTo(_above));
    expect(tester.getRect(find.text('Save')).bottom, lessThan(_above));
  });
}
