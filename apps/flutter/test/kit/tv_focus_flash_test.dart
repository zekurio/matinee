import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/kit/tv/tv.dart';

// The focus flash: in TV Settings a category is selected as it takes focus,
// and the row that took focus flashed the accent and the selected fill before
// turning into the focused look, while the row that lost it dropped its icon
// to the resting color under a pill still white, so the icon vanished. A
// control takes focus from the look it had before focus arrived and leaves it
// for the look it has now, and everything in it follows the same animation.

const _rows = ['A', 'B', 'C'];

/// [_rows] as quiet list items with icons, where focus selects, as the
/// Settings categories do, and an `Other` row under them that doesn't.
Future<void> _list(WidgetTester tester) async {
  tester.view.physicalSize = const Size(960, 540);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  var selected = 'A';
  await tester.pumpWidget(
    WidgetsApp(
      color: const Color(0xFF000000),
      builder: (context, _) => MatineeTheme.wrap(
        matineeDark,
        TvFocusRules(
          child: StatefulBuilder(
            builder: (context, setState) => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final row in _rows)
                  TvListItem(
                    key: ValueKey(row),
                    title: row,
                    icon: Lucide.check,
                    quiet: true,
                    selected: row == selected,
                    autofocus: row == selected,
                    onFocusChange: (focused) {
                      if (focused) setState(() => selected = row);
                    },
                    onPressed: () {},
                  ),
                TvListItem(
                  key: const ValueKey('Other'),
                  title: 'Other',
                  onPressed: () {},
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Color _title(WidgetTester tester, String row) =>
    tester.widget<Text>(find.text(row)).style!.color!;

Color _icon(WidgetTester tester, String row) => tester
    .widget<KitIcon>(
      find.descendant(
        of: find.byKey(ValueKey(row)),
        matching: find.byType(KitIcon),
      ),
    )
    .color!;

Color _fill(WidgetTester tester, String row) => tester
    .widget<ColoredBox>(
      find
          .descendant(
            of: find.byKey(ValueKey(row)),
            matching: find.byType(ColoredBox),
          )
          .first,
    )
    .color;

List<double> _channels(Color color) => [color.r, color.g, color.b, color.a];

/// Whether [color] lies on the straight line from [from] to [to], as a lerp
/// between them does, and not off towards some third color.
bool _between(Color color, Color from, Color to) {
  final c = _channels(color);
  final a = _channels(from);
  final b = _channels(to);
  var widest = 0;
  for (var i = 1; i < 4; i++) {
    if ((b[i] - a[i]).abs() > (b[widest] - a[widest]).abs()) widest = i;
  }
  final s = (c[widest] - a[widest]) / (b[widest] - a[widest]);
  if (s < -.01 || s > 1.01) return false;
  for (var i = 0; i < 4; i++) {
    if ((a[i] + (b[i] - a[i]) * s - c[i]).abs() > .02) return false;
  }
  return true;
}

/// Moves focus down and pumps the animations through frame by frame,
/// calling [frame] on each.
Future<void> _down(WidgetTester tester, void Function() frame) async {
  await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
  for (var i = 0; i < 60; i++) {
    await tester.pump(const Duration(milliseconds: 8));
    frame();
  }
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a row that focus selects takes focus without the selected '
      'look, and the row it leaves keeps its icon (the focus flash)', (
    tester,
  ) async {
    await _list(tester);
    final colors = matineeDark;
    final restIcon = colors.foreground.withValues(alpha: .7);
    await _down(tester, () {
      final title = _title(tester, 'B');
      final icon = _icon(tester, 'B');
      expect(
        _between(title, colors.foreground, colors.background),
        isTrue,
        reason: 'the entering title is $title, off its way from rest to focus',
      );
      expect(
        _between(icon, restIcon, colors.background),
        isTrue,
        reason: 'the entering icon is $icon, off its way from rest to focus',
      );
      if (_fill(tester, 'A').a > .5) {
        expect(
          _icon(tester, 'A'),
          isNot(restIcon),
          reason: "the leaving icon is at rest while its pill isn't",
        );
      }
      expect(
        _between(_icon(tester, 'A'), colors.background, restIcon),
        isTrue,
        reason: 'the leaving icon is off its way from focus to rest',
      );
    });
    expect(_title(tester, 'B'), colors.background);
    expect(_title(tester, 'A'), colors.foreground);
  });

  testWidgets('a row that stays selected as focus leaves fades to the accent', (
    tester,
  ) async {
    await _list(tester);
    final colors = matineeDark;
    await _down(tester, () {});
    await _down(tester, () {});
    expect(_title(tester, 'C'), colors.background);
    await _down(tester, () {
      expect(
        _between(_title(tester, 'C'), colors.background, colors.accent),
        isTrue,
      );
      expect(
        _between(_icon(tester, 'C'), colors.background, colors.accent),
        isTrue,
      );
    });
    expect(_title(tester, 'C'), colors.accent);
  });
}
