import 'dart:async';

import '../platform/downloads.g.dart' as wire;

/// What the platform does for the downloads: keeps the list, fetches the
/// files in the background, and says when anything changes. Android's is
/// `DownloadsBridge` over WorkManager; tests give their own.
abstract class DownloadsPlatform {
  /// The folder the files are in, as an absolute path.
  Future<String> folder();

  Future<List<wire.DownloadEntryMessage>> entries();

  /// Every download after each change.
  Stream<List<wire.DownloadEntryMessage>> get changes;

  Future<void> enqueue(wire.DownloadRequestMessage request);
  Future<void> pause(String id);
  Future<void> resume(String id);
  Future<void> remove(String id);
  Future<void> forgetServer(String server);
  Future<void> setUnmeteredOnly(bool on);
  Future<void> setCredentials(String server, String? token, String userAgent);
  Future<void> restore();
  Future<int> freeBytes();
  Future<bool> askToNotify();
}

/// The platform's side over the Pigeon channels in `pigeons/downloads.dart`.
final class PigeonDownloadsPlatform
    implements DownloadsPlatform, wire.DownloadsEventsApi {
  PigeonDownloadsPlatform() {
    wire.DownloadsEventsApi.setUp(this);
  }

  final _host = wire.DownloadsHostApi();
  final _changes =
      StreamController<List<wire.DownloadEntryMessage>>.broadcast();

  @override
  void changed(List<wire.DownloadEntryMessage> entries) =>
      _changes.add(entries);

  @override
  Stream<List<wire.DownloadEntryMessage>> get changes => _changes.stream;

  @override
  Future<String> folder() => _host.folder();

  @override
  Future<List<wire.DownloadEntryMessage>> entries() => _host.entries();

  @override
  Future<void> enqueue(wire.DownloadRequestMessage request) =>
      _host.enqueue(request);

  @override
  Future<void> pause(String id) => _host.pause(id);

  @override
  Future<void> resume(String id) => _host.resume(id);

  @override
  Future<void> remove(String id) => _host.remove(id);

  @override
  Future<void> forgetServer(String server) => _host.forgetServer(server);

  @override
  Future<void> setUnmeteredOnly(bool on) => _host.setUnmeteredOnly(on);

  @override
  Future<void> setCredentials(String server, String? token, String userAgent) =>
      _host.setCredentials(server, token, userAgent);

  @override
  Future<void> restore() => _host.restore();

  @override
  Future<int> freeBytes() => _host.freeBytes();

  @override
  Future<bool> askToNotify() => _host.askToNotify();
}
