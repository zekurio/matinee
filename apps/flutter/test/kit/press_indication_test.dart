import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/motion.dart';
import 'package:matinee/kit/press_indication.dart';

const _rest = Color(0x00FFFFFF);
const _pressed = Color(0x1AFFFFFF);

/// A button that fills by its state, as the kit's do, and every state it
/// was drawn in.
Future<List<PressState>> _button(
  WidgetTester tester, {
  bool reduceMotion = false,
}) async {
  final drawn = <PressState>[];
  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(disableAnimations: reduceMotion),
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Center(
          child: PressIndication(
            onPressed: () {},
            builder: (context, state) {
              drawn.add(state);
              return PressFill(
                width: 100,
                height: 40,
                color: state == PressState.pressed ? _pressed : _rest,
              );
            },
          ),
        ),
      ),
    ),
  );
  return drawn;
}

Color? _fill(WidgetTester tester) {
  final box = tester.widget<DecoratedBox>(
    find.descendant(
      of: find.byType(PressFill),
      matching: find.byType(DecoratedBox),
    ),
  );
  // SAFETY: PressFill only ever paints a BoxDecoration.
  return (box.decoration as BoxDecoration).color;
}

void main() {
  testWidgets('a quick tap still shows its press, for long enough to see', (
    tester,
  ) async {
    final drawn = await _button(tester);
    // Down and up in one frame, as a quick tap's come.
    await tester.tap(find.byType(PressFill));
    await tester.pump();
    expect(drawn.last, PressState.pressed);

    await tester.pump(KitMotion.press ~/ 2);
    expect(drawn.last, PressState.pressed);
    await tester.pump(KitMotion.press);
    expect(drawn.last, PressState.idle);
    await tester.pumpAndSettle();
  });

  testWidgets('the fill comes in quickly and goes softly', (tester) async {
    await _button(tester);
    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(PressFill)),
    );
    // Past the tap's wait before it counts as a press.
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(KitMotion.press ~/ 2);
    final coming = _fill(tester)!.a;
    expect(coming, greaterThan(_rest.a));
    expect(coming, lessThan(_pressed.a));
    await tester.pump(KitMotion.press);
    expect(_fill(tester), _pressed);

    await gesture.up();
    await tester.pump();
    await tester.pump(KitMotion.release ~/ 2);
    final going = _fill(tester)!.a;
    expect(going, greaterThan(_rest.a));
    expect(going, lessThan(_pressed.a));
    await tester.pumpAndSettle();
    expect(_fill(tester)!.a, _rest.a);
  });

  testWidgets('with less motion asked for, the fill changes at once', (
    tester,
  ) async {
    await _button(tester, reduceMotion: true);
    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(PressFill)),
    );
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump();
    expect(_fill(tester), _pressed);
    await gesture.up();
    await tester.pump();
    expect(_fill(tester)!.a, _rest.a);
  });
}
