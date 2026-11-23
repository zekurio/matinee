import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

void main() {
  setUp(() {
    final previous = SharedPreferencesAsyncPlatform.instance;
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    addTearDown(() => SharedPreferencesAsyncPlatform.instance = previous);
  });

  test('theme mode and Material You survive a new container, and queued edits keep their order', () async {
    final container = ProviderContainer.test();
    expect(
      await container.read(themeStoreProvider.future),
      defaultThemePreferences,
    );
    final settings = container.read(themeStoreProvider.notifier);

    await Future.wait([
      settings.setAppearance(ThemeAppearance.light),
      settings.setPreset(ThemePreset.matinee),
      settings.setMaterialYou(true),
      settings.setAppearance(ThemeAppearance.dark),
    ]);

    final restarted = ProviderContainer.test();
    final restored = await restarted.read(themeStoreProvider.future);
    expect(restored, (
      preset: ThemePreset.matinee,
      appearance: ThemeAppearance.dark,
      materialYou: true,
    ));
  });
}
