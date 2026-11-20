import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// What a TV keeps for its own playback, as the Kotlin app's
/// `PlayerPrefs.matchFrameRate` and `autoplayNext`: whether the player
/// switches the screen to the video's frame rate, and whether the episode
/// up next starts by itself when one ends. Both on unless turned off.
typedef TvPlaybackPrefs = ({bool matchFrameRate, bool autoplayNext});

final tvPlaybackPrefsProvider =
    AsyncNotifierProvider<TvPlaybackPreferences, TvPlaybackPrefs>(
      TvPlaybackPreferences.new,
    );

class TvPlaybackPreferences extends AsyncNotifier<TvPlaybackPrefs> {
  static const _frameRate = 'matinee.tv.matchFrameRate';
  static const _autoplay = 'matinee.tv.autoplayNext';
  final _preferences = SharedPreferencesAsync();

  @override
  Future<TvPlaybackPrefs> build() async => (
    matchFrameRate: await _preferences.getBool(_frameRate) ?? true,
    autoplayNext: await _preferences.getBool(_autoplay) ?? true,
  );

  Future<void> setMatchFrameRate(bool on) async {
    final now = await future;
    state = AsyncData((matchFrameRate: on, autoplayNext: now.autoplayNext));
    await _preferences.setBool(_frameRate, on);
  }

  Future<void> setAutoplayNext(bool on) async {
    final now = await future;
    state = AsyncData((matchFrameRate: now.matchFrameRate, autoplayNext: on));
    await _preferences.setBool(_autoplay, on);
  }
}
