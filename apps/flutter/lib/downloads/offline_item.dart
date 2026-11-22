import 'dart:convert';

import '../api/matinee_api.dart';
import '../platform/downloads.g.dart' as wire;

/// What a download is doing, as the platform keeps it.
enum DownloadState {
  /// Waiting for its turn, or for a connection that fits the settings.
  queued,
  running,
  paused,
  done,
  failed,
}

/// Why a download stopped or waits to try again. The app words each in its
/// own language; only [server] comes with words, the server's.
enum DownloadError { unreachable, brokeOff, forbidden, server }

/// The file as it is, or a version the server makes for this device.
enum DownloadKind { original, device }

/// A subtitle track saved beside a download as WebVTT, at [file] in the
/// downloads folder.
final class OfflineSubtitle {
  const OfflineSubtitle(this.track, this.file);

  final SubtitleTrack track;
  final String file;
}

/// What Dart keeps with a download, which the platform hands back as it
/// was: the item as the server sent it, the audio tracks the file holds,
/// and the subtitle tracks picked to save beside it.
final class DownloadMeta {
  const DownloadMeta({
    required this.item,
    required this.audio,
    required this.subtitles,
  });

  /// Null when what was kept can't be read any more, as after an update
  /// changed the models: that download doesn't show, and the rest do.
  static DownloadMeta? decode(String text) {
    try {
      final fields = jsonDecode(text);
      if (fields is! Map<String, Object?>) return null;
      return DownloadMeta(
        item: MediaItem.fromJson(fields['item']),
        audio: _list(fields['audio'], AudioTrack.fromJson),
        subtitles: _list(fields['subtitles'], SubtitleTrack.fromJson),
      );
    } on FormatException {
      return null;
    } on TypeError {
      return null;
    }
  }

  final MediaItem item;
  final List<AudioTrack> audio;
  final List<SubtitleTrack> subtitles;

  static List<T> _list<T>(Object? value, T Function(Object?) read) => [
    for (final entry in value is List<Object?> ? value : const <Object?>[])
      read(entry),
  ];

  String encode() => jsonEncode({
    'item': item.toJson(),
    'audio': [for (final track in audio) track.toJson()],
    'subtitles': [for (final track in subtitles) track.toJson()],
  });
}

/// A file downloaded, or on its way, with what the app needs to show and play
/// it without the server.
final class OfflineItem {
  const OfflineItem({
    required this.id,
    required this.server,
    required this.kind,
    required this.file,
    required this.meta,
    required this.state,
    required this.bytes,
    required this.saved,
    required this.addedAt,
    this.totalBytes,
    this.serverId,
    this.image,
    this.error,
    this.errorMessage,
  });

  /// The platform's entry, or null when Dart can't read what it kept.
  static OfflineItem? of(wire.DownloadEntryMessage entry) {
    final meta = DownloadMeta.decode(entry.meta);
    if (meta == null) return null;
    return OfflineItem(
      id: entry.id,
      server: entry.server,
      kind: switch (entry.kind) {
        wire.DownloadKindMessage.original => DownloadKind.original,
        wire.DownloadKindMessage.device => DownloadKind.device,
      },
      file: entry.file,
      meta: meta,
      state: switch (entry.state) {
        wire.DownloadStateMessage.queued => DownloadState.queued,
        wire.DownloadStateMessage.running => DownloadState.running,
        wire.DownloadStateMessage.paused => DownloadState.paused,
        wire.DownloadStateMessage.done => DownloadState.done,
        wire.DownloadStateMessage.failed => DownloadState.failed,
      },
      bytes: entry.bytes,
      totalBytes: entry.totalBytes,
      saved: {
        for (final subtitle in entry.subtitles) subtitle.trackId: subtitle.file,
      },
      addedAt: DateTime.fromMillisecondsSinceEpoch(entry.addedAt),
      serverId: entry.serverId,
      image: entry.image,
      error: switch (entry.error) {
        wire.DownloadErrorMessage.unreachable => DownloadError.unreachable,
        wire.DownloadErrorMessage.brokeOff => DownloadError.brokeOff,
        wire.DownloadErrorMessage.forbidden => DownloadError.forbidden,
        wire.DownloadErrorMessage.server => DownloadError.server,
        null => null,
      },
      errorMessage: entry.errorMessage,
    );
  }

  /// The file's id on the server.
  final String id;

  /// The saved server it came from, by its origin key. It shows, plays, and
  /// syncs only with that server.
  final String server;
  final DownloadKind kind;

  /// The video, relative to the downloads folder.
  final String file;
  final DownloadMeta meta;
  final DownloadState state;
  final int bytes;

  /// The file's size, or the server's estimate for a device version.
  final int? totalBytes;

  /// The subtitles saved so far, by track id, to their files.
  final Map<String, String> saved;
  final DateTime addedAt;

  /// The server's id of a device version while it's being fetched.
  final String? serverId;

  /// A still or backdrop saved for the list, relative to the folder.
  final String? image;
  final DownloadError? error;

  /// The server's own words, with [DownloadError.server].
  final String? errorMessage;

  MediaItem get item => meta.item;
  List<AudioTrack> get audio => meta.audio;

  /// The subtitles that came, each with its saved file.
  List<OfflineSubtitle> get subtitles => [
    for (final track in meta.subtitles)
      if (saved[track.id] case final file?) OfflineSubtitle(track, file),
  ];

  bool get done => state == DownloadState.done;

  /// Still going, or waiting for its turn.
  bool get moving =>
      state == DownloadState.running || state == DownloadState.queued;

  /// It stopped, or waits to try again after a failure.
  bool get hasError => error != null;

  /// It broke off: given up, or waiting to try again after an error.
  bool get broken => hasError || state == DownloadState.failed;

  /// How far it is, 0 to 1, or null when its size isn't known.
  double? get progress {
    final total = totalBytes;
    if (total == null || total <= 0) return null;
    return (bytes / total).clamp(0.0, 1.0);
  }

  bool get isShow => item.title != null && item.title!.kind == TitleKind.show;
}
