import Foundation
import Observation

public let DEFAULT_DEVICE = "device"
public let DEFAULT_ORIGINAL = "original"

public enum DownloadSubtitles: String, Codable, Sendable { case used, all, none }
public struct DownloadSource: Sendable {
  public let item: MediaItem
  public let resolved: DownloadResolution.Ready
  public var audio: [AudioTrack] { resolved.choices.audio.map(\.track) }
  public var subtitles: [SubtitleTrack] { resolved.choices.subtitles }
  public init(item: MediaItem, resolved: DownloadResolution.Ready) {
    self.item = item
    self.resolved = resolved
  }
}
public struct OfflinePlayback: Sendable {
  public let entry: OfflineItem
  public let url: URL
  public let subtitles: [SavedSubtitle]
  public let positionSeconds: Double
  public let pending: PendingProgress
  public struct SavedSubtitle: Sendable {
    public let track: SubtitleTrack
    public let url: URL
  }
}
@Observable @MainActor public final class Downloads {
  public let store: DownloadStore
  public let worker: DownloadWorker
  private let defaults: UserDefaults
  private var pendings: [String: PendingProgress] = [:]
  public var unmeteredOnly: Bool {
    didSet {
      defaults.set(unmeteredOnly, forKey: "downloads.unmetered")
      worker.unmeteredOnly = unmeteredOnly
    }
  }
  public var defaultVersion: String {
    didSet { defaults.set(defaultVersion, forKey: "downloads.version") }
  }
  public var videoCodec: String { didSet { defaults.set(videoCodec, forKey: "downloads.codec") } }
  public var subtitles: DownloadSubtitles {
    didSet { defaults.set(subtitles.rawValue, forKey: "downloads.subtitles") }
  }
  public init(
    root: URL? = nil, defaults: UserDefaults = .standard,
    configuration: URLSessionConfiguration? = nil,
    client: @escaping @MainActor (String) -> MatineeApi?
  ) throws {
    store = try DownloadStore(root: root)
    self.defaults = defaults
    unmeteredOnly = defaults.object(forKey: "downloads.unmetered") as? Bool ?? true
    defaultVersion = defaults.string(forKey: "downloads.version") ?? "device"
    videoCodec = defaults.string(forKey: "downloads.codec") ?? "auto"
    subtitles =
      DownloadSubtitles(rawValue: defaults.string(forKey: "downloads.subtitles") ?? "used") ?? .used
    worker = DownloadWorker(
      store: store, configuration: configuration,
      unmeteredOnly: defaults.object(forKey: "downloads.unmetered") as? Bool ?? true, client: client
    )
  }
  /// Only the active server's completed file can be handed to the player.
  /// The player chooses offline tracks from entry.audio and these saved VTTs.
  public func playback(_ id: String) throws -> OfflinePlayback? {
    guard let entry = store.done(id), FileManager.default.fileExists(atPath: store.file(entry).path)
    else { return nil }
    let pending = try pendingFor(entry.server)
    return OfflinePlayback(
      entry: entry, url: store.file(entry),
      subtitles: entry.subtitles.map {
        .init(track: $0.track, url: store.root.appending(path: $0.file))
      },
      positionSeconds: pending.report(id)?.positionSeconds ?? entry.item.progress?.positionSeconds
        ?? 0, pending: pending)
  }
  public func pendingFor(_ server: String) throws -> PendingProgress {
    if let existing = pendings[server] { return existing }
    let pending = try PendingProgress(root: store.root, server: server)
    pendings[server] = pending
    return pending
  }
  public func wishes(
    preset: DownloadWishes.Preset? = nil, codec: String? = nil, audio: [Int]? = nil
  ) -> DownloadWishes {
    .init(
      preset: preset, codec: codec ?? (videoCodec == "auto" ? nil : videoCodec),
      audio: audio == nil ? "preferred" : "selected", audioIndices: audio,
      subtitles: subtitles.rawValue)
  }
  public func resolve(
    api: MatineeApi, items: [MediaItem], device: PlaybackDevice, wishes: DownloadWishes
  ) async throws -> [DownloadResolution] {
    var results: [DownloadResolution] = []
    for start in stride(from: 0, to: items.count, by: 100) {
      results += try await api.downloads.resolve(
        downloadResolveInput: .init(
          ids: items[start..<min(start + 100, items.count)].map(\.id), device: device,
          wishes: wishes))
    }
    return results
  }
  public func defaultAudio(_ source: DownloadSource) -> [AudioTrack] {
    let indices = Set(
      source.resolved.spec.audio.map { audio in
        switch audio {
        case .copy(let track): track.index
        case .encode(let track): track.index
        }
      })
    return source.audio.filter { indices.contains($0.index) }
  }
  public func defaultSubtitles(_ source: DownloadSource) -> [SubtitleTrack] {
    source.subtitles.filter { source.resolved.spec.subtitles?.contains($0.id) == true }
  }
  @discardableResult public func enqueue(
    _ source: DownloadSource, server: String, original: Bool,
    spec: DownloadSpec? = nil, plan: DownloadPlan? = nil, subtitles: [SubtitleTrack]? = nil
  ) async throws -> OfflineItem {
    if let existing = store.all.values.first(where: {
      $0.server == server && $0.id == source.item.id
    }) {
      return existing
    }
    var entry = OfflineItem(
      item: source.item, kind: original ? .original : .device, file: "", server: server)
    // The suffix only preserves the original container for local players. It
    // does not decide what goes into a version; resolve supplied that spec.
    let suffix = String(source.item.relativePath.split(separator: ".").last ?? "mkv").lowercased()
    let safeSuffix =
      suffix.allSatisfy { $0.isASCII && $0.isLetter || $0.isNumber }
      ? String(suffix.prefix(5)) : "mkv"
    entry.file = "\(entry.key)/video.\(original ? safeSuffix : "mp4")"
    entry.totalBytes =
      original ? source.item.sizeBytes : (plan ?? source.resolved.plan).estimatedBytes
    entry.audio = source.audio
    if !original {
      let selected = plan ?? source.resolved.plan
      entry.spec = spec ?? source.resolved.spec
      entry.spec?.subtitles = []
      entry.audio = selected.audio.enumerated().map { index, track in
        let old = source.audio.first { $0.index == track.index }
        return AudioTrack(
          index: track.index, label: track.label, language: track.language, title: old?.title,
          codec: track.codec, format: track.codec.uppercased(), channels: track.channels,
          layout: old?.layout, primary: index == 0)
      }
    }
    entry.subtitles = (subtitles ?? defaultSubtitles(source)).enumerated().map {
      OfflineSubtitle(track: $0.element, file: "\(entry.key)/subtitles/\($0.offset).vtt")
    }
    try FileManager.default.createDirectory(
      at: store.root.appending(path: entry.key), withIntermediateDirectories: true)
    try store.put(entry)
    await worker.schedule(entry.key)
    return entry
  }
  public func pause(_ id: String) async throws {
    guard let entry = store.items[id] else { return }
    try await worker.pause(entry.key)
  }
  public func resume(_ id: String) async throws {
    guard let entry = store.items[id] else { return }
    try store.update(entry.key) {
      $0.state = .queued
      $0.error = nil
      $0.failure = nil
      $0.attempts = 0
      $0.retryAt = nil
    }
    await worker.schedule(entry.key)
  }
  public func remove(_ id: String) async throws {
    guard let entry = store.items[id] else { return }
    try await worker.remove(entry.key)
  }
  public func removeAll() async throws {
    for id in Array(store.items.keys) { try await remove(id) }
  }
  public func forgetServer(_ server: String, api: MatineeApi? = nil) async throws {
    // Local deletion must not wait for an unreachable server. Unlike Android's
    // eight-second best effort flush, callers flush before this if desired.
    for entry in store.all.values.filter({ $0.server == server }) {
      try await worker.remove(entry.key)
    }
    try pendingFor(server).clear()
    pendings[server] = nil
  }
  public func restore() async { await worker.restore() }
}
