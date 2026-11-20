import 'dart:ui' show Tristate;

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/settings/settings_rows.dart';

import '../media/harness.dart';

final _client = MockClient((request) async => http.Response('', 404));

/// A settings page's picker, capped as the settings pages are, over a
/// button's menu at its start.
Widget _page(TextDirection direction) => Directionality(
  textDirection: direction,
  child: Align(
    alignment: Alignment.topCenter,
    child: SizedBox(
      width: settingsWidth,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PickerRow<int>(
            title: 'Quality',
            options: const [(1, 'Original'), (2, '1080p'), (3, '720p')],
            current: 1,
            onPicked: (_) {},
          ),
          const SizedBox(height: 200),
          Menu(
            trigger: (context, toggle, isOpen, focus) => GestureDetector(
              onTap: toggle,
              child: const SizedBox(width: 80, height: 40, child: Text('More')),
            ),
            children: [MenuItem(label: 'Remove', onPressed: () {})],
          ),
        ],
      ),
    ),
  ),
);

void main() {
  setUpAll(loadFont);

  for (final direction in TextDirection.values) {
    testWidgets("a picker's menu opens under its value, ${direction.name}", (
      tester,
    ) async {
      await pumpScreen(
        tester,
        _page(direction),
        client: _client,
        size: const Size(1280, 800),
      );
      final row = tester.getRect(find.byType(PickerRow<int>));
      await tester.tap(find.text('Original'));
      await tester.pumpAndSettle();
      final panel = tester.getRect(find.byType(MenuPanel));
      expect(panel.top, greaterThanOrEqualTo(row.bottom));
      // Lined up with the row's end, where its value is, not the page's.
      if (direction == TextDirection.ltr) {
        expect(panel.right, moreOrLessEquals(row.right, epsilon: 1));
      } else {
        expect(panel.left, moreOrLessEquals(row.left, epsilon: 1));
      }
      expect(find.text('720p'), findsOneWidget);
    });

    testWidgets("a button's menu still opens at its start, ${direction.name}", (
      tester,
    ) async {
      await pumpScreen(
        tester,
        _page(direction),
        client: _client,
        size: const Size(1280, 800),
      );
      final button = tester.getRect(find.text('More'));
      await tester.tap(find.text('More'));
      await tester.pumpAndSettle();
      final panel = tester.getRect(find.byType(MenuPanel));
      expect(panel.top, greaterThanOrEqualTo(button.bottom));
      if (direction == TextDirection.ltr) {
        expect(panel.left, moreOrLessEquals(button.left, epsilon: 1));
      } else {
        expect(panel.right, moreOrLessEquals(button.right, epsilon: 1));
      }
    });
  }

  testWidgets('system Back closes an open menu, then goes on as usual', (
    tester,
  ) async {
    await pumpScreen(tester, _page(TextDirection.ltr), client: _client);
    await tester.tap(find.text('Original'));
    await tester.pumpAndSettle();
    expect(find.byType(MenuPanel), findsOneWidget);
    expect(await tester.binding.handlePopRoute(), isTrue);
    await tester.pumpAndSettle();
    expect(find.byType(MenuPanel), findsNothing);
    // The page takes touches again.
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    expect(find.text('Remove'), findsOneWidget);
    expect(await tester.binding.handlePopRoute(), isTrue);
    await tester.pumpAndSettle();
    // With none open, Back is the app's: here, nothing to go back to.
    expect(await tester.binding.handlePopRoute(), isFalse);
  });

  testWidgets('a menu closes as its page goes out of sight', (tester) async {
    final shown = ValueNotifier(true);
    addTearDown(shown.dispose);
    await pumpScreen(
      tester,
      ValueListenableBuilder(
        valueListenable: shown,
        builder: (context, on, _) =>
            TickerMode(enabled: on, child: _page(TextDirection.ltr)),
      ),
      client: _client,
    );
    await tester.tap(find.text('Original'));
    await tester.pumpAndSettle();
    expect(find.byType(MenuPanel), findsOneWidget);
    shown.value = false;
    await tester.pumpAndSettle();
    expect(find.byType(MenuPanel), findsNothing);
  });

  testWidgets("a phone's picker menu keeps to the screen", (tester) async {
    await pumpScreen(tester, _page(TextDirection.ltr), client: _client);
    await tester.tap(find.text('Original'));
    await tester.pumpAndSettle();
    final panel = tester.getRect(find.byType(MenuPanel));
    expect(panel.left, greaterThanOrEqualTo(0));
    expect(panel.right, lessThanOrEqualTo(412));
  });

  testWidgets('a picked item reads as one selected button', (tester) async {
    final semantics = tester.ensureSemantics();
    await pumpScreen(
      tester,
      _page(TextDirection.ltr),
      client: _client,
      size: const Size(1280, 800),
    );
    await tester.tap(find.text('Original'));
    await tester.pumpAndSettle();
    // TalkBack lands on the button, so the tick has to be said there.
    final picked = tester
        .getSemantics(find.text('Original').last)
        .getSemanticsData();
    expect(picked.label, 'Original');
    expect(picked.flagsCollection.isButton, isTrue);
    expect(picked.flagsCollection.isSelected, Tristate.isTrue);
    final other = tester.getSemantics(find.text('720p')).getSemanticsData();
    expect(other.flagsCollection.isSelected, isNot(Tristate.isTrue));
    semantics.dispose();
  });
}
