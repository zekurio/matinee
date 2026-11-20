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

  testWidgets("a phone's picker menu keeps to the screen", (tester) async {
    await pumpScreen(tester, _page(TextDirection.ltr), client: _client);
    await tester.tap(find.text('Original'));
    await tester.pumpAndSettle();
    final panel = tester.getRect(find.byType(MenuPanel));
    expect(panel.left, greaterThanOrEqualTo(0));
    expect(panel.right, lessThanOrEqualTo(412));
  });
}
