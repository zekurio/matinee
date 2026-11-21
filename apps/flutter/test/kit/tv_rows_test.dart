import 'dart:math' as math;

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/kit/tv/tv.dart';

const _screen = Size(960, 540);

/// A TV page of [rows] poster rows in a [TvPinnedList] under a fixed header
/// [header] tall, as Home's under its hero, in a 960 by 540 window.
Future<(TvFocusMemory, ScrollController)> _page(
  WidgetTester tester, {
  required int rows,
  required double header,
}) async {
  tester.view.physicalSize = _screen;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final memory = TvFocusMemory();
  addTearDown(memory.dispose);
  final scroll = ScrollController();
  addTearDown(scroll.dispose);
  await tester.pumpWidget(
    WidgetsApp(
      color: const Color(0xFF000000),
      builder: (context, _) => MatineeTheme.wrap(
        matineeDark,
        TvFocusRules(
          child: Builder(
            builder: (context) {
              memory.restore(context, () => ('0', '0'));
              return Column(
                children: [
                  SizedBox(height: header),
                  Expanded(
                    child: TvPinnedList(
                      controller: scroll,
                      children: [
                        for (var row = 0; row < rows; row++)
                          TvRow(
                            title: 'Row $row',
                            row: '$row',
                            memory: memory,
                            height: 186,
                            itemCount: 8,
                            itemBuilder: (context, index) => TvArtCard(
                              toneKey: '$row/$index',
                              aspect: 2 / 3,
                              width: TvCards.posterWidth,
                              focusNode: memory.node('$row', '$index'),
                              label: '$row/$index',
                              onPressed: () {},
                              children: const [],
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (memory, scroll);
}

/// The focused card, wherever it is.
Rect _focused() => FocusManager.instance.primaryFocus!.rect;

/// The focused card lies inside what shows under the header.
void _expectFocusedShown(double header, String when) {
  final card = _focused();
  final shown = Rect.fromLTRB(0, header, _screen.width, _screen.height);
  expect(
    card.top >= shown.top - .5 && card.bottom <= shown.bottom + .5,
    isTrue,
    reason: '$when: the focused card $card left $shown',
  );
}

/// Where the last row's heading is.
double _lastTop(WidgetTester tester, int rows) =>
    tester.getTopLeft(find.text('Row ${rows - 1}', skipOffstage: false)).dy;

void main() {
  for (final rows in [1, 2, 3]) {
    testWidgets('$rows rows under a tall header: the D-pad and a fling never '
        'take the focused card out of view, nor the last row above its '
        'stop', (tester) async {
      // Home's hero leaves its rows a little under half the screen.
      const header = 300.0;
      final (_, scroll) = await _page(tester, rows: rows, header: header);
      Future<void> step(LogicalKeyboardKey key, String when) async {
        final from = scroll.offset;
        await tester.sendKeyEvent(key);
        // Through the scroll, frame by frame, so an overshoot that settles
        // back is caught too.
        final seen = <double>[];
        for (var i = 0; i < 8; i++) {
          await tester.pump(const Duration(milliseconds: 40));
          seen.add(scroll.offset);
          expect(
            _lastTop(tester, rows),
            greaterThanOrEqualTo(header - .5),
            reason: '$when, frame $i: the last row went into the header',
          );
        }
        await tester.pumpAndSettle();
        _expectFocusedShown(header, when);
        final to = scroll.offset;
        for (final (i, at) in seen.indexed) {
          expect(
            at >= math.min(from, to) - .5 && at <= math.max(from, to) + .5,
            isTrue,
            reason: '$when, frame $i: scrolled to $at, past $from to $to',
          );
        }
      }

      // Down to the last row and past it, then back up.
      for (var down = 0; down < rows + 2; down++) {
        await step(LogicalKeyboardKey.arrowDown, 'down $down');
      }
      expect(
        FocusManager.instance.primaryFocus!.debugLabel,
        contains('${rows - 1}'),
      );
      final stop = _lastTop(tester, rows);
      for (var up = 0; up < rows + 1; up++) {
        await step(LogicalKeyboardKey.arrowUp, 'up $up');
      }
      for (var down = 0; down < rows + 1; down++) {
        await step(LogicalKeyboardKey.arrowDown, 'down again $down');
      }
      expect(_lastTop(tester, rows), moreOrLessEquals(stop, epsilon: .5));

      // A touch or a mouse flings the rows up: the last row stops where the
      // D-pad left it, the focused card in view, frame by frame.
      await tester.fling(
        find.text('Row ${rows - 1}', skipOffstage: false),
        const Offset(0, -400),
        3000,
      );
      for (var i = 0; i < 30; i++) {
        await tester.pump(const Duration(milliseconds: 40));
        expect(
          _lastTop(tester, rows),
          greaterThanOrEqualTo(stop - .5),
          reason: 'flung, frame $i: the last row went above its stop',
        );
      }
      await tester.pumpAndSettle();
      _expectFocusedShown(header, 'flung');
      expect(_lastTop(tester, rows), greaterThanOrEqualTo(stop - .5));
    });
  }

  testWidgets('rows that fit on the screen never scroll, by D-pad or fling', (
    tester,
  ) async {
    const header = 60.0;
    final (_, scroll) = await _page(tester, rows: 1, header: header);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(scroll.offset, 0);
    await tester.fling(find.text('Row 0'), const Offset(0, -400), 3000);
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 40));
      expect(scroll.offset, 0, reason: 'frame $i');
    }
    await tester.pumpAndSettle();
    expect(scroll.offset, 0);
    _expectFocusedShown(header, 'flung');
  });

  testWidgets('a drag that leaves the focused card out comes back to it', (
    tester,
  ) async {
    const header = 300.0;
    // Focus stays on the first row while a drag takes the page down to the
    // last one.
    final (_, scroll) = await _page(tester, rows: 3, header: header);
    await tester.drag(find.text('Row 0'), const Offset(0, -300));
    await tester.pump();
    expect(scroll.offset, greaterThan(200), reason: 'the drag moved it');
    await tester.pumpAndSettle();
    _expectFocusedShown(header, 'dragged');
    expect(scroll.offset, 0, reason: 'back to the first row, where focus is');
  });
}
