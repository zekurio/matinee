import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/matinee_api.dart';
import 'player.dart';

final playerEngineProvider =
    AsyncNotifierProvider<PlayerEnginePreference, PlayerEngine>(
      PlayerEnginePreference.new,
    );

class PlayerEnginePreference extends AsyncNotifier<PlayerEngine> {
  static const _key = 'matinee.player.engine';
  final _preferences = SharedPreferencesAsync();
  Future<void> _pending = Future<void>.value();

  /// Media3 is Android's; iOS has mpv alone.
  static bool get _choosable => defaultTargetPlatform == TargetPlatform.android;

  @override
  Future<PlayerEngine> build() async {
    if (!_choosable) return PlayerEngine.mpv;
    return PlayerEngine.values.asNameMap()[await _preferences.getString(
          _key,
        )] ??
        PlayerEngine.mpv;
  }

  Future<void> setEngine(PlayerEngine engine) {
    if (!_choosable) return Future<void>.value();
    final write = _pending.then((_) async {
      if (await future == engine) return;
      await _preferences.setString(_key, engine.name);
      if (ref.mounted) state = AsyncData(engine);
    });
    _pending = write.then((_) {}, onError: (Object _, StackTrace _) {});
    return write;
  }
}

/// Lets the player pick a codec, as the web's `auto` choice does.
const automaticCodec = 'auto';

/// Formats a device plays that settings may still have converted, as the
/// web's passthrough switches.
const optionalPassthrough = ['ac3', 'eac3', 'flac', 'alac'];

/// Which of the device's decoders the player tries first.
enum Decoders { hardware, software }

enum SubtitleColor {
  white(0xFFFFFFFF),
  yellow(0xFFFFE14D),
  cyan(0xFF6CE5FF),
  green(0xFF7CF29A);

  const SubtitleColor(this.argb);

  final int argb;
}

/// What sits behind each line of a subtitle.
enum SubtitleBackground { none, shaded, black }

/// Settings offers the first three; the system's caption style can also
/// ask for the raised and depressed edges.
enum SubtitleEdge { shadow, outline, none, raised, depressed }

/// The edges Settings offers for the app's own look.
const ownSubtitleEdges = [
  SubtitleEdge.shadow,
  SubtitleEdge.outline,
  SubtitleEdge.none,
];

/// How much bigger than normal subtitles draw.
const subtitleScales = [0.75, 1.0, 1.25, 1.5, 2.0];

/// What the player keeps on this device, as the Kotlin app's `PlayerPrefs`
/// and the web's per-browser settings do: the quality videos start in, the
/// codecs encodes come in, the decoders, the gestures and buttons, and how
/// subtitles look. Languages and skips follow the account instead. The
/// engine has its own [playerEngineProvider], which came first.
@immutable
class PlayerPrefs {
  const PlayerPrefs({
    this.quality = PlaybackQuality.original,
    this.videoCodec = automaticCodec,
    this.audioCodec = automaticCodec,
    this.convertAudio = const {},
    this.decoders = Decoders.hardware,
    this.autoplayNext = true,
    this.fillScreen = false,
    this.swipeLevels = true,
    this.rememberBrightness = false,
    this.brightness = -1,
    this.swipeSeek = true,
    this.holdSpeed = true,
    this.skipButtons = true,
    this.pictureInPictureButton = true,
    this.lockButton = true,
    this.audioButton = true,
    this.subtitlesButton = true,
    this.pictureInPicture = true,
    this.matchFrameRate = true,
    this.subtitleSystemStyle = false,
    this.subtitleScale = 1,
    this.subtitleColor = SubtitleColor.white,
    this.subtitleBackground = SubtitleBackground.shaded,
    this.subtitleEdge = SubtitleEdge.shadow,
  });

  /// Reads what [toJson] wrote, keeping the default for anything missing,
  /// of the wrong type, or from a newer version that this one doesn't know.
  factory PlayerPrefs.fromJson(Object? json) {
    const base = PlayerPrefs();
    if (json is! Map<String, Object?>) return base;
    String text(String key, String fallback) => switch (json[key]) {
      final String value => value,
      _ => fallback,
    };
    bool flag(String key, bool fallback) => switch (json[key]) {
      final bool value => value,
      _ => fallback,
    };
    double number(String key, double fallback) => switch (json[key]) {
      final num value => value.toDouble(),
      _ => fallback,
    };
    T pick<T extends Enum>(List<T> values, String key, T fallback) =>
        values.asNameMap()[json[key]] ?? fallback;
    return PlayerPrefs(
      quality: text('quality', base.quality),
      videoCodec: text('videoCodec', base.videoCodec),
      audioCodec: text('audioCodec', base.audioCodec),
      convertAudio: switch (json['convertAudio']) {
        final List<Object?> codecs => codecs.whereType<String>().toSet(),
        _ => base.convertAudio,
      },
      decoders: pick(Decoders.values, 'decoders', base.decoders),
      autoplayNext: flag('autoplayNext', base.autoplayNext),
      fillScreen: flag('fillScreen', base.fillScreen),
      swipeLevels: flag('swipeLevels', base.swipeLevels),
      rememberBrightness: flag('rememberBrightness', base.rememberBrightness),
      brightness: number('brightness', base.brightness),
      swipeSeek: flag('swipeSeek', base.swipeSeek),
      holdSpeed: flag('holdSpeed', base.holdSpeed),
      skipButtons: flag('skipButtons', base.skipButtons),
      pictureInPictureButton: flag(
        'pictureInPictureButton',
        base.pictureInPictureButton,
      ),
      lockButton: flag('lockButton', base.lockButton),
      audioButton: flag('audioButton', base.audioButton),
      subtitlesButton: flag('subtitlesButton', base.subtitlesButton),
      pictureInPicture: flag('pictureInPicture', base.pictureInPicture),
      matchFrameRate: flag('matchFrameRate', base.matchFrameRate),
      subtitleSystemStyle: flag(
        'subtitleSystemStyle',
        base.subtitleSystemStyle,
      ),
      subtitleScale: number('subtitleScale', base.subtitleScale),
      subtitleColor: pick(
        SubtitleColor.values,
        'subtitleColor',
        base.subtitleColor,
      ),
      subtitleBackground: pick(
        SubtitleBackground.values,
        'subtitleBackground',
        base.subtitleBackground,
      ),
      subtitleEdge: pick(
        SubtitleEdge.values,
        'subtitleEdge',
        base.subtitleEdge,
      ),
    );
  }

  /// The quality videos start in. The server answers with the nearest one
  /// the account may use, so one over its limit stays saved for when it's
  /// lifted.
  final String quality;

  /// The codec encodes come in, from [TranscodeVideoCodec], or
  /// [automaticCodec].
  final String videoCodec;

  /// The codec streams convert audio to: Opus, AAC, or [automaticCodec].
  final String audioCodec;

  /// Formats the device plays that streams convert anyway, from
  /// [optionalPassthrough].
  final Set<String> convertAudio;
  final Decoders decoders;

  /// Count down to the next episode and start it.
  final bool autoplayNext;

  /// The video fills the screen, cut at its edges, rather than showing
  /// whole; a pinch switches.
  final bool fillScreen;

  /// Swiping up or down on the video's left half sets the brightness, on
  /// its right half the volume.
  final bool swipeLevels;

  /// Start the player at the brightness the last swipe left it at, rather
  /// than the system's.
  final bool rememberBrightness;

  /// The swipe level the last brightness swipe left, from 0 to 1, or below
  /// 0 before any.
  final double brightness;

  /// Swiping sideways on the video seeks.
  final bool swipeSeek;

  /// Holding a finger on the video plays it at double speed until it lifts.
  final bool holdSpeed;

  /// The buttons the player's controls show. Double taps skip either way.
  final bool skipButtons;
  final bool pictureInPictureButton;
  final bool lockButton;
  final bool audioButton;
  final bool subtitlesButton;

  /// Keep playing in a small window on leaving the app.
  final bool pictureInPicture;

  /// On a TV, switch the display to the video's frame rate while it plays,
  /// at the same resolution.
  final bool matchFrameRate;

  /// Draw subtitles as the system's caption settings say, instead of the
  /// choices below.
  final bool subtitleSystemStyle;
  final double subtitleScale;
  final SubtitleColor subtitleColor;
  final SubtitleBackground subtitleBackground;
  final SubtitleEdge subtitleEdge;

  Map<String, Object?> toJson() => {
    'quality': quality,
    'videoCodec': videoCodec,
    'audioCodec': audioCodec,
    'convertAudio': (convertAudio.toList()..sort()),
    'decoders': decoders.name,
    'autoplayNext': autoplayNext,
    'fillScreen': fillScreen,
    'swipeLevels': swipeLevels,
    'rememberBrightness': rememberBrightness,
    'brightness': brightness,
    'swipeSeek': swipeSeek,
    'holdSpeed': holdSpeed,
    'skipButtons': skipButtons,
    'pictureInPictureButton': pictureInPictureButton,
    'lockButton': lockButton,
    'audioButton': audioButton,
    'subtitlesButton': subtitlesButton,
    'pictureInPicture': pictureInPicture,
    'matchFrameRate': matchFrameRate,
    'subtitleSystemStyle': subtitleSystemStyle,
    'subtitleScale': subtitleScale,
    'subtitleColor': subtitleColor.name,
    'subtitleBackground': subtitleBackground.name,
    'subtitleEdge': subtitleEdge.name,
  };

  PlayerPrefs copyWith({
    String? quality,
    String? videoCodec,
    String? audioCodec,
    Set<String>? convertAudio,
    Decoders? decoders,
    bool? autoplayNext,
    bool? fillScreen,
    bool? swipeLevels,
    bool? rememberBrightness,
    double? brightness,
    bool? swipeSeek,
    bool? holdSpeed,
    bool? skipButtons,
    bool? pictureInPictureButton,
    bool? lockButton,
    bool? audioButton,
    bool? subtitlesButton,
    bool? pictureInPicture,
    bool? matchFrameRate,
    bool? subtitleSystemStyle,
    double? subtitleScale,
    SubtitleColor? subtitleColor,
    SubtitleBackground? subtitleBackground,
    SubtitleEdge? subtitleEdge,
  }) => PlayerPrefs(
    quality: quality ?? this.quality,
    videoCodec: videoCodec ?? this.videoCodec,
    audioCodec: audioCodec ?? this.audioCodec,
    convertAudio: convertAudio ?? this.convertAudio,
    decoders: decoders ?? this.decoders,
    autoplayNext: autoplayNext ?? this.autoplayNext,
    fillScreen: fillScreen ?? this.fillScreen,
    swipeLevels: swipeLevels ?? this.swipeLevels,
    rememberBrightness: rememberBrightness ?? this.rememberBrightness,
    brightness: brightness ?? this.brightness,
    swipeSeek: swipeSeek ?? this.swipeSeek,
    holdSpeed: holdSpeed ?? this.holdSpeed,
    skipButtons: skipButtons ?? this.skipButtons,
    pictureInPictureButton:
        pictureInPictureButton ?? this.pictureInPictureButton,
    lockButton: lockButton ?? this.lockButton,
    audioButton: audioButton ?? this.audioButton,
    subtitlesButton: subtitlesButton ?? this.subtitlesButton,
    pictureInPicture: pictureInPicture ?? this.pictureInPicture,
    matchFrameRate: matchFrameRate ?? this.matchFrameRate,
    subtitleSystemStyle: subtitleSystemStyle ?? this.subtitleSystemStyle,
    subtitleScale: subtitleScale ?? this.subtitleScale,
    subtitleColor: subtitleColor ?? this.subtitleColor,
    subtitleBackground: subtitleBackground ?? this.subtitleBackground,
    subtitleEdge: subtitleEdge ?? this.subtitleEdge,
  );

  @override
  bool operator ==(Object other) =>
      other is PlayerPrefs &&
      jsonEncode(other.toJson()) == jsonEncode(toJson());

  @override
  int get hashCode => jsonEncode(toJson()).hashCode;
}

final playerPrefsProvider =
    AsyncNotifierProvider<PlayerPrefsStore, PlayerPrefs>(PlayerPrefsStore.new);

/// Keeps [PlayerPrefs] in one JSON value, written in the order changes
/// come so a quick second change can't land before the first.
class PlayerPrefsStore extends AsyncNotifier<PlayerPrefs> {
  static const _key = 'matinee.player.prefs';
  final _preferences = SharedPreferencesAsync();
  Future<void> _pending = Future<void>.value();

  @override
  Future<PlayerPrefs> build() async {
    final saved = await _preferences.getString(_key);
    if (saved == null) return const PlayerPrefs();
    try {
      return PlayerPrefs.fromJson(jsonDecode(saved));
    } on FormatException {
      return const PlayerPrefs();
    }
  }

  Future<void> change(PlayerPrefs Function(PlayerPrefs) edit) {
    final write = _pending.then((_) async {
      final current = await future;
      final next = edit(current);
      if (next == current) return;
      if (ref.mounted) state = AsyncData(next);
      await _preferences.setString(_key, jsonEncode(next.toJson()));
    });
    _pending = write.then((_) {}, onError: (Object _, StackTrace _) {});
    return write;
  }
}
