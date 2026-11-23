import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/screens/profile/profile_sections.dart';

void main() {
  // The bug it pins: on a tablet the stats stopped at 720 while the rails
  // ran to the screen's edge, so the page had two right edges.
  for (final (width, column) in const [
    (360.0, 360.0),
    (600.0, 600.0),
    (800.0, 720.0),
    (1280.0, 720.0),
  ]) {
    testWidgets('$width wide, every section is $column wide', (tester) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      const sections = [Key('rail'), Key('stats'), Key('account')];
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: MediaQuery(
            data: MediaQueryData(size: Size(width, 900)),
            child: ProfileColumn(
              sections: [
                for (final key in sections) SizedBox(key: key, height: 100),
              ],
            ),
          ),
        ),
      );

      for (final key in sections) {
        final rect = tester.getRect(find.byKey(key));
        expect(rect.width, column, reason: '$key');
        expect(rect.left, (width - column) / 2, reason: '$key');
      }
    });
  }
}
