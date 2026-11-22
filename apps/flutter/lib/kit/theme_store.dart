import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'theme.dart';

typedef ThemePreferences = ({ThemePreset preset, ThemeAppearance appearance});

const defaultThemePreferences = (
  preset: ThemePreset.matinee,
  appearance: ThemeAppearance.system,
);

final themeStoreProvider = AsyncNotifierProvider<ThemeStore, ThemePreferences>(
  ThemeStore.new,
);

class ThemeStore extends AsyncNotifier<ThemePreferences> {
  static const _key = 'matinee.theme';
  final _preferences = SharedPreferencesAsync();
  Future<void> _pending = Future<void>.value();

  @override
  Future<ThemePreferences> build() async {
    final saved = await _preferences.getString(_key);
    final parts = saved?.split('/');
    if (parts == null || parts.length != 2) return defaultThemePreferences;
    return (
      preset:
          ThemePreset.values.asNameMap()[parts.first] ??
          defaultThemePreferences.preset,
      appearance:
          ThemeAppearance.values.asNameMap()[parts.last] ??
          defaultThemePreferences.appearance,
    );
  }

  Future<void> setPreset(ThemePreset preset) => _save(preset: preset);

  Future<void> setAppearance(ThemeAppearance appearance) =>
      _save(appearance: appearance);

  Future<void> _save({ThemePreset? preset, ThemeAppearance? appearance}) {
    final write = _pending.then((_) async {
      final previous = await future;
      final next = (
        preset: preset ?? previous.preset,
        appearance: appearance ?? previous.appearance,
      );
      if (next == previous) return;
      await _preferences.setString(
        _key,
        '${next.preset.name}/${next.appearance.name}',
      );
      if (ref.mounted) state = AsyncData(next);
    });
    // A failed write stays visible to its caller. Later edits can still save.
    _pending = write.then((_) {}, onError: (Object _, StackTrace _) {});
    return write;
  }
}
