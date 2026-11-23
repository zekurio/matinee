import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/settings/settings_rows.dart';

/// A row that opens something, a switch row, and another that opens
/// something, 360 wide, at [textScale]. [onChanged] hears the switch row.
Future<void> _pump(
  WidgetTester tester, {
  ValueChanged<bool>? onChanged,
  double textScale = 1,
}) => tester.pumpWidget(
  MaterialApp(
    home: MatineeTheme.wrap(
      matineeLight,
      MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
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
  testWidgets('a switch row is as tall as a row with a value', (tester) async {
    await _pump(tester);
    expect(tester.getSize(find.byType(SwitchRow)).height, 52);
    expect(
      tester.getSize(find.byType(SwitchRow)),
      tester.getSize(find.widgetWithText(LinkRow, 'Quality')),
    );
    // The track is taller than the title's line, and still inside the row.
    final row = tester.getRect(find.byType(SwitchRow));
    final track = tester.getRect(find.byType(SwitchTrack));
    expect(track.size, SwitchTrack.size);
    expect(track.top, greaterThan(row.top));
    expect(track.bottom, lessThan(row.bottom));
    expect(track.center.dy, row.center.dy);
  });

  // The group rows on an account's access page are built from it too.
  testWidgets('a row switch takes one line of the title', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: MatineeTheme.wrap(
          matineeLight,
          const Center(child: RowSwitch(checked: true)),
        ),
      ),
    );
    expect(
      tester.getSize(find.byType(RowSwitch)),
      Size(SwitchTrack.size.width, KitText.base.lineHeight),
    );
  });

  testWidgets('the switch ends where the other rows\' chevrons do', (
    tester,
  ) async {
    await _pump(tester);
    final chevron = find.descendant(
      of: find.widgetWithText(LinkRow, 'Quality'),
      matching: find.byType(KitIcon),
    );
    expect(
      tester.getRect(find.byType(SwitchTrack)).right,
      tester.getRect(chevron).right,
    );
  });

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

  testWidgets('a switch row grows with the text and keeps its switch', (
    tester,
  ) async {
    await _pump(tester, textScale: 2);
    expect(
      tester.getSize(find.byType(SwitchRow)),
      tester.getSize(find.widgetWithText(LinkRow, 'Subtitles')),
    );
    expect(tester.getSize(find.byType(SwitchTrack)), SwitchTrack.size);
    expect(tester.takeException(), isNull);
  });
}
