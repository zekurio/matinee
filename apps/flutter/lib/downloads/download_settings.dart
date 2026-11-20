import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Which subtitle languages a download saves beside the video, as
/// `DownloadWishes.subtitles` names them.
enum DownloadSubtitles { used, all, none }

/// What the download sheet starts on: a version for this device, at a
/// preset's height, or the file as it is.
abstract final class DefaultVersion {
  static const device = 'device';
  static const original = 'original';
}

/// A download's codec when its video is encoded: the server's first.
const automaticCodec = 'auto';

/// The Kotlin app's download settings, kept on this device.
final class DownloadSettings {
  const DownloadSettings({
    this.unmeteredOnly = true,
    this.defaultVersion = DefaultVersion.device,
    this.videoCodec = automaticCodec,
    this.subtitles = DownloadSubtitles.used,
  });

  /// Fetch only over unmetered networks, like Wi-Fi.
  final bool unmeteredOnly;

  /// [DefaultVersion.device], [DefaultVersion.original], or a preset's
  /// height.
  final String defaultVersion;

  /// One of the server's codecs, or [automaticCodec].
  final String videoCodec;
  final DownloadSubtitles subtitles;

  DownloadSettings copyWith({
    bool? unmeteredOnly,
    String? defaultVersion,
    String? videoCodec,
    DownloadSubtitles? subtitles,
  }) => DownloadSettings(
    unmeteredOnly: unmeteredOnly ?? this.unmeteredOnly,
    defaultVersion: defaultVersion ?? this.defaultVersion,
    videoCodec: videoCodec ?? this.videoCodec,
    subtitles: subtitles ?? this.subtitles,
  );
}

final downloadSettingsProvider =
    AsyncNotifierProvider<DownloadSettingsStore, DownloadSettings>(
      DownloadSettingsStore.new,
    );

/// [DownloadSettings] in shared preferences. Whether to wait for Wi-Fi
/// reaches the platform's fetches through `DownloadsLifecycle`.
class DownloadSettingsStore extends AsyncNotifier<DownloadSettings> {
  static const _prefix = 'matinee.downloads.';
  final _preferences = SharedPreferencesAsync();
  Future<void> _pending = Future<void>.value();

  @override
  Future<DownloadSettings> build() async {
    const defaults = DownloadSettings();
    final unmetered = await _preferences.getBool('${_prefix}unmetered');
    final version = await _preferences.getString('${_prefix}version');
    final codec = await _preferences.getString('${_prefix}codec');
    final subtitles = await _preferences.getString('${_prefix}subtitles');
    return DownloadSettings(
      unmeteredOnly: unmetered ?? defaults.unmeteredOnly,
      defaultVersion: version ?? defaults.defaultVersion,
      videoCodec: codec ?? defaults.videoCodec,
      subtitles:
          DownloadSubtitles.values.asNameMap()[subtitles] ?? defaults.subtitles,
    );
  }

  Future<void> _change(
    DownloadSettings Function(DownloadSettings) change,
    Future<void> Function() save,
  ) {
    final write = _pending.then((_) async {
      final current = await future;
      if (ref.mounted) state = AsyncData(change(current));
      await save();
    });
    _pending = write.then((_) {}, onError: (Object _, StackTrace _) {});
    return write;
  }

  Future<void> setUnmeteredOnly(bool on) => _change(
    (current) => current.copyWith(unmeteredOnly: on),
    () => _preferences.setBool('${_prefix}unmetered', on),
  );

  Future<void> setDefaultVersion(String version) => _change(
    (current) => current.copyWith(defaultVersion: version),
    () => _preferences.setString('${_prefix}version', version),
  );

  Future<void> setVideoCodec(String codec) => _change(
    (current) => current.copyWith(videoCodec: codec),
    () => _preferences.setString('${_prefix}codec', codec),
  );

  Future<void> setSubtitles(DownloadSubtitles subtitles) => _change(
    (current) => current.copyWith(subtitles: subtitles),
    () => _preferences.setString('${_prefix}subtitles', subtitles.name),
  );
}
