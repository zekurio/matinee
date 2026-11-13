import Foundation

/// A sitting stays bound to its server even when the app switches accounts.
@MainActor public final class DownloadPlayerAdapter: PlayerDownloads {
  private let downloads: Downloads
  public let server: String
  private var started: [String: Date] = [:]

  public init(downloads: Downloads, server: String) {
    self.downloads = downloads
    self.server = server
  }

  public func playback(itemId: String) async throws -> LocalPlayback {
    guard
      let entry = downloads.store.all.values.first(where: {
        $0.server == server && $0.id == itemId && $0.state == .done
      }), FileManager.default.fileExists(atPath: downloads.store.file(entry).path)
    else {
      throw CocoaError(.fileNoSuchFile)
    }
    let pending = try downloads.pendingFor(server)
    let subtitles = entry.subtitles.filter {
      FileManager.default.fileExists(atPath: downloads.store.root.appending(path: $0.file).path)
    }
    return LocalPlayback(
      item: entry.item, file: downloads.store.file(entry), audio: entry.audio,
      subtitles: subtitles.map(\.track),
      saved: Dictionary(
        uniqueKeysWithValues: subtitles.map {
          ($0.track.id, downloads.store.root.appending(path: $0.file))
        }),
      at: pending.report(itemId)?.positionSeconds ?? entry.item.progress?.positionSeconds ?? 0)
  }

  public func next(after item: MediaItem) async -> MediaItem? {
    guard let title = item.title, title.kind == TitleKind.show,
      let season = item.seasonNumber, let episode = item.episodeNumber
    else { return nil }
    return downloads.store.all.values.filter {
      $0.server == server && $0.state == .done && $0.item.title?.id == title.id
        && $0.item.seasonNumber != nil && $0.item.episodeNumber != nil
        && FileManager.default.fileExists(atPath: downloads.store.file($0).path)
    }.map(\.item).filter {
      ($0.seasonNumber ?? 0, $0.episodeNumber ?? 0) > (season, episode)
    }.min {
      ($0.seasonNumber ?? 0, $0.episodeNumber ?? 0)
        < ($1.seasonNumber ?? 0, $1.episodeNumber ?? 0)
    }
  }

  public func queueReport(
    itemId: String, sessionId: String, position: Double, duration: Double?, played: Double,
    closed: Bool
  ) async {
    let now = Date()
    // The protocol does not supply the sitting's start. Estimate only on the
    // first report, then keep that timestamp stable for subsequent updates.
    let start = started[sessionId] ?? now.addingTimeInterval(-max(0, played))
    started[sessionId] = start
    do {
      let pending = try downloads.pendingFor(server)
      try pending.put(itemId, .init(positionSeconds: max(0, position), durationSeconds: duration))
      if played > 0 {
        try pending.putPlay(
          .init(
            sessionId: sessionId, itemId: itemId, startedAt: start.ISO8601Format(),
            endedAt: now.ISO8601Format(), playedSeconds: played,
            positionSeconds: max(0, position), durationSeconds: duration))
      }
      if closed { started[sessionId] = nil }
    } catch {
      AppLog.downloads.error("Could not persist offline playback progress")
    }
  }
}
