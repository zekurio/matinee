import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';

void main() {
  testWidgets('the mark alone fills its square, without the word', (
    tester,
  ) async {
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: MatineeTheme.wrap(
          matineeDark,
          const ColoredBox(
            color: Color(0xff0e0e10),
            child: Center(child: RepaintBoundary(child: LogoMark(size: 72))),
          ),
        ),
      ),
    );
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 200)),
    );
    await tester.pump();
    expect(tester.getSize(find.byType(LogoMark)), const Size(72, 72));
    await expectLater(
      find.byType(RepaintBoundary).last,
      matchesGoldenFile('goldens/logo_mark.png'),
    );
  });
}
