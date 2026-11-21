import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/kit/tv/tv.dart';

/// A field between two buttons under the TV's focus rules, at 960 by 540.
Future<(TextEditingController, FocusNode)> _field(
  WidgetTester tester, {
  String? error,
}) async {
  tester.view.physicalSize = const Size(960, 540);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final controller = TextEditingController();
  final node = FocusNode();
  addTearDown(controller.dispose);
  addTearDown(node.dispose);
  Widget button(String label) => TvFocusable(
    label: label,
    onPressed: () {},
    builder: (context, focused) => SizedBox(height: 48, child: Text(label)),
  );
  await tester.pumpWidget(
    WidgetsApp(
      color: const Color(0xFF000000),
      builder: (context, _) => MatineeTheme.wrap(
        matineeDark,
        TvFocusRules(
          child: Padding(
            padding: const EdgeInsets.all(40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                button('Above'),
                TvTextField(
                  controller: controller,
                  focusNode: node,
                  placeholder: 'media.example.com',
                  autofocus: true,
                  error: error,
                ),
                button('Below'),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (controller, node);
}

String? _focusedLabel() {
  final widget = FocusManager.instance.primaryFocus?.context
      ?.findAncestorWidgetOfExactType<TvFocusable>();
  return widget?.label;
}

void main() {
  testWidgets('is a list row tall, in the TV title type', (tester) async {
    final (controller, _) = await _field(tester);
    controller.text = 'media.example.com';
    await tester.pump();

    expect(
      tester.getSize(find.byType(TvTextField)).height,
      greaterThanOrEqualTo(TvTextField.height),
    );
    final text = tester.widget<EditableText>(find.byType(EditableText));
    expect(text.style.fontSize, TvType.title.size);
  });

  testWidgets('Up and Down leave it for the controls around it', (
    tester,
  ) async {
    final (controller, node) = await _field(tester);
    expect(node.hasPrimaryFocus, isTrue);
    controller.text = 'media.example.com';

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(_focusedLabel(), 'Below');

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
    await tester.pumpAndSettle();
    expect(node.hasPrimaryFocus, isTrue);

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
    await tester.pumpAndSettle();
    expect(_focusedLabel(), 'Above');
    expect(controller.text, 'media.example.com');
  });

  testWidgets('an error shows under it', (tester) async {
    await _field(tester, error: "Can't reach that address.");
    expect(find.text("Can't reach that address."), findsOneWidget);
  });
}
