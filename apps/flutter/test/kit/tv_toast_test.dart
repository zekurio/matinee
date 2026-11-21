import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/kit/tv/tv.dart';

void main() {
  testWidgets("a TV's toast reads in the TV's body type", (tester) async {
    final state = ToastState();
    addTearDown(state.dispose);
    await tester.pumpWidget(
      WidgetsApp(
        color: const Color(0xFF000000),
        builder: (context, _) => MatineeTheme.wrap(
          matineeDark,
          Center(child: ToastHost(state: state, tv: true)),
        ),
      ),
    );

    state.show(
      "Couldn't save",
      description: 'The server said no.',
      kind: ToastKind.error,
    );
    await tester.pump();

    final message = tester.widget<Text>(find.text("Couldn't save"));
    expect(message.style?.fontSize, TvType.body.size);
    expect(find.text('The server said no.'), findsOneWidget);
    expect(
      tester.getSize(find.byType(ToastHost)).width,
      lessThanOrEqualTo(560),
    );
    state.dismiss();
    await tester.pump();
  });
}
