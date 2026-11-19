import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/app.dart';
import 'package:matinee/router.dart';
import 'package:matinee/screens/shell/rail.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

Future<void> _pump(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const ProviderScope(child: MatineeApp()));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  testWidgets('a phone gets the bottom bar, and the tabs switch', (
    tester,
  ) async {
    await _pump(tester, const Size(412, 915));
    expect(find.byType(ShellRail), findsNothing);
    expect(find.text('Media'), findsWidgets);
    await tester.tap(find.text('Media').last);
    await tester.pumpAndSettle();
    expect(find.text('/media'), findsOneWidget);
  });

  testWidgets('a tablet in landscape gets the rail', (tester) async {
    await _pump(tester, const Size(1280, 800));
    expect(find.byType(ShellRail), findsOneWidget);
  });

  test('routes build their paths', () {
    expect(Routes.title('t1'), '/title/t1');
    expect(Routes.season('t1', 2), '/title/t1/season/2');
    expect(Routes.library('l1'), '/library/l1');
    expect(Routes.library('l1', sort: 'added'), '/library/l1?sort=added');
    expect(Routes.person('Ana de Armas'), '/person/Ana%20de%20Armas');
  });
}
