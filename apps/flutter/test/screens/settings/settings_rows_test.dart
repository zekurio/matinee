import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/settings/settings_rows.dart';

/// A row that opens something, a switch row, and another that opens
/// something, 360 wide. [onChanged] hears the switch row.
Future<void> _pump(WidgetTester tester, {ValueChanged<bool>? onChanged}) =>
    tester.pumpWidget(
      MaterialApp(
        home: MatineeTheme.wrap(
          matineeLight,
          MediaQuery(
            data: const MediaQueryData(),
            child: Align(
              alignment: Alignment.topLeft,
              child: SizedBox(
                width: 360,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    LinkRow(title: 'Quality', value: 'Auto', onPressed: () {}),
                    SwitchRow(
                      title: 'Autoplay',
                      checked: false,
                      onChanged: onChanged ?? (_) {},
                    ),
                    LinkRow(title: 'Subtitles', onPressed: () {}),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );

/// The row that holds keyboard focus, by its title.
String? _focused() {
  String? title;
  FocusManager.instance.primaryFocus?.context?.visitAncestorElements((element) {
    title = switch (element.widget) {
      LinkRow(:final title) || SwitchRow(:final title) => title,
      _ => null,
    };
    return title == null;
  });
  return title;
}

void main() {
  // The bug it pins: the switch in the row was a second thing to focus and
  // to tap, inside the row that already toggles it.
  testWidgets('a switch row is one stop for the keyboard', (tester) async {
    await _pump(tester);
    final stops = <String?>[];
    for (var press = 0; press < 3; press++) {
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      stops.add(_focused());
    }
    expect(stops, ['Quality', 'Autoplay', 'Subtitles']);
  });

  testWidgets('a tap anywhere on a switch row toggles it once', (tester) async {
    final heard = <bool>[];
    await _pump(tester, onChanged: heard.add);
    final track = tester.getRect(find.byType(SwitchTrack));
    await tester.tapAt(track.center);
    await tester.tapAt(track.topCenter + const Offset(0, 1));
    await tester.tap(find.text('Autoplay'));
    expect(heard, [true, true, true]);
  });
}
