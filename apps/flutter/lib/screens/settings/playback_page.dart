import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../core/device.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../platform/player.g.dart' as wire;
import '../../player/playback_device.dart';
import '../../player/player_preferences.dart';
import '../../player/player_state.dart';
import '../../player/player_system.dart';
import 'settings_rows.dart';
import 'settings_screen.dart';

/// What `playback.options` says this account may stream, or null until it
/// answers or when it can't.
final playbackOptionsProvider = FutureProvider.autoDispose<PlaybackOptions?>((
  ref,
) async {
  final api = ref.watch(apiProvider);
  if (api == null) return null;
  try {
    return await api.playback.options();
  } on Exception {
    return null;
  }
}, retry: (count, error) => null);

/// The device's decoders, or null where the platform can't say.
final _codecsProvider = FutureProvider.autoDispose((ref) async {
  try {
    return await ref.watch(playbackCodecsProvider.future);
  } on Exception {
    return null;
  }
}, retry: (count, error) => null);

/// Names for encode choices, which aren't probe streams.
String videoCodecName(String codec) =>
    codec == 'h264' ? 'H.264' : codec.toUpperCase();

/// Names for audio conversion choices, which aren't probe streams.
String audioFormatName(String codec) =>
    const {
      'aac': 'AAC',
      'ac3': 'AC-3',
      'eac3': 'E-AC-3',
      'flac': 'FLAC',
      'alac': 'ALAC',
      'opus': 'Opus',
      'mp3': 'MP3',
    }[codec] ??
    codec.toUpperCase();

/// The qualities this account may stream, once `playback.options` answers.
List<(String, String)> playbackQualityChoices(
  AppLocalizations l,
  PlaybackOptions? options,
) {
  final decimal = NumberFormat.decimalPattern(l.localeName);
  return [
    (PlaybackQuality.original, l.playerQualityOriginal),
    for (final preset in options?.qualities ?? const <PlaybackQualityPreset>[])
      (
        preset.id,
        l.playbackQualityPreset(
          preset.height,
          l.playerBitrateMbpsExact(decimal.format(preset.bitrate / 1000000)),
        ),
      ),
  ];
}

/// The quality a setting shows: one the account may no longer use shows as
/// the original, the best the server allows. It stays saved, so a lifted
/// limit brings it back.
String shownQuality(
  String saved,
  PlaybackOptions? options,
  List<(String, String)> qualities,
) => options == null || qualities.any((entry) => entry.$1 == saved)
    ? saved
    : PlaybackQuality.original;

/// "Your server limits streams to 8 Mbps", for [limit] in bits a second.
String playbackQualityLimitText(AppLocalizations l, int limit) {
  final decimal = NumberFormat.decimalPattern(l.localeName);
  return l.playbackQualityLimit(
    limit < 1000000
        ? l.playerBitrateKbps((limit / 1000).round())
        : l.playerBitrateMbpsExact(
            decimal.format((limit / 100000).round() / 10),
          ),
  );
}

/// Settings, Playback: what this device plays and how. [playerEngineProvider]
/// keeps the engine and [playerPrefsProvider] the rest; the player reads both
/// when it opens.
class PlaybackPage extends ConsumerWidget {
  const PlaybackPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final engine = ref.watch(playerEngineProvider).value ?? PlayerEngine.mpv;
    final prefs = ref.watch(playerPrefsProvider).value ?? const PlayerPrefs();
    final options = ref.watch(playbackOptionsProvider).value;
    final codecs = ref.watch(_codecsProvider).value;
    final tv = ref.watch(deviceProvider).isTv;
    final pip = ref.watch(pictureInPictureAvailableProvider).value ?? false;
    void change(PlayerPrefs Function(PlayerPrefs) edit) =>
        ref.read(playerPrefsProvider.notifier).change(edit);
    final passthrough = passthroughCodecs(codecs);
    return SettingsScaffold(
      title: l.settingsPagePlayback,
      sections: [
        _DeviceSection(
          engine: engine,
          prefs: prefs,
          options: options,
          tv: tv,
          pip: pip,
          change: change,
        ),
        if (!tv) ...[
          SettingsSection(
            title: l.playbackGesturesTitle,
            child: Panel(
              rows: [
                SwitchRow(
                  title: l.playbackGesturesLevels,
                  checked: prefs.swipeLevels,
                  onChanged: (on) =>
                      change((prefs) => prefs.copyWith(swipeLevels: on)),
                ),
                if (prefs.swipeLevels)
                  SwitchRow(
                    title: l.playbackGesturesRememberBrightness,
                    checked: prefs.rememberBrightness,
                    // Kept from the next swipe on, not one made before.
                    onChanged: (on) => change(
                      (prefs) => prefs.copyWith(
                        rememberBrightness: on,
                        brightness: on ? null : -1,
                      ),
                    ),
                  ),
                SwitchRow(
                  title: l.playbackGesturesSeek,
                  checked: prefs.swipeSeek,
                  onChanged: (on) =>
                      change((prefs) => prefs.copyWith(swipeSeek: on)),
                ),
                SwitchRow(
                  title: l.playbackGesturesHold,
                  checked: prefs.holdSpeed,
                  onChanged: (on) =>
                      change((prefs) => prefs.copyWith(holdSpeed: on)),
                ),
              ],
            ),
          ),
          // Back, play, and the settings menu always show, so none of them
          // strands anyone.
          SettingsSection(
            title: l.playbackButtonsTitle,
            child: Panel(
              rows: [
                SwitchRow(
                  title: l.playbackButtonsSkip,
                  checked: prefs.skipButtons,
                  onChanged: (on) =>
                      change((prefs) => prefs.copyWith(skipButtons: on)),
                ),
                // With picture in picture off, there's no button to hide.
                if (pip && prefs.pictureInPicture)
                  SwitchRow(
                    title: l.playbackPipTitle,
                    checked: prefs.pictureInPictureButton,
                    onChanged: (on) => change(
                      (prefs) => prefs.copyWith(pictureInPictureButton: on),
                    ),
                  ),
                SwitchRow(
                  title: l.playbackButtonsLock,
                  checked: prefs.lockButton,
                  onChanged: (on) =>
                      change((prefs) => prefs.copyWith(lockButton: on)),
                ),
                SwitchRow(
                  title: l.playbackButtonsAudio,
                  checked: prefs.audioButton,
                  onChanged: (on) =>
                      change((prefs) => prefs.copyWith(audioButton: on)),
                ),
                SwitchRow(
                  title: l.playbackButtonsSubtitles,
                  checked: prefs.subtitlesButton,
                  onChanged: (on) =>
                      change((prefs) => prefs.copyWith(subtitlesButton: on)),
                ),
              ],
            ),
          ),
        ],
        ?_transcoding(l, prefs, options, codecs, change),
        if (passthrough.isNotEmpty)
          SettingsSection(
            title: l.playbackPassthroughTitle,
            child: Panel(
              rows: [
                for (final codec in passthrough)
                  SwitchRow(
                    title: audioFormatName(codec),
                    checked: !prefs.convertAudio.contains(codec),
                    onChanged: (on) => change(
                      (prefs) => prefs.copyWith(
                        convertAudio: on
                            ? (prefs.convertAudio.toSet()..remove(codec))
                            : {...prefs.convertAudio, codec},
                      ),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }

  /// The codecs the server converts to when this device can't play a file
  /// as it is. A codec shows only when there's a choice: what the server
  /// encodes and this device decodes.
  Widget? _transcoding(
    AppLocalizations l,
    PlayerPrefs prefs,
    PlaybackOptions? options,
    wire.CodecCapabilitiesMessage? codecs,
    void Function(PlayerPrefs Function(PlayerPrefs)) change,
  ) {
    final video = encodeVideoChoices(
      options?.videoCodecs ?? const ['h264'],
      codecs,
    );
    final audio = convertAudioChoices(
      options?.audioCodecs ?? const ['aac'],
      codecs,
    );
    // The server may not encode video for this account, so there's no codec
    // to pick for it.
    final noEncodes = options != null && options.videoCodecs.isEmpty;
    if (!noEncodes && video.length <= 1 && audio.length <= 1) return null;
    return Builder(
      builder: (context) => SettingsSection(
        title: l.playbackTranscodingTitle,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Panel(
              rows: [
                if (noEncodes)
                  ValueRow(
                    title: l.playbackVideoCodecTitle,
                    value: l.playbackVideoCodecNone,
                  )
                else if (video.length > 1)
                  PickerRow<String>(
                    title: l.playbackVideoCodecTitle,
                    options: [
                      (
                        automaticCodec,
                        l.playbackCodecAutomatic(videoCodecName('h264')),
                      ),
                      for (final codec in video) (codec, videoCodecName(codec)),
                    ],
                    current: video.contains(prefs.videoCodec)
                        ? prefs.videoCodec
                        : automaticCodec,
                    onPicked: (picked) =>
                        change((prefs) => prefs.copyWith(videoCodec: picked)),
                  ),
                if (audio.length > 1)
                  PickerRow<String>(
                    title: l.playbackAudioCodecTitle,
                    options: [
                      (
                        automaticCodec,
                        l.playbackCodecAutomatic(audioFormatName(audio.first)),
                      ),
                      for (final codec in audio)
                        (codec, audioFormatName(codec)),
                    ],
                    current: audio.contains(prefs.audioCodec)
                        ? prefs.audioCodec
                        : automaticCodec,
                    onPicked: (picked) =>
                        change((prefs) => prefs.copyWith(audioCodec: picked)),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              noEncodes
                  ? l.playbackTranscodingNoEncodes
                  : l.playbackTranscodingNote,
              style: KitText.sm.style(
                color: MatineeTheme.of(context).textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DeviceSection extends StatelessWidget {
  const _DeviceSection({
    required this.engine,
    required this.prefs,
    required this.options,
    required this.tv,
    required this.pip,
    required this.change,
  });

  final PlayerEngine engine;
  final PlayerPrefs prefs;
  final PlaybackOptions? options;
  final bool tv;

  /// Whether the device has picture in picture.
  final bool pip;
  final void Function(PlayerPrefs Function(PlayerPrefs)) change;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final qualities = playbackQualityChoices(l, options);
    final quality = shownQuality(prefs.quality, options, qualities);
    final limit = options?.maxBitrate;
    return SettingsSection(
      title: l.playbackDeviceTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Panel(
            rows: [
              if (qualities.any((entry) => entry.$1 == quality))
                PickerRow<String>(
                  title: l.playbackQualityTitle,
                  options: qualities,
                  current: quality,
                  onPicked: (picked) =>
                      change((prefs) => prefs.copyWith(quality: picked)),
                ),
              // iOS has mpv alone.
              if (defaultTargetPlatform == TargetPlatform.android)
                PickerRow<PlayerEngine>(
                  title: l.playbackEngineTitle,
                  // Their own names, the same in every language.
                  options: const [
                    (PlayerEngine.mpv, 'mpv'),
                    (PlayerEngine.media3, 'Media3'),
                  ],
                  current: engine,
                  onPicked: (picked) => ProviderScope.containerOf(
                    context,
                    listen: false,
                  ).read(playerEngineProvider.notifier).setEngine(picked),
                ),
              PickerRow<Decoders>(
                title: l.playbackDecodersTitle,
                options: [
                  (Decoders.hardware, l.playbackDecodersHardware),
                  (Decoders.software, l.playbackDecodersSoftware),
                ],
                current: prefs.decoders,
                onPicked: (picked) =>
                    change((prefs) => prefs.copyWith(decoders: picked)),
              ),
              SwitchRow(
                title: l.playbackAutoplayTitle,
                checked: prefs.autoplayNext,
                onChanged: (on) =>
                    change((prefs) => prefs.copyWith(autoplayNext: on)),
              ),
              if (pip)
                SwitchRow(
                  title: l.playbackPipTitle,
                  checked: prefs.pictureInPicture,
                  onChanged: (on) =>
                      change((prefs) => prefs.copyWith(pictureInPicture: on)),
                ),
              if (tv)
                SwitchRow(
                  title: l.tvSettingsFrameRate,
                  checked: prefs.matchFrameRate,
                  onChanged: (on) =>
                      change((prefs) => prefs.copyWith(matchFrameRate: on)),
                ),
            ],
          ),
          if (limit != null) ...[
            const SizedBox(height: 8),
            Text(
              playbackQualityLimitText(l, limit),
              style: KitText.sm.style(color: colors.textMuted),
            ),
          ],
        ],
      ),
    );
  }
}
