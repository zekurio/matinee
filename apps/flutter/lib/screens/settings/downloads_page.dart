import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session.dart';
import '../../downloads/download_settings.dart';
import '../../downloads/downloads.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/format.dart';
import '../../platform/player.g.dart' show VideoDecoderMessage;
import '../../player/playback_device.dart';
import '../downloads/download_sheet.dart';
import 'settings_rows.dart';
import 'settings_screen.dart';

/// Of the server's codecs, those an encoded download may come in: the ones this
/// device has a decoder for.
List<String> downloadCodecChoices(List<String> server, List<String> decoded) =>
    [
      for (final codec in const ['h264', 'hevc', 'av1'])
        if (server.contains(codec) && decoded.contains(codec)) codec,
    ];

/// Settings, Downloads: the space they take and what's left, whether to wait
/// for Wi-Fi, what the download sheet starts on, and a way to remove them all.
/// An account that may not download keeps what's on the device, and nothing
/// more to set.
class DownloadsPage extends ConsumerWidget {
  const DownloadsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final options = ref.watch(playbackOptionsProvider).value;
    final off = options?.downloads == false;
    final settings =
        ref.watch(downloadSettingsProvider).value ?? const DownloadSettings();
    final store = ref.read(downloadSettingsProvider.notifier);
    final used = formatBytes(ref.watch(downloadsBytesProvider), l);
    final free = switch (ref.watch(freeBytesProvider).value) {
      final bytes? => formatBytes(bytes, l),
      null => '–',
    };
    final hasDownloads = ref.watch(shownDownloadsProvider).isNotEmpty;
    final decoders =
        ref.watch(playbackCodecsProvider).value?.video ??
        const <VideoDecoderMessage>[];
    final decoded = [for (final decoder in decoders) decoder.codec];
    final codecs = downloadCodecChoices(
      options?.videoCodecs ?? const ['h264'],
      decoded,
    );
    final presets = options?.downloadVideoPresets ?? const [];
    return SettingsScaffold(
      title: l.downloadsTitle,
      sections: [
        if (off)
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 4,
            children: [
              Text(
                l.downloadsOffTitle,
                style: KitText.base.style(
                  color: colors.foreground,
                  weight: FontWeight.w500,
                ),
              ),
              Text(
                l.downloadsOffDescription,
                style: KitText.sm.style(color: colors.mutedForeground),
              ),
            ],
          ),
        Panel(
          rows: [
            ValueRow(
              title: l.downloadsStorage,
              value: l.downloadsStorageValue(used, free),
            ),
            if (!off)
              SwitchRow(
                title: l.downloadsUnmetered,
                checked: settings.unmeteredOnly,
                onChanged: (on) => unawaited(store.setUnmeteredOnly(on)),
              ),
          ],
        ),
        if (!off)
          // What the download sheet starts on.
          SettingsSection(
            title: l.downloadsDefaults,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                Panel(
                  rows: [
                    PickerRow<String>(
                      title: l.downloadsDefaultTitle,
                      options: [
                        (DefaultVersion.device, l.downloadsChoiceDevice),
                        for (final preset in presets)
                          (
                            '${preset.height}',
                            l.downloadsChoicePreset(
                              preset.height,
                              mbps(preset.bitrate, l),
                            ),
                          ),
                        (DefaultVersion.original, l.downloadsChoiceOriginal),
                      ],
                      current: settings.defaultVersion,
                      onPicked: (picked) =>
                          unawaited(store.setDefaultVersion(picked)),
                    ),
                    PickerRow<DownloadSubtitles>(
                      title: l.downloadsDefaultSubtitles,
                      options: [
                        (DownloadSubtitles.used, l.downloadsSubtitlesUsed),
                        (DownloadSubtitles.all, l.downloadsSubtitlesAll),
                        (DownloadSubtitles.none, l.downloadsSubtitlesNone),
                      ],
                      current: settings.subtitles,
                      onPicked: (picked) =>
                          unawaited(store.setSubtitles(picked)),
                    ),
                    if (codecs.length > 1)
                      PickerRow<String>(
                        title: l.downloadsCodec,
                        options: [
                          (
                            automaticCodec,
                            l.playbackCodecAutomatic(videoCodecName('h264')),
                          ),
                          for (final codec in codecs)
                            (codec, videoCodecName(codec)),
                        ],
                        current: codecs.contains(settings.videoCodec)
                            ? settings.videoCodec
                            : automaticCodec,
                        onPicked: (picked) =>
                            unawaited(store.setVideoCodec(picked)),
                      ),
                  ],
                ),
                Text(
                  l.downloadsCodecNote,
                  style: KitText.xs.style(color: colors.mutedForeground),
                ),
              ],
            ),
          ),
        if (hasDownloads)
          Panel(
            rows: [
              LinkRow(
                title: l.downloadsRemoveAll,
                destructive: true,
                onPressed: () => unawaited(_removeAll(context, used)),
              ),
            ],
          ),
      ],
    );
  }
}

Future<void> _removeAll(BuildContext context, String used) async {
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final sure = await ConfirmDialog.show(
    context,
    title: l.downloadsRemoveAllConfirm,
    description: l.downloadsRemoveAllBody(used),
    confirmLabel: l.commonRemove,
    cancelLabel: l.commonCancel,
    destructive: true,
  );
  if (!sure) return;
  await container
      .read(downloadsProvider.notifier)
      .removeAll(container.read(apiProvider));
}
