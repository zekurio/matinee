import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/session.dart';
import '../../downloads/download_settings.dart';
import '../../downloads/downloads.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/server_text.dart';
import '../../media/format.dart';
import '../settings/settings_rows.dart';
import 'downloads_screen.dart' show downloadNames;

/// One choice in a download sheet: a version the server makes for this
/// device, at a preset's size or its own, or the file as it is.
sealed class DownloadChoice {
  const DownloadChoice();
}

final class DeviceChoice extends DownloadChoice {
  const DeviceChoice([this.preset]);

  final DownloadVideoPreset? preset;

  @override
  bool operator ==(Object other) =>
      other is DeviceChoice &&
      other.preset?.height == preset?.height &&
      other.preset?.bitrate == preset?.bitrate;

  @override
  int get hashCode => Object.hash(preset?.height, preset?.bitrate);
}

final class OriginalChoice extends DownloadChoice {
  const OriginalChoice();

  @override
  bool operator ==(Object other) => other is OriginalChoice;

  @override
  int get hashCode => 0;
}

/// What a download sheet offers, in order: for this device, at each
/// preset's size, and as it is.
List<DownloadChoice> downloadChoices(List<DownloadVideoPreset> presets) => [
  const DeviceChoice(),
  for (final preset in presets) DeviceChoice(preset),
  const OriginalChoice(),
];

/// The version Settings names, which a download sheet starts on.
DownloadChoice startingChoice(
  DownloadSettings settings,
  List<DownloadVideoPreset> presets,
) {
  final wanted = settings.defaultVersion;
  if (wanted == DefaultVersion.original) return const OriginalChoice();
  for (final preset in presets) {
    if ('${preset.height}' == wanted) return DeviceChoice(preset);
  }
  return const DeviceChoice();
}

String choiceName(DownloadChoice choice, AppLocalizations l) =>
    switch (choice) {
      OriginalChoice() => l.downloadsChoiceOriginal,
      DeviceChoice(:final preset?) => l.downloadsChoicePreset(
        preset.height,
        mbps(preset.bitrate, l),
      ),
      DeviceChoice() => l.downloadsChoiceDevice,
    };

/// "6" or "2.5", for a bit rate in Mbps.
String mbps(int bitrate, AppLocalizations l) {
  final value = bitrate / 1000000;
  return value == value.roundToDouble()
      ? '${value.round()}'
      : NumberFormat('0.0', l.localeName).format(value);
}

/// "H.264", "HEVC", "AV1".
String videoCodecName(String codec) =>
    codec == 'h264' ? 'H.264' : codec.toUpperCase();

/// Whether to go on with a download of about [needed] bytes: at once when
/// it fits in the space left, or when the platform can't say how much
/// that is, else once the person says so, told how much it needs and how
/// much is free.
Future<bool> roomFor(BuildContext context, WidgetRef ref, int needed) async {
  int? free;
  try {
    free = await ref.read(downloadsPlatformProvider).freeBytes();
  } on Object {
    free = null;
  }
  if (free == null || needed <= free || !context.mounted) return true;
  final l = AppLocalizations.of(context);
  return ConfirmDialog.show(
    context,
    title: l.downloadsSpaceTitle,
    description: l.downloadsSpaceBody(
      formatBytes(needed, l),
      formatBytes(free, l),
    ),
    confirmLabel: l.downloadsSpaceGo,
    cancelLabel: l.commonCancel,
  );
}

/// Opens the download sheet for [item].
Future<void> showDownloadSheet(BuildContext context, MediaItem item) {
  final l = AppLocalizations.of(context);
  return Sheet.show<void>(
    context,
    dismissLabel: l.commonCancel,
    builder: (context) => DownloadSheet(item: item),
  );
}

/// What to download, the Kotlin app's `DownloadSheet`: a version the server
/// makes for this device, at the size the person picks, or the file as it
/// is; with the audio tracks and subtitles they pick. The tracks start as
/// the settings pick them, and each version's size shows before anything
/// starts, for the audio picked.
class DownloadSheet extends ConsumerStatefulWidget {
  const DownloadSheet({super.key, required this.item});

  final MediaItem item;

  @override
  ConsumerState<DownloadSheet> createState() => _DownloadSheetState();
}

class _DownloadSheetState extends ConsumerState<DownloadSheet> {
  DownloadSource? _source;
  String? _error;
  final _plans = <DownloadChoice, DownloadPlan>{};
  final _specs = <DownloadChoice, DownloadSpec>{};

  /// The plans are for the audio picked; while new ones come, the old
  /// sizes stay.
  bool _planning = true;
  int _round = 0;
  DownloadChoice _picked = const DeviceChoice();

  /// Audio by stream index; subtitles by id.
  Set<int> _audio = {};
  Set<String> _subtitles = {};
  String _codec = 'h264';
  late DownloadSettings _settings;

  @override
  void initState() {
    super.initState();
    // After the first frame, so what the sheet reads from above it is there.
    unawaited(Future.microtask(_load));
  }

  MatineeApi? get _api => ref.read(apiProvider);

  Future<void> _load() async {
    final l = AppLocalizations.of(context);
    final api = _api;
    try {
      if (api == null) throw StateError('no server');
      _settings = await ref.read(downloadSettingsProvider.future);
      final downloads = ref.read(downloadsProvider.notifier);
      final result = (await downloads.resolve(api, [
        widget.item,
      ], Downloads.wishes(_settings))).single;
      if (!mounted) return;
      switch (result) {
        case DownloadResolutionUnavailable(:final message):
          setState(() => _error = message.serverWords(l));
        case final DownloadResolutionReady ready:
          final source = DownloadSource(widget.item, ready);
          final codecs = ready.choices.codecs;
          setState(() {
            _audio = {for (final track in source.defaultAudio) track.index};
            _subtitles = {
              for (final track in source.defaultSubtitles) track.id,
            };
            _codec = codecs.contains(_settings.videoCodec)
                ? _settings.videoCodec
                : codecs.firstOrNull ?? 'h264';
            _picked = startingChoice(_settings, ready.choices.presets);
            _source = source;
          });
          unawaited(_plan());
      }
    } on Object catch (error) {
      if (mounted) setState(() => _error = describeFailure(l, error));
    }
  }

  /// The primary track first, as the file plays it; the rest as the file
  /// has them.
  List<AudioTrack> get _chosenAudio {
    final chosen = [
      for (final track in _source?.audio ?? const <AudioTrack>[])
        if (_audio.contains(track.index)) track,
    ];
    return [
      ...chosen.where((track) => track.primary),
      ...chosen.where((track) => !track.primary),
    ];
  }

  bool get _noAudio =>
      _picked is DeviceChoice &&
      (_source?.audio.isNotEmpty ?? false) &&
      _chosenAudio.isEmpty;

  /// Asks the server what each version comes to, for the audio and codec
  /// picked now.
  Future<void> _plan() async {
    final source = _source;
    final api = _api;
    if (source == null || api == null) return;
    final l = AppLocalizations.of(context);
    final round = ++_round;
    final audio = _chosenAudio;
    if (source.audio.isNotEmpty && audio.isEmpty) {
      setState(() => _planning = false);
      return;
    }
    setState(() => _planning = true);
    final downloads = ref.read(downloadsProvider.notifier);
    for (final choice in downloadChoices(source.resolved.choices.presets)) {
      if (choice is! DeviceChoice) continue;
      try {
        final result = (await downloads.resolve(
          api,
          [widget.item],
          Downloads.wishes(
            _settings,
            preset: choice.preset,
            codec: _codec,
            audio: [for (final track in audio) track.index],
          ),
        )).single;
        if (!mounted || round != _round) return;
        setState(() {
          switch (result) {
            case DownloadResolutionReady(:final spec, :final plan):
              _specs[choice] = spec;
              _plans[choice] = plan;
            case DownloadResolutionUnavailable(:final message):
              _specs.remove(choice);
              _plans.remove(choice);
              if (choice == _picked) _error = message.serverWords(l);
          }
        });
      } on Object catch (error) {
        if (!mounted || round != _round) return;
        setState(() => _error = describeFailure(l, error));
      }
    }
    if (!mounted || round != _round) return;
    setState(() {
      _planning = false;
      // A preset the server can't make for this file falls back to the
      // version for this device.
      if (_picked case DeviceChoice(preset: _?) && final picked
          when _plans[picked] == null) {
        _picked = const DeviceChoice();
      }
    });
  }

  Future<void> _start() async {
    final source = _source;
    final api = _api;
    if (source == null || api == null) return;
    final needed = switch (_picked) {
      OriginalChoice() => source.item.sizeBytes,
      final DeviceChoice choice => _plans[choice]?.estimatedBytes ?? 0,
    };
    if (!await roomFor(context, ref, needed) || !mounted) return;
    final l = AppLocalizations.of(context);
    final downloads = ref.read(downloadsProvider.notifier);
    unawaited(downloads.platform.askToNotify().then((_) {}, onError: _ignore));
    final saved = [
      for (final track in source.subtitles)
        if (_subtitles.contains(track.id)) track,
    ];
    switch (_picked) {
      case OriginalChoice():
        unawaited(downloads.downloadOriginal(api, source, l, subtitles: saved));
      case final DeviceChoice choice:
        final spec = _specs[choice];
        final plan = _plans[choice];
        if (spec != null && plan != null) {
          unawaited(
            downloads.downloadForDevice(
              api,
              source,
              spec,
              plan,
              l,
              subtitles: saved,
            ),
          );
        }
    }
    Navigator.of(context).pop();
  }

  static void _ignore(Object _) {}

  /// What the picked version comes to: its size, and how the video is
  /// saved.
  String _detail(AppLocalizations l, DownloadSource source) {
    switch (_picked) {
      case OriginalChoice():
        return [
          formatBytes(source.item.sizeBytes, l),
          source.item.container.toUpperCase(),
          if (!source.resolved.originalPlays) l.downloadsOriginalMayNotPlay,
        ].join(' · ');
      case final DeviceChoice choice:
        final plan = _plans[choice];
        if (plan == null) return l.downloadsChoiceUnavailable;
        return [
          l.downloadsAbout(formatBytes(plan.estimatedBytes, l)),
          '${plan.video.height}p ${videoCodecName(plan.video.codec)}',
        ].join(' · ');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final (primary, secondary) = downloadNames(widget.item, l);
    final source = _source;
    final error = _error;
    Widget body;
    Widget? footer;
    if (error != null) {
      body = Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: ErrorState(
          title: l.downloadsFailed,
          message: error,
          retryLabel: l.commonRetry,
        ),
      );
    } else if (source == null) {
      body = Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Spinner(
            size: 32,
            color: colors.accent,
            label: l.loadingInProgress,
          ),
        ),
      );
    } else {
      final device = _picked is DeviceChoice;
      // A size the server can't make for this file doesn't show.
      final shown = [
        for (final choice in downloadChoices(source.resolved.choices.presets))
          if (choice is! DeviceChoice ||
              choice.preset == null ||
              _plans[choice] != null)
            choice,
      ];
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          VersionPanel(
            choices: shown,
            picked: _picked,
            onPick: (choice) => setState(() => _picked = choice),
            codecs: source.resolved.choices.codecs,
            codec: _codec,
            onCodec: (codec) {
              setState(() => _codec = codec);
              unawaited(_plan());
            },
            plan: switch (_picked) {
              final DeviceChoice choice => _plans[choice],
              OriginalChoice() => null,
            },
            detail: _detail(l, source),
          ),
          // The file as it is keeps every track.
          if (device && source.audio.isNotEmpty) ...[
            SheetHeading(l.downloadsAudioTitle),
            for (final track in source.audio)
              CheckRow(
                title: track.label,
                detail: [track.format, ?track.layout].join(' · '),
                checked: _audio.contains(track.index),
                onChanged: (on) {
                  setState(
                    () => _audio = on
                        ? {..._audio, track.index}
                        : ({..._audio}..remove(track.index)),
                  );
                  unawaited(_plan());
                },
              ),
            if (_noAudio)
              Text(
                l.downloadsAudioNone,
                style: KitText.xs.style(color: colors.danger),
              ),
          ],
          if (source.subtitles.isNotEmpty) ...[
            SheetHeading(l.downloadsSubtitlesTitle),
            for (final track in source.subtitles)
              CheckRow(
                title: track.label,
                detail: [
                  if (track.forced) l.playerSubtitlesForced,
                  if (track.sdh) 'SDH',
                  track.format,
                ].join(' · '),
                checked: _subtitles.contains(track.id),
                onChanged: (on) => setState(
                  () => _subtitles = on
                      ? {..._subtitles, track.id}
                      : ({..._subtitles}..remove(track.id)),
                ),
              ),
          ],
        ],
      );
      final ready =
          _picked is OriginalChoice ||
          (!_planning && !_noAudio && _plans[_picked] != null);
      footer = MatineeButton(
        onPressed: ready ? _start : null,
        leading: Lucide.download,
        child: Text(l.downloadsStart),
      );
    }
    return Sheet(
      title: l.downloadsSheetTitleNamed(primary),
      description: secondary,
      footer: footer,
      child: body,
    );
  }
}

/// The version to save and its codec, as two menus, with what the version
/// comes to under them. The codec applies only to video that gets encoded:
/// the original keeps its file, and a version that keeps the video says
/// which codec it stays in.
class VersionPanel extends StatelessWidget {
  const VersionPanel({
    super.key,
    required this.choices,
    required this.picked,
    required this.onPick,
    required this.codecs,
    required this.codec,
    required this.onCodec,
    required this.plan,
    required this.detail,
  });

  final List<DownloadChoice> choices;
  final DownloadChoice picked;
  final ValueChanged<DownloadChoice> onPick;
  final List<String> codecs;
  final String? codec;
  final ValueChanged<String> onCodec;
  final DownloadPlan? plan;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final picked = this.picked;
    final codec = this.codec;
    final plan = this.plan;
    // Without a preset the server may keep the video, and then there's
    // nothing to encode.
    final kept =
        picked is DeviceChoice &&
        picked.preset == null &&
        plan != null &&
        plan.video.mode != 'encode';
    final detail = this.detail;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 6,
      children: [
        Panel(
          rows: [
            PickerRow<DownloadChoice>(
              title: l.downloadsDefaultTitle,
              options: [
                for (final choice in choices) (choice, choiceName(choice, l)),
              ],
              current: picked,
              onPicked: onPick,
            ),
            if (picked is DeviceChoice && codec != null && codecs.isNotEmpty)
              if (kept || codecs.length < 2)
                ValueRow(
                  title: l.downloadsCodec,
                  value: kept
                      ? l.downloadsCodecKept(videoCodecName(plan.video.codec))
                      : videoCodecName(codec),
                )
              else
                PickerRow<String>(
                  title: l.downloadsCodec,
                  options: [
                    for (final option in codecs)
                      (option, videoCodecName(option)),
                  ],
                  current: codec,
                  onPicked: onCodec,
                ),
          ],
        ),
        if (detail != null && detail.isNotEmpty)
          Text(detail, style: KitText.xs.style(color: colors.mutedForeground)),
      ],
    );
  }
}

/// A group's name in a sheet, like the audio tracks'.
class SheetHeading extends StatelessWidget {
  const SheetHeading(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 16, bottom: 4),
    child: Semantics(
      header: true,
      child: Text(
        text,
        style: KitText.sm.style(
          color: MatineeTheme.of(context).foreground,
          weight: FontWeight.w600,
        ),
      ),
    ),
  );
}

/// A choice of several in a sheet: a square mark, its name, and what it
/// is.
class CheckRow extends StatelessWidget {
  const CheckRow({
    super.key,
    required this.title,
    required this.checked,
    required this.onChanged,
    this.detail,
  });

  final String title;
  final String? detail;
  final bool checked;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final detail = this.detail;
    return PressIndication(
      onPressed: () => onChanged(!checked),
      label: detail == null || detail.isEmpty ? title : '$title, $detail',
      button: false,
      checked: checked,
      shape: KitRadius.control,
      builder: (context, state) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: ExcludeSemantics(
          child: Row(
            spacing: 14,
            children: [
              Checkbox(checked: checked, onChanged: onChanged),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: KitText.base.style(color: colors.foreground),
                    ),
                    if (detail != null && detail.isNotEmpty)
                      Text(
                        detail,
                        style: KitText.xs.style(color: colors.mutedForeground),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
