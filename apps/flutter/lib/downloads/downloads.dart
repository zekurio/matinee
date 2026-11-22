import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/matinee_api.dart';
import '../core/address.dart';
import '../core/session.dart';
import '../l10n/app_localizations.dart';
import '../media/format.dart';
import '../platform/downloads.g.dart' as wire;
import '../player/playback_device.dart';
import '../player/player_preferences.dart';
import '../player/player_state.dart';
import '../query/server_data.dart';
import 'download_settings.dart';
import 'downloads_platform.dart';
import 'offline_item.dart';
import 'pending_progress.dart';

export 'offline_item.dart';

/// The platform's side of the downloads. Tests give their own.
final downloadsPlatformProvider = Provider<DownloadsPlatform>(
  (ref) => PigeonDownloadsPlatform(),
);

/// The downloads of every saved server, and where their files are.
final class DownloadsList {
  const DownloadsList({this.folder, this.all = const {}, this.loaded = false});

  /// The folder their files are in, once the platform said.
  final String? folder;

  /// By file id.
  final Map<String, OfflineItem> all;

  /// The platform answered at least once.
  final bool loaded;

  /// [relative] in the downloads folder, or null before it's known.
  String? path(String? relative) {
    final root = folder;
    if (root == null || relative == null) return null;
    return '$root/$relative';
  }
}

/// A file the server can save, with what `downloads.resolve` said of it.
final class DownloadSource {
  const DownloadSource(this.item, this.resolved);

  final MediaItem item;
  final DownloadResolutionReady resolved;

  List<AudioTrack> get audio => [
    for (final choice in resolved.choices.audio) choice.track,
  ];
  List<SubtitleTrack> get subtitles => resolved.choices.subtitles;

  /// The audio the server's plan keeps, as the sheet starts.
  List<AudioTrack> get defaultAudio {
    final kept = {
      for (final audio in resolved.spec.audio)
        switch (audio) {
          DownloadAudioCopy(:final index) => index,
          DownloadAudioEncode(:final index) => index,
        },
    };
    return [
      for (final track in audio)
        if (kept.contains(track.index)) track,
    ];
  }

  /// The subtitles the server's plan saves, as the sheet starts.
  List<SubtitleTrack> get defaultSubtitles {
    final kept = {...?resolved.spec.subtitles};
    return [
      for (final track in subtitles)
        if (kept.contains(track.id)) track,
    ];
  }
}

final downloadsProvider = NotifierProvider<Downloads, DownloadsList>(
  Downloads.new,
);

/// The server in use, by the origin key its downloads go by, or null
/// without one.
final downloadsServerProvider = Provider<String?>((ref) {
  final api = ref.watch(apiProvider);
  return api == null ? null : originKey(api.base);
});

/// The downloads of the server in use, which everything that shows or
/// plays them reads; the others wait for their server.
final shownDownloadsProvider = Provider<Map<String, OfflineItem>>((ref) {
  final server = ref.watch(downloadsServerProvider);
  final all = ref.watch(downloadsProvider.select((list) => list.all));
  if (server == null) return const {};
  return {
    for (final MapEntry(:key, :value) in all.entries)
      if (value.server == server) key: value,
  };
});

/// The finished download of [id] from the server in use, if there's one.
final finishedDownloadProvider = Provider.family<OfflineItem?, String>((
  ref,
  id,
) {
  final entry = ref.watch(shownDownloadsProvider)[id];
  return entry != null && entry.done ? entry : null;
});

/// The space the downloads of the server in use take.
final downloadsBytesProvider = Provider<int>(
  (ref) => ref
      .watch(shownDownloadsProvider)
      .values
      .fold(0, (sum, entry) => sum + entry.bytes),
);

/// The space left where the downloads go, asked again as a download
/// finishes or goes; null until the platform says.
final freeBytesProvider = FutureProvider<int?>((ref) async {
  ref.watch(
    downloadsProvider.select(
      (list) => list.all.values.where((entry) => entry.done).length,
    ),
  );
  try {
    return await ref.watch(downloadsPlatformProvider).freeBytes();
  } on Object {
    return null;
  }
});

/// What the account may stream and save.
final playbackOptionsProvider = serverQuery((api) => api.playback.options());

/// The account may download. False until the server said so, so nothing
/// offers a download it would refuse.
final mayDownloadProvider = Provider<bool>(
  (ref) => ref.watch(playbackOptionsProvider).value?.downloads ?? false,
);

/// What this device plays, for `downloads.resolve`: the engine's profile,
/// without the playback settings' transcoding codecs, since a download has
/// a codec of its own setting.
final downloadDeviceProvider = FutureProvider<PlaybackDevice>((ref) async {
  final engine = await ref.watch(playerEngineProvider.future);
  final codecs = engine == PlayerEngine.media3
      ? await ref.watch(playbackCodecsProvider.future)
      : null;
  return playbackDevice(
    engine,
    codecs,
    WidgetsBinding.instance.platformDispatcher.locale.languageCode,
  );
});

/// What notifications and screens call a file: "Show · S1, E2", or the
/// movie.
String downloadName(MediaItem item, AppLocalizations l) {
  final names = itemNames(item, l);
  final code = item.label.code;
  return item.title?.kind == TitleKind.show && code != null
      ? '${names.showName} · $code'
      : names.title;
}

/// The downloads: the platform fetches each file and keeps the list; this
/// follows it and tells it what to do. Each download belongs to the server it
/// came from, and only the server in use shows its own
/// ([shownDownloadsProvider]).
class Downloads extends Notifier<DownloadsList> {
  late DownloadsPlatform _platform;

  @override
  DownloadsList build() {
    _platform = ref.watch(downloadsPlatformProvider);
    final changes = _platform.changes.listen(_take);
    ref.onDispose(changes.cancel);
    unawaited(_load());
    return const DownloadsList();
  }

  Future<void> _load() async {
    try {
      final folder = await _platform.folder();
      final entries = await _platform.entries();
      if (!ref.mounted) return;
      state = DownloadsList(folder: folder, all: _read(entries), loaded: true);
    } on Object {
      // No platform side, as in a test: there are none.
      if (ref.mounted) {
        state = DownloadsList(
          folder: state.folder,
          all: state.all,
          loaded: true,
        );
      }
    }
  }

  void _take(List<wire.DownloadEntryMessage> entries) {
    state = DownloadsList(
      folder: state.folder,
      all: _read(entries),
      loaded: true,
    );
  }

  static Map<String, OfflineItem> _read(
    List<wire.DownloadEntryMessage> entries,
  ) => {for (final item in entries.map(OfflineItem.of).nonNulls) item.id: item};

  DownloadsPlatform get platform => _platform;

  /// [wishes] for each of [items], a hundred at a time.
  Future<List<DownloadResolution>> resolve(
    MatineeApi api,
    List<MediaItem> items,
    DownloadWishes wishes,
  ) async {
    final device = await ref.read(downloadDeviceProvider.future);
    return [
      for (var start = 0; start < items.length; start += 100)
        ...await api.downloads.resolve(
          DownloadResolveInput(
            ids: [for (final item in items.skip(start).take(100)) item.id],
            device: device,
            wishes: wishes,
          ),
        ),
    ];
  }

  /// What to ask the server for: [preset]'s size, or the device's own;
  /// [codec], or the setting's; [audio] by stream index, or the account's
  /// preferred languages.
  static DownloadWishes wishes(
    DownloadSettings settings, {
    DownloadVideoPreset? preset,
    String? codec,
    List<int>? audio,
  }) => DownloadWishes(
    preset: preset == null
        ? null
        : DownloadWishesPreset(height: preset.height, bitrate: preset.bitrate),
    codec:
        codec ??
        (settings.videoCodec == automaticCodec ? null : settings.videoCodec),
    audio: audio == null ? 'preferred' : 'selected',
    audioIndices: audio,
    subtitles: settings.subtitles.name,
  );

  wire.DownloadRequestMessage _request(
    MatineeApi api,
    MediaItem item, {
    required wire.DownloadKindMessage kind,
    required String file,
    required List<AudioTrack> audio,
    required List<SubtitleTrack> subtitles,
    required AppLocalizations l,
    String? spec,
    int? totalBytes,
  }) {
    final paths = api.paths;
    final art = item.episode?.still ?? item.title?.images.backdrop;
    return wire.DownloadRequestMessage(
      id: item.id,
      server: originKey(api.base),
      apiBase: paths.route(['api']).toString(),
      kind: kind,
      file: file,
      name: downloadName(item, l),
      meta: DownloadMeta(
        item: item,
        audio: audio,
        subtitles: subtitles,
      ).encode(),
      streamUrl: paths.stream(item.id).toString(),
      imageUrl: (art == null ? paths.thumbnail(item.id) : paths.artwork(art.id))
          .toString(),
      subtitles: [
        for (final (index, track) in subtitles.indexed)
          wire.SavedSubtitleMessage(
            trackId: track.id,
            file: '${item.id}/subtitles/$index.vtt',
            url: paths.subtitle(item.id, track.id).toString(),
          ),
      ],
      spec: spec,
      totalBytes: totalBytes,
    );
  }

  /// The file as it is, with every track it has, and [subtitles] saved as
  /// WebVTT beside it.
  Future<void> downloadOriginal(
    MatineeApi api,
    DownloadSource source,
    AppLocalizations l, {
    List<SubtitleTrack>? subtitles,
  }) {
    final item = source.item;
    final dot = item.relativePath.lastIndexOf('.');
    final found = dot < 0 ? '' : item.relativePath.substring(dot + 1);
    final extension = (found.isEmpty ? 'mkv' : found).toLowerCase();
    return _platform.enqueue(
      _request(
        api,
        item,
        kind: wire.DownloadKindMessage.original,
        file:
            '${item.id}/video.${extension.substring(0, extension.length.clamp(0, 5))}',
        audio: source.audio,
        subtitles: subtitles ?? source.defaultSubtitles,
        l: l,
        totalBytes: item.sizeBytes,
      ),
    );
  }

  /// A version the server makes for this device, by [spec] and [plan].
  Future<void> downloadForDevice(
    MatineeApi api,
    DownloadSource source,
    DownloadSpec spec,
    DownloadPlan plan,
    AppLocalizations l, {
    List<SubtitleTrack>? subtitles,
  }) {
    final item = source.item;
    final audio = [
      for (final planned in plan.audio)
        _plannedAudio(
          planned,
          source.audio,
          primary: planned == plan.audio.first,
        ),
    ];
    // The player loads saved WebVTT files, not subtitle streams in the file.
    final kept = DownloadSpec(
      container: spec.container,
      video: spec.video,
      audio: spec.audio,
      subtitles: const [],
      burnIn: spec.burnIn,
    );
    return _platform.enqueue(
      _request(
        api,
        item,
        kind: wire.DownloadKindMessage.device,
        file: '${item.id}/video.mp4',
        audio: audio,
        subtitles: subtitles ?? source.defaultSubtitles,
        l: l,
        spec: jsonEncode(kept.toJson()),
        totalBytes: plan.estimatedBytes,
      ),
    );
  }

  static AudioTrack _plannedAudio(
    DownloadPlanAudio planned,
    List<AudioTrack> original, {
    required bool primary,
  }) {
    final source = original.where((track) => track.index == planned.index);
    return AudioTrack(
      index: planned.index,
      label: planned.label,
      language: planned.language,
      title: source.firstOrNull?.title,
      codec: planned.codec,
      format: planned.codec.toUpperCase(),
      channels: planned.channels,
      layout: source.firstOrNull?.layout,
      primary: primary,
    );
  }

  /// Every one of [items] that isn't here yet, as [results] resolved it.
  /// Returns how many the server couldn't make.
  Future<int> downloadAll(
    MatineeApi api,
    List<MediaItem> items,
    List<DownloadResolution> results,
    AppLocalizations l, {
    required bool original,
  }) async {
    var failed = 0;
    final have = state.all;
    for (final item in items) {
      if (have.containsKey(item.id)) continue;
      final ready = results
          .whereType<DownloadResolutionReady>()
          .where((result) => result.id == item.id)
          .firstOrNull;
      if (ready == null) {
        failed++;
        continue;
      }
      final source = DownloadSource(item, ready);
      if (original) {
        await downloadOriginal(api, source, l);
      } else {
        await downloadForDevice(api, source, ready.spec, ready.plan, l);
      }
    }
    return failed;
  }

  Future<void> pause(String id) => _platform.pause(id);

  Future<void> resume(String id) => _platform.resume(id);

  /// Deletes the download of [id]; with [api], the server lets go of a
  /// version it was making for it.
  Future<void> remove(String id, MatineeApi? api) async {
    final serverId = state.all[id]?.serverId;
    await _platform.remove(id);
    if (serverId != null && api != null) {
      unawaited(api.downloads.remove(serverId).then((_) {}, onError: _ignore));
    }
  }

  static void _ignore(Object _) {}

  /// Every download of the server in use.
  Future<void> removeAll(MatineeApi? api) async {
    // Not through shownDownloadsProvider, which follows this one.
    final server = ref.read(downloadsServerProvider);
    final ids = [
      for (final entry in state.all.values)
        if (entry.server == server) entry.id,
    ];
    for (final id in ids) {
      await remove(id, api);
    }
  }

  /// A server is being removed: its downloads go, and what waited to reach
  /// it. With [api], still signed in there, what waited is sent first and
  /// the server lets go of versions it was making, as far as it answers in
  /// a few seconds.
  Future<void> forgetServer(String server, MatineeApi? api) async {
    final pending = ref.read(pendingProgressProvider.notifier);
    if (api != null) {
      Future<void> tell() async {
        try {
          await pending.flush(server, api);
        } on Object {
          // What can't be sent goes with the server.
        }
        for (final entry in state.all.values) {
          final id = entry.serverId;
          if (entry.server != server || id == null) continue;
          try {
            await api.downloads.remove(id);
          } on Object {
            // It cleans up after itself in time.
          }
        }
      }

      await tell().timeout(const Duration(seconds: 8), onTimeout: () {});
    }
    await _platform.forgetServer(server);
    await pending.clear(server);
  }
}
