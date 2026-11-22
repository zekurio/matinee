import Flutter
import Foundation

/// [DownloadsHostApi] over the app's [Downloads], and the changes sent back
/// to Dart as they happen, at most one batch every tenth of a second, as
/// Android's `DownloadsBridge`. Pigeon calls it on the main thread.
final class DownloadsBridge: DownloadsHostApi {
  private let downloads: Downloads
  private let events: DownloadsEventsApi
  private var posted = false

  init(downloads: Downloads, messenger: FlutterBinaryMessenger) {
    self.downloads = downloads
    events = DownloadsEventsApi(binaryMessenger: messenger)
    downloads.store.changed = { [weak self] in self?.changed() }
  }

  private func changed() {
    guard !posted else { return }
    posted = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      guard let self else { return }
      posted = false
      let entries = downloads.store.all.map(Self.message)
      Task { @MainActor [events] in
        // Dart isn't listening yet; it reads the list when it starts.
        try? await events.changed(entries: entries)
      }
    }
  }

  func folder() throws -> String { downloads.store.root.path }

  func entries() throws -> [DownloadEntryMessage] { downloads.store.all.map(Self.message) }

  func enqueue(request: DownloadRequestMessage) throws { downloads.enqueue(Self.entry(request)) }

  func pause(id: String) throws { downloads.pause(id) }

  func resume(id: String) throws { downloads.resume(id) }

  func remove(id: String) throws { downloads.remove(id) }

  func forgetServer(server: String) throws { downloads.forgetServer(server) }

  func setUnmeteredOnly(on: Bool) throws { downloads.unmeteredOnly = on }

  func setCredentials(server: String, token: String?, userAgent: String) throws {
    downloads.setCredentials(server, token: token, userAgent: userAgent)
  }

  func restore() throws { downloads.restore() }

  func freeBytes() throws -> Int64 { downloads.freeBytes() }

  /// A background session needs no notification to go on, and iOS shows
  /// none for it, so there's nothing to ask.
  func askToNotify() async throws -> Bool { true }

  private static func entry(_ request: DownloadRequestMessage) -> OfflineEntry {
    OfflineEntry(
      id: request.id, server: request.server, apiBase: request.apiBase,
      kind: request.kind == .device ? .device : .original, file: request.file, name: request.name,
      meta: request.meta, streamUrl: request.streamUrl, imageUrl: request.imageUrl, spec: request.spec,
      totalBytes: request.totalBytes,
      subtitles: request.subtitles.map { SavedSubtitle(trackId: $0.trackId, file: $0.file, url: $0.url) },
      addedAt: Int64(Date().timeIntervalSince1970 * 1000))
  }

  private static func message(_ entry: OfflineEntry) -> DownloadEntryMessage {
    let state: DownloadStateMessage =
      switch entry.state {
      case .queued: .queued
      case .running: .running
      case .paused: .paused
      case .done: .done
      case .failed: .failed
      }
    let error: DownloadErrorMessage? =
      switch entry.errorKind {
      case .unreachable: .unreachable
      case .brokeOff: .brokeOff
      case .forbidden: .forbidden
      case .server: .server
      case nil: nil
      }
    return DownloadEntryMessage(
      id: entry.id, server: entry.server, kind: entry.kind == .device ? .device : .original, file: entry.file,
      name: entry.name, meta: entry.meta, state: state, bytes: entry.bytes, segment: Int64(entry.segment),
      subtitles: entry.subtitles.map { SavedSubtitleMessage(trackId: $0.trackId, file: $0.file, url: $0.url) },
      addedAt: entry.addedAt, totalBytes: entry.totalBytes, serverId: entry.serverId, image: entry.image,
      error: error, errorMessage: entry.error)
  }
}
