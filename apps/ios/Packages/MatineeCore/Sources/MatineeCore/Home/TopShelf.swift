import Foundation

/// A credential-free, versioned handoff to the separate Top Shelf process.
public struct TopShelfSnapshot: Codable, Sendable, Equatable {
  public var version = 1
  public var sections: [Section]
  public struct Section: Codable, Sendable, Equatable {
    public var id: String
    public var title: String
    public var entries: [Entry]
    public init(id: String, title: String, entries: [Entry]) { self.id = id; self.title = title; self.entries = entries }
  }
  public struct Entry: Codable, Sendable, Equatable {
    public var id: String
    public var title: String
    public var artworkId: String?
    public var poster: Bool
    public var progress: Double
    public var play: URL
    public var display: URL
    public var image: String?
  }
  public init(sections: [Section]) { self.sections = sections }
}

public struct TopShelfLink: Equatable, Sendable {
  public let server: String
  public let user: String
  public let item: String
  public let play: Bool

  public init(server: String, user: String, item: String, play: Bool) {
    self.server = server; self.user = user; self.item = item; self.play = play
  }
  public var url: URL {
    var parts = URLComponents()
    parts.scheme = "matinee"; parts.host = "top-shelf"
    parts.queryItems = [URLQueryItem(name: "server", value: server), URLQueryItem(name: "user", value: user),
      URLQueryItem(name: "item", value: item), URLQueryItem(name: "action", value: play ? "play" : "display")]
    return parts.url!
  }
  public init?(url: URL) {
    guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false), parts.scheme == "matinee",
      parts.host == "top-shelf" else { return nil }
    let query = Dictionary((parts.queryItems ?? []).compactMap { q in q.value.map { (q.name, $0) } }, uniquingKeysWith: { _, last in last })
    guard let server = query["server"], let user = query["user"], let item = query["item"],
      !server.isEmpty, !user.isEmpty, !item.isEmpty, let action = query["action"], ["play", "display"].contains(action) else { return nil }
    self.init(server: server, user: user, item: item, play: action == "play")
  }
}

/// Preserve both server lists and their order, capped at Android Watch Next's twelve per row.
public func topShelfSnapshot(continuing: [MediaItem], next: [MediaItem], server: String, user: String,
  continuingTitle: String, nextTitle: String, label: (MediaItem) -> String
) -> TopShelfSnapshot {
  func entries(_ items: [MediaItem]) -> [TopShelfSnapshot.Entry] {
    items.prefix(12).map { item in
      let landscape = item.episode?.still ?? item.title?.images.backdrop
      let artwork = landscape ?? item.title?.images.poster
      let duration = item.durationSeconds ?? 0
      let progress = duration > 0 ? (item.progress?.positionSeconds ?? 0) / duration : 0
      return TopShelfSnapshot.Entry(id: item.id, title: label(item), artworkId: artwork?.id,
        poster: landscape == nil, progress: progress.isFinite ? min(1, max(0, progress)) : 0,
        play: TopShelfLink(server: server, user: user, item: item.id, play: true).url,
        display: TopShelfLink(server: server, user: user, item: item.id, play: false).url)
    }
  }
  return TopShelfSnapshot(sections: [
    .init(id: "continue", title: continuingTitle, entries: entries(continuing)), .init(id: "next", title: nextTitle, entries: entries(next))
  ].filter { !$0.entries.isEmpty })
}

/// Owns only the TopShelf subdirectory, never the whole group container.
public struct TopShelfStore: Sendable {
  public let directory: URL
  public init(container: URL) { directory = container.appendingPathComponent("TopShelf", isDirectory: true) }
  public func read() -> TopShelfSnapshot? {
    guard let data = try? Data(contentsOf: directory.appendingPathComponent("snapshot.json")),
      let snapshot = try? JSONDecoder().decode(TopShelfSnapshot.self, from: data), snapshot.version == 1 else { return nil }
    return snapshot
  }
  public func write(_ snapshot: TopShelfSnapshot, images: [String: Data]) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    for (name, bytes) in images where Self.safe(name) {
      try bytes.write(to: directory.appendingPathComponent(name), options: .atomic)
    }
    try JSONEncoder().encode(snapshot).write(to: directory.appendingPathComponent("snapshot.json"), options: .atomic)
    let wanted = Set(snapshot.sections.flatMap(\.entries).compactMap(\.image) + ["snapshot.json"])
    for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) where !wanted.contains(file.lastPathComponent) {
      try? FileManager.default.removeItem(at: file)
    }
  }
  public func imageURL(_ name: String) -> URL? { Self.safe(name) ? directory.appendingPathComponent(name) : nil }
  public func clear() { try? FileManager.default.removeItem(at: directory) }
  private static func safe(_ name: String) -> Bool { !name.isEmpty && !name.contains("/") && !name.contains("..") }
}
