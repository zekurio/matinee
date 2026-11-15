import Foundation
import Observation

public enum DownloadState: String, Codable, Sendable { case queued, running, paused, done, failed }
public enum DownloadKind: String, Codable, Sendable { case original, device }
public struct OfflineSubtitle: Codable, Sendable, Hashable {
  public var track: SubtitleTrack
  public var file: String
  public init(track: SubtitleTrack, file: String) {
    self.track = track
    self.file = file
  }
}
public struct OfflineItem: Codable, Sendable, Identifiable, Hashable {
  // A UUID directory also keeps identical item ids on different servers apart.
  public var key = UUID().uuidString
  public var item: MediaItem
  public var kind: DownloadKind
  public var file: String
  public var state: DownloadState = .queued
  public var spec: DownloadSpec?
  public var serverId: String?
  public var videoComplete = false
  public var segment = 0
  public var bytes: Int64 = 0
  public var totalBytes: Int64?
  public var audio: [AudioTrack] = []
  public var subtitles: [OfflineSubtitle] = []
  public var image: String?
  public var error: String?
  public var failure: DownloadFailure?
  public var addedAt = Date().timeIntervalSince1970
  public var server: String
  public var attempts = 0
  public var restarts = 0
  public var retryAt: Date?
  public var generation = UUID().uuidString
  public var id: String { item.id }
  public var progress: Double? {
    totalBytes.flatMap { $0 > 0 ? min(1, max(0, Double(bytes) / Double($0))) : nil }
  }
  public init(item: MediaItem, kind: DownloadKind, file: String, server: String) {
    self.item = item
    self.kind = kind
    self.file = file
    self.server = server
  }
}

// The UI observes snapshots; DownloadFiles owns disk mutations and the index.
@Observable @MainActor public final class DownloadStore {
  public let root: URL
  let files: DownloadFiles
  private var revision = 0
  public var server: String?
  public private(set) var all: [String: OfflineItem] = [:]
  public var items: [String: OfflineItem] {
    Dictionary(uniqueKeysWithValues: all.values.filter { $0.server == server }.map { ($0.id, $0) })
  }
  public init(root: URL? = nil) throws {
    self.root =
      root
      ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appending(path: "Matinee/downloads", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true)
    // Downloads must survive cache eviction, but can be fetched again. Keeping
    // them out of cloud and Finder/iTunes backups avoids copying large media.
    var url = self.root
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
    var loaded: [String: OfflineItem] = [:]
    if let data = try? Data(contentsOf: self.root.appending(path: "index.json")) {
      let entries = try JSONDecoder().decode([JSONValue].self, from: data)
      for entry in entries {
        if let value = try? JSONDecoder().decode(
          OfflineItem.self, from: JSONEncoder().encode(entry)),
          UUID(uuidString: value.key) != nil, value.file.hasPrefix(value.key + "/"),
          !([value.file] + value.subtitles.map(\.file) + [value.image].compactMap { $0 }).contains(
            where: {
              !$0.hasPrefix(value.key + "/") || $0.split(separator: "/").contains("..")
            })
        {
          loaded[value.key] = value
        }
      }
    }
    files = DownloadFiles(root: self.root, entries: loaded)
    all = loaded
  }
  private func accept(_ snapshot: DownloadFiles.Snapshot) {
    guard snapshot.revision > revision else { return }
    revision = snapshot.revision
    all = snapshot.entries
  }
  // URLSession's progress describes its temporary file, not committed media.
  // Show it without advancing the durable byte cursor.
  func showProgress(_ key: String, _ change: (inout OfflineItem) -> Void) {
    guard var entry = all[key], entry.state == .running else { return }
    change(&entry)
    all[key] = entry
  }
  public func put(_ entry: OfflineItem) async throws {
    accept(try await files.put(entry))
  }
  public func update(_ key: String, _ change: @Sendable (inout OfflineItem) -> Void) async throws {
    accept(try await files.change(key, change))
  }
  func append(
    _ source: URL, entry: OfflineItem, offset: Int64, segment: Bool = false,
    keepSource: Bool = false
  ) async throws {
    accept(
      try await files.commitAppend(
        source, entry: entry, offset: offset, segment: segment, keepSource: keepSource))
  }
  public func done(_ id: String) -> OfflineItem? {
    items[id].flatMap { $0.state == .done ? $0 : nil }
  }
  public func file(_ entry: OfflineItem) -> URL { root.appending(path: entry.file) }
  public func remove(_ key: String) async throws {
    accept(try await files.remove(key))
  }
  public var storageUsed: Int64 {
    get async { await files.storageUsed() }
  }
}

public struct Place: Sendable {
  public var positionSeconds: Double
  public var durationSeconds: Double?
  public var ratio: Double? {
    durationSeconds.flatMap { $0 > 0 ? min(1, max(0, positionSeconds / $0)) : nil }
  }
  public init(_ positionSeconds: Double, _ durationSeconds: Double?) {
    self.positionSeconds = positionSeconds
    self.durationSeconds = durationSeconds
  }
}
public struct ServedRows: Codable, Sendable {
  public var resume: [String] = []
  public var nextUp: [String] = []
  public init(resume: [String] = [], nextUp: [String] = []) {
    self.resume = resume
    self.nextUp = nextUp
  }
}
public struct OfflineShow: Sendable {
  public var title: TitleSummary
  public var episodes: [OfflineItem]
  public var newest: OfflineItem { episodes.max { $0.addedAt < $1.addedAt }! }
}
public struct OfflineHomeRows: Sendable {
  public var resume: [OfflineItem]
  public var nextUp: [OfflineItem]
  public var movies: [OfflineItem]
  public var shows: [OfflineShow]
  public var isEmpty: Bool { movies.isEmpty && shows.isEmpty }
}
public func offlineHomeRows(
  _ entries: [OfflineItem], place: (OfflineItem) -> Place?, watched: (OfflineItem) -> Bool,
  served: ServedRows = .init()
) -> OfflineHomeRows {
  let done = entries.filter { $0.state == .done }.sorted { $0.addedAt > $1.addedAt }
  let byId = Dictionary(uniqueKeysWithValues: done.map { ($0.id, $0) })
  func started(_ e: OfflineItem) -> Bool { !watched(e) && (place(e)?.positionSeconds ?? 0) > 0 }
  func unique(_ list: [OfflineItem], key: (OfflineItem) -> String = { $0.id }) -> [OfflineItem] {
    var seen: Set<String> = []
    return list.filter { seen.insert(key($0)).inserted }
  }
  let resume = unique(
    served.resume.compactMap { byId[$0] }.filter { !watched($0) } + done.filter(started))
  func isShow(_ e: OfflineItem) -> Bool { e.item.title?.kind == TitleKind.show }
  func season(_ n: Int?) -> Int { n == nil ? Int.max : n == 0 ? Int.max - 1 : n! }
  let shows = Dictionary(grouping: done.filter(isShow), by: { $0.item.title!.id }).values.map {
    files in
    OfflineShow(
      title: files[0].item.title!,
      episodes: files.sorted {
        (season($0.item.seasonNumber), $0.item.episodeNumber ?? Int.max) < (
          season($1.item.seasonNumber), $1.item.episodeNumber ?? Int.max
        )
      })
  }.sorted { $0.newest.addedAt > $1.newest.addedAt }
  let worked = shows.compactMap { show -> OfflineItem? in
    guard let last = show.episodes.lastIndex(where: { watched($0) || started($0) }) else {
      return nil
    }
    return show.episodes.dropFirst(last + 1).first { !watched($0) && !started($0) }
  }
  let resumed = Set(resume.map(\.id))
  let next = unique(
    served.nextUp.compactMap { byId[$0] }.filter { !watched($0) && !started($0) } + worked
  ).filter { !resumed.contains($0.id) }
  return OfflineHomeRows(
    resume: resume, nextUp: unique(next, key: { $0.item.title?.id ?? $0.id }),
    movies: done.filter { !isShow($0) }, shows: shows)
}

@MainActor public final class HomeSnapshot {
  private let file: URL
  public init(root: URL, server: String) {
    // Base64 is a filename here, never a credential.
    let key = Data(server.utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_")
    file = root.appending(path: "home-\(key).json")
  }
  public func read() -> ServedRows {
    (try? JSONDecoder().decode(ServedRows.self, from: Data(contentsOf: file))) ?? .init()
  }
  public func save(_ rows: ServedRows) throws {
    try JSONEncoder().encode(rows).write(to: file, options: .atomic)
  }
}
