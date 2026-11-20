import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'player.dart';

final playerEngineProvider =
    AsyncNotifierProvider<PlayerEnginePreference, PlayerEngine>(
      PlayerEnginePreference.new,
    );

class PlayerEnginePreference extends AsyncNotifier<PlayerEngine> {
  static const _key = 'matinee.player.engine';
  final _preferences = SharedPreferencesAsync();
  Future<void> _pending = Future<void>.value();

  @override
  Future<PlayerEngine> build() async =>
      PlayerEngine.values.asNameMap()[await _preferences.getString(_key)] ??
      PlayerEngine.mpv;

  Future<void> setEngine(PlayerEngine engine) {
    final write = _pending.then((_) async {
      if (await future == engine) return;
      await _preferences.setString(_key, engine.name);
      if (ref.mounted) state = AsyncData(engine);
    });
    _pending = write.then((_) {}, onError: (Object _, StackTrace _) {});
    return write;
  }
}
