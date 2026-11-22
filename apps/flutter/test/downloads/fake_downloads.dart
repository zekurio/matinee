import 'dart:async';

import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/downloads/downloads_platform.dart';
import 'package:matinee/platform/downloads.g.dart' as wire;

/// The platform's downloads in memory: requests become entries, and a test
/// moves them on with [put].
final class FakeDownloadsPlatform implements DownloadsPlatform {
  FakeDownloadsPlatform([List<wire.DownloadEntryMessage> entries = const []]) {
    for (final entry in entries) {
      _entries[entry.id] = entry;
    }
  }

  final _entries = <String, wire.DownloadEntryMessage>{};
  final _changes =
      StreamController<List<wire.DownloadEntryMessage>>.broadcast();
  final requests = <wire.DownloadRequestMessage>[];
  final calls = <String>[];
  final credentials = <String, String?>{};
  bool? unmeteredOnly;
  int free = 32 * 1024 * 1024 * 1024;

  List<wire.DownloadEntryMessage> get current => _entries.values.toList();

  void put(wire.DownloadEntryMessage entry) {
    _entries[entry.id] = entry;
    _changes.add(current);
  }

  void _drop(bool Function(wire.DownloadEntryMessage) test) {
    _entries.removeWhere((_, entry) => test(entry));
    _changes.add(current);
  }

  @override
  Stream<List<wire.DownloadEntryMessage>> get changes => _changes.stream;

  @override
  Future<String> folder() async => '/data/offline';

  @override
  Future<List<wire.DownloadEntryMessage>> entries() async => current;

  @override
  Future<void> enqueue(wire.DownloadRequestMessage request) async {
    requests.add(request);
    if (_entries.containsKey(request.id)) return;
    put(
      wire.DownloadEntryMessage(
        id: request.id,
        server: request.server,
        kind: request.kind,
        file: request.file,
        name: request.name,
        meta: request.meta,
        state: wire.DownloadStateMessage.queued,
        bytes: 0,
        segment: 0,
        subtitles: const [],
        addedAt: 0,
        totalBytes: request.totalBytes,
      ),
    );
  }

  @override
  Future<void> pause(String id) async {
    calls.add('pause $id');
    final entry = _entries[id];
    if (entry != null) put(entryWith(entry, wire.DownloadStateMessage.paused));
  }

  @override
  Future<void> resume(String id) async {
    calls.add('resume $id');
    final entry = _entries[id];
    if (entry != null) put(entryWith(entry, wire.DownloadStateMessage.queued));
  }

  @override
  Future<void> remove(String id) async {
    calls.add('remove $id');
    _drop((entry) => entry.id == id);
  }

  @override
  Future<void> forgetServer(String server) async {
    calls.add('forget $server');
    _drop((entry) => entry.server == server);
  }

  @override
  Future<void> setUnmeteredOnly(bool on) async => unmeteredOnly = on;

  @override
  Future<void> setCredentials(
    String server,
    String? token,
    String userAgent,
  ) async => credentials[server] = token;

  @override
  Future<void> restore() async => calls.add('restore');

  @override
  Future<int> freeBytes() async => free;

  @override
  Future<bool> askToNotify() async => true;
}

wire.DownloadEntryMessage entryWith(
  wire.DownloadEntryMessage entry,
  wire.DownloadStateMessage state, {
  int? bytes,
  wire.DownloadErrorMessage? error,
}) => wire.DownloadEntryMessage(
  id: entry.id,
  server: entry.server,
  kind: entry.kind,
  file: entry.file,
  name: entry.name,
  meta: entry.meta,
  state: state,
  bytes: bytes ?? entry.bytes,
  segment: entry.segment,
  subtitles: entry.subtitles,
  addedAt: entry.addedAt,
  totalBytes: entry.totalBytes,
  serverId: entry.serverId,
  image: entry.image,
  error: error,
);

/// A download of [item] from [server], [state] and [bytes] of [total].
wire.DownloadEntryMessage downloadEntry(
  Map<String, Object?> item, {
  required String server,
  wire.DownloadStateMessage state = wire.DownloadStateMessage.done,
  int bytes = 1000,
  int? total = 1000,
  wire.DownloadKindMessage kind = wire.DownloadKindMessage.original,
  wire.DownloadErrorMessage? error,
  String? errorMessage,
  List<SubtitleTrack> subtitles = const [],
  int addedAt = 0,
}) {
  final media = MediaItem.fromJson(item);
  return wire.DownloadEntryMessage(
    id: media.id,
    server: server,
    kind: kind,
    file: '${media.id}/video.mkv',
    name: media.fileTitle,
    meta: DownloadMeta(
      item: media,
      audio: const [],
      subtitles: subtitles,
    ).encode(),
    state: state,
    bytes: bytes,
    segment: 0,
    subtitles: [
      for (final (index, track) in subtitles.indexed)
        wire.SavedSubtitleMessage(
          trackId: track.id,
          file: '${media.id}/subtitles/$index.vtt',
          url: '',
        ),
    ],
    addedAt: addedAt,
    totalBytes: total,
    error: error,
    errorMessage: errorMessage,
  );
}
