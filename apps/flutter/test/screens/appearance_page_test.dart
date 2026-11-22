import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/settings/appearance_page.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

void main() {
  setUp(() {
    final previous = SharedPreferencesAsyncPlatform.instance;
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    addTearDown(() => SharedPreferencesAsyncPlatform.instance = previous);
  });

  // The bug it pins: the switch showed on devices whose wallpaper has no
  // colors to give, where turning it on did nothing.
  testWidgets('Material You is offered only where the wallpaper has colors', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    Future<void> pump(MaterialYouColors? colors) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            materialYouProvider.overrideWithValue(AsyncValue.data(colors)),
          ],
          child: MaterialApp(
            locale: const Locale('en'),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            theme: MatineeTheme.data(matineeLight),
            home: const AppearancePage(),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    await pump(null);
    expect(find.text('Material You'), findsNothing);

    await pump(const MaterialYouColors(light: matineeLight, dark: matineeDark));
    // The section's heading and the switch's own title.
    expect(find.text('Material You'), findsNWidgets(2));
    expect(find.text('Colors from your wallpaper'), findsOneWidget);
  });
}
