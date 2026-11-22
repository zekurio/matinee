import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/kit/tv/tv.dart';

/// A page with one button that opens a panel titled "Panel" of [sections]
/// headed groups, three rows each, in a 960 by 540 window.
Future<void> _openPanel(WidgetTester tester, {int sections = 6}) async {
  tester.view.physicalSize = const Size(960, 540);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    WidgetsApp(
      color: const Color(0xFF000000),
      pageRouteBuilder: <T>(settings, builder) => PageRouteBuilder<T>(
        settings: settings,
        pageBuilder: (context, _, _) => builder(context),
      ),
      builder: (context, child) =>
          MatineeTheme.wrap(matineeDark, TvFocusRules(child: child!)),
      home: Builder(
        builder: (context) => Center(
          child: TvButton(
            label: 'Open',
            autofocus: true,
            onPressed: () => showTvPanel<void>(
              context,
              title: 'Panel',
              builder: (context) => [
                for (var section = 0; section < sections; section++) ...[
                  TvListHeading('Section $section'),
                  for (var row = 0; row < 3; row++)
                    TvListItem(
                      title: 'Row $section.$row',
                      quiet: true,
                      onPressed: () {},
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.sendKeyEvent(LogicalKeyboardKey.select);
  await tester.pumpAndSettle();
  expect(find.text('Panel'), findsOneWidget);
}

/// The section and row of the focused row, from its label.
(int, int)? _focusedRow() {
  final label = FocusManager.instance.primaryFocus?.context
      ?.findAncestorWidgetOfExactType<TvListItem>()
      ?.title;
  final match = RegExp(r'^Row (\d+)\.(\d+)$').firstMatch(label ?? '');
  if (match == null) return null;
  return (int.parse(match[1]!), int.parse(match[2]!));
}

void main() {
  testWidgets("a section's heading shows above its first row as focus comes "
      'back up, clear of the title', (tester) async {
    await _openPanel(tester);
    final under = tester.getRect(find.text('Panel')).bottom;
    void expectHeadingShown(String when) {
      final (section, row) = _focusedRow()!;
      if (row != 0) return;
      final heading = tester.getRect(
        find.text('Section $section', skipOffstage: false),
      );
      expect(
        heading.top,
        greaterThanOrEqualTo(under),
        reason: '$when: Section $section at $heading, under the title $under',
      );
    }

    for (var down = 0; down < 17; down++) {
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await tester.pumpAndSettle();
      expectHeadingShown('down $down');
    }
    expect(_focusedRow(), (5, 2));
    for (var up = 0; up < 17; up++) {
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
      await tester.pumpAndSettle();
      expectHeadingShown('up $up');
    }
    expect(_focusedRow(), (0, 0));
  });
}
