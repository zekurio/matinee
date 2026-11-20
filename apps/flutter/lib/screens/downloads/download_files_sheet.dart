import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/session.dart';
import '../../core/toasts.dart';
import '../../downloads/download_settings.dart';
import '../../downloads/downloads.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/format.dart';
import 'download_sheet.dart';

/// Every file of a show, or of one of its seasons when [season] is set.
final class FileSet {
  const FileSet(this.title, {this.season});

  final TitleSummary title;
  final Season? season;

  Future<List<MediaItem>> load(MatineeApi api) {
    final season = this.season;
    if (season == null) return api.titleItems(title.id);
    final number = season.number;
    return number == null
        ? api.looseItems(title.id)
        : api.titleItems(title.id, season: number);
  }
}

/// Opens the sheet that downloads every file of [files].
Future<void> showDownloadFilesSheet(BuildContext context, FileSet files) {
  final l = AppLocalizations.of(context);
  return Sheet.show<void>(
    context,
    dismissLabel: l.commonCancel,
    builder: (context) => DownloadFilesSheet(files: files),
  );
}

/// Downloads a whole show or season, the Kotlin app's
/// `DownloadFilesSheet`: the files are resolved in batches, a version is
/// picked for all of them, and the plans the server returned are queued
/// without asking again.
class DownloadFilesSheet extends ConsumerStatefulWidget {
  const DownloadFilesSheet({super.key, required this.files});

  final FileSet files;

  @override
  ConsumerState<DownloadFilesSheet> createState() => _DownloadFilesSheetState();
}

class _DownloadFilesSheetState extends ConsumerState<DownloadFilesSheet> {
  List<MediaItem>? _items;
  String? _error;
  DownloadChoice _picked = const DeviceChoice();
  List<DownloadVideoPreset> _presets = const [];
  List<String> _codecs = const [];
  List<DownloadResolution>? _results;
  String? _codec;
  late DownloadSettings _settings;
  int _round = 0;

  @override
  void initState() {
    super.initState();
    // After the first frame, so what the sheet reads from above it is there.
    unawaited(Future.microtask(_load));
  }

  List<MediaItem> _missing(List<MediaItem> items) {
    final stored = ref.read(downloadsProvider).all;
    return [
      for (final item in items)
        if (!stored.containsKey(item.id)) item,
    ];
  }

  Future<void> _load() async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    try {
      if (api == null) throw StateError('no server');
      _settings = await ref.read(downloadSettingsProvider.future);
      final loaded = await widget.files.load(api);
      final results = await ref
          .read(downloadsProvider.notifier)
          .resolve(api, _missing(loaded), Downloads.wishes(_settings));
      if (!mounted) return;
      final ready = results.whereType<DownloadResolutionReady>();
      final presets = <int, DownloadVideoPreset>{
        for (final result in ready)
          for (final preset in result.choices.presets) preset.height: preset,
      }.values.toList()..sort((a, b) => b.height.compareTo(a.height));
      final codecs = {for (final result in ready) ...result.choices.codecs}
          .toList();
      setState(() {
        _presets = presets;
        _codecs = codecs;
        _codec = codecs.contains(_settings.videoCodec)
            ? _settings.videoCodec
            : null;
        _picked = startingChoice(_settings, presets);
        _results = results;
        _items = loaded;
      });
      // The setting's preset, or a codec this show can't have, needs other
      // plans than the first ask's.
      final asked = Downloads.wishes(_settings).codec;
      if (_picked case DeviceChoice(preset: _?)) {
        unawaited(_resolve());
      } else if (_picked is DeviceChoice && _codec != asked) {
        unawaited(_resolve());
      }
    } on Object catch (error) {
      if (mounted) setState(() => _error = describeFailure(l, error));
    }
  }

  /// The plans for the version and codec picked now.
  Future<void> _resolve() async {
    final items = _items;
    final api = ref.read(apiProvider);
    if (items == null || api == null) return;
    final l = AppLocalizations.of(context);
    final round = ++_round;
    final picked = _picked;
    setState(() => _results = null);
    try {
      final results = await ref
          .read(downloadsProvider.notifier)
          .resolve(
            api,
            _missing(items),
            Downloads.wishes(
              _settings,
              preset: picked is DeviceChoice ? picked.preset : null,
              codec: _codec,
            ),
          );
      if (mounted && round == _round) setState(() => _results = results);
    } on Object catch (error) {
      if (mounted && round == _round) {
        setState(() => _error = describeFailure(l, error));
      }
    }
  }

  void _start(List<MediaItem> missing, List<DownloadResolution> results) {
    final api = ref.read(apiProvider);
    if (api == null) return;
    final l = AppLocalizations.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    final downloads = ref.read(downloadsProvider.notifier);
    final toasts = container.read(toastProvider);
    final original = _picked is OriginalChoice;
    unawaited(downloads.platform.askToNotify().then((_) {}, onError: _ignore));
    unawaited(toasts.show(l.downloadsAllStarted(missing.length)));
    // Not this sheet's, so the files keep queueing after it goes.
    unawaited(
      downloads.downloadAll(api, missing, results, l, original: original).then((
        failed,
      ) {
        if (failed > 0) {
          unawaited(
            toasts.show(l.downloadsAllFailed(failed), kind: ToastKind.error),
          );
        }
      }, onError: _ignore),
    );
    Navigator.of(context).pop();
  }

  static void _ignore(Object _) {}

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    // The list as it stands now, so what finishes meanwhile counts.
    ref.watch(downloadsProvider.select((list) => list.all.length));
    final files = widget.files;
    final name = switch (files.season) {
      final season? => l.titleSeasonOf(
        files.title.name,
        seasonName(season.number, l),
      ),
      null => files.title.name,
    };
    final items = _items;
    final results = _results;
    final error = _error;
    Widget body;
    Widget? footer;
    if (error != null) {
      body = Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: ErrorState(
          title: l.downloadsFilesFailed,
          message: error,
          retryLabel: l.commonRetry,
        ),
      );
    } else if (items == null || results == null) {
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
      final missing = _missing(items);
      final have = items.length - missing.length;
      final summary = [
        if (missing.isNotEmpty) l.downloadsAllFiles(missing.length),
        if (have > 0) l.downloadsAllHave(have),
      ].join(' · ');
      final ready = results.whereType<DownloadResolutionReady>();
      final size = _picked is OriginalChoice
          ? missing.fold(0, (sum, item) => sum + item.sizeBytes)
          : ready.fold(0, (sum, result) => sum + result.plan.estimatedBytes);
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 12,
        children: [
          Text(
            summary.isEmpty ? l.downloadsAllEmpty : summary,
            style: KitText.sm.style(color: colors.mutedForeground),
          ),
          if (missing.isNotEmpty) ...[
            // Files that get encoded come in the codec picked; a preset
            // encodes every file.
            VersionPanel(
              choices: downloadChoices(_presets),
              picked: _picked,
              onPick: (choice) {
                setState(() => _picked = choice);
                unawaited(_resolve());
              },
              codecs: _codecs,
              codec: _codec ?? _codecs.firstOrNull,
              onCodec: (codec) {
                setState(() => _codec = codec);
                unawaited(_resolve());
              },
              plan: null,
              detail: l.downloadsAbout(formatBytes(size, l)),
            ),
            for (final unavailable
                in results.whereType<DownloadResolutionUnavailable>())
              Text(
                unavailable.message,
                style: KitText.sm.style(color: colors.danger),
              ),
          ],
        ],
      );
      if (missing.isNotEmpty) {
        footer = MatineeButton(
          onPressed: () => _start(missing, results),
          leading: Lucide.download,
          child: Text(l.downloadsStart),
        );
      }
    }
    return Sheet(
      title: l.downloadsSheetTitleNamed(name),
      footer: footer,
      child: body,
    );
  }
}
