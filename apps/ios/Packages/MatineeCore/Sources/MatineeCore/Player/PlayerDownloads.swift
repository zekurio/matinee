import Foundation

/// A download on the device, which plays without the server, from `at`
/// seconds in. Kotlin's `Opening.Local`, less the starting tracks, which
/// the controller picks with `downloadAudio` and `downloadSubtitle`.
public struct LocalPlayback: Sendable {
  public var item: MediaItem
  public var file: URL
  public var audio: [AudioTrack]
  public var subtitles: [SubtitleTrack]
  /// Subtitles saved beside it, by track id.
  public var saved: [String: URL]
  public var at: Double
  public init(
    item: MediaItem, file: URL, audio: [AudioTrack], subtitles: [SubtitleTrack],
    saved: [String: URL], at: Double
  ) {
    self.item = item
    self.file = file
    self.audio = audio
    self.subtitles = subtitles
    self.saved = saved
    self.at = at
  }
}

/// What the player needs of the downloads: a download to play, the episode
/// after it, and where reports wait that don't reach the server (Kotlin's
/// `PendingProgress`). All of it belongs to the controller's server.
@MainActor public protocol PlayerDownloads {
  func playback(itemId: String) async throws -> LocalPlayback
  func next(after item: MediaItem) async -> MediaItem?
  /// A report that didn't reach the server, to send once it answers, and the
  /// sitting so far for watch time when any of it played.
  func queueReport(itemId: String, report: PendingReport, play: PlaybackOfflineInput.Play?) async
  /// A report reached the server, so what waited for this item and sitting goes.
  func reported(itemId: String, sessionId: String) async
}

extension PlayerDownloads {
  public func next(after item: MediaItem) async -> MediaItem? { nil }
}

/// There's no finished download of the file on this server.
public struct NoDownload: Error, Sendable {}

/// `PlayerDownloads` from the app's `Downloads`, for one server: what
/// `Downloads.playback(_:)` hands over, and its `PendingProgress` for the
/// reports. `api`, when given, is that server's, for the next episode.
@MainActor public final class ServerPlayerDownloads: PlayerDownloads {
  private let downloads: Downloads
  private let server: String
  private let api: MatineeApi?
  public init(downloads: Downloads, server: String, api: MatineeApi? = nil) {
    self.downloads = downloads
    self.server = server
    self.api = api
  }
  public func playback(itemId: String) async throws -> LocalPlayback {
    guard let offline = try downloads.playback(itemId), offline.entry.server == server else {
      throw NoDownload()
    }
    let item = offline.entry.item
    // A file watched to the end starts over, as Android's player does, unless
    // a report kept offline says where a later sitting got to.
    let finished = item.progress?.completed == true && offline.pending.report(itemId) == nil
    let at = finished ? 0 : offline.positionSeconds
    return LocalPlayback(
      item: item, file: offline.url, audio: offline.entry.audio,
      subtitles: offline.subtitles.map(\.track),
      saved: Dictionary(
        offline.subtitles.map { ($0.track.id, $0.url) }, uniquingKeysWith: { first, _ in first }),
      at: at)
  }
  /// The episode after a download's, from the server when it answers. A
  /// file the server plays has it in the answer from `playback.start`.
  public func next(after item: MediaItem) async -> MediaItem? {
    guard let api, let title = item.title, title.kind == TitleKind.show,
      let all = try? await api.titleItems(title.id),
      let index = all.firstIndex(where: { $0.id == item.id })
    else { return nil }
    // Not in the list, as a file just removed, has no next.
    return all.indices.contains(index + 1) ? all[index + 1] : nil
  }
  public func queueReport(itemId: String, report: PendingReport, play: PlaybackOfflineInput.Play?)
    async
  {
    guard let pending = try? downloads.pendingFor(server) else { return }
    try? pending.put(itemId, report)
    if let play { try? pending.putPlay(play) }
  }
  public func reported(itemId: String, sessionId: String) async {
    guard let pending = try? downloads.pendingFor(server) else { return }
    try? pending.drop(itemId)
    try? pending.dropPlay(sessionId)
  }
}
