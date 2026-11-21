import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/screens/settings/settings_rows.dart';

import '../media/harness.dart';
import 'home_backend.dart';

/// The texts cut short with an ellipsis.
List<String> _cut(WidgetTester tester) => [
  for (final paragraph in tester.renderObjectList<RenderParagraph>(
    find.byType(RichText),
  ))
    if (paragraph.didExceedMaxLines) paragraph.text.toPlainText(),
];

void main() {
  setUpAll(loadFont);

  testWidgets('a short title leaves its long value whole on a phone', (
    tester,
  ) async {
    await pumpScreen(
      tester,
      const Panel(
        rows: [ValueRow(title: 'Storage', value: '0 B used · 8.3 GB free')],
      ),
      client: HomeBackend().client,
      size: const Size(360, 640),
    );
    expect(_cut(tester), isEmpty);
  });

  testWidgets('a long title and a long value share the row', (tester) async {
    const title = 'The name of a setting that goes on and on and on';
    const value = 'A value that is also far too long for any phone';
    await pumpScreen(
      tester,
      const Panel(
        rows: [ValueRow(title: title, value: value)],
      ),
      client: HomeBackend().client,
      size: const Size(360, 640),
    );
    // The title wraps; the value is cut at half the row.
    expect(_cut(tester), [value]);
    final row = tester.getSize(find.byType(ValueRow)).width;
    final shown = tester.getSize(find.text(value)).width;
    expect(shown, lessThan(row / 2));
    expect(shown, greaterThan(row / 3));
  });
}
