import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/server_accents.dart';
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
            serverAccentsProvider.overrideWith(() => _Accents(null)),
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
    expect(find.text('Material You'), findsOneWidget);
    expect(find.text('Colors from your wallpaper'), findsOneWidget);
  });

  // The bug it pins: the miniatures drew the preset's own accent, not the
  // one the server's branding gives the app.
  testWidgets('the miniatures draw the server\'s accent', (tester) async {
    tester.view.physicalSize = const Size(400, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    const accents = ThemeAccents(light: '#c8102e', dark: '#e0234a');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          materialYouProvider.overrideWithValue(const AsyncValue.data(null)),
          serverAccentsProvider.overrideWith(() => _Accents(accents)),
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

    Iterable<Color?> fills() => tester
        .widgetList<Container>(find.byType(Container))
        .map(
          (box) => switch (box.decoration) {
            BoxDecoration(:final color) => color,
            _ => null,
          },
        );
    final light = accented(matineeLight, accents.light).accent;
    final dark = accented(matineeDark, accents.dark).accent;
    expect(fills(), contains(light));
    expect(fills(), contains(dark));
    expect(fills(), isNot(contains(matineeLight.accent)));
  });
}

class _Accents extends ServerAccentsNotifier {
  _Accents(this.accents);

  final ThemeAccents? accents;

  @override
  ThemeAccents? build() => accents;
}
