import Foundation
import OSLog
import Security

/// A download as this side keeps it, Android's `OfflineEntry` with what a
/// background URLSession needs on top: the attempt its tasks belong to, how
/// often it failed, and when it may try again. Dart keeps what the server
/// sent about the file in [meta] and reads it back as it was.
struct OfflineEntry: Codable, Hashable {
  enum State: String, Codable { case queued, running, paused, done, failed }
  enum Kind: String, Codable { case original, device }
  enum Failure: String, Codable { case unreachable, brokeOff = "broke_off", forbidden, server }

  var id: String
  var server: String
  var apiBase: String
  var kind: Kind
  var file: String
  var name: String
  var meta: String
  var streamUrl: String
  var imageUrl: String?
  var state: State = .queued
  var spec: String?
  var serverId: String?
  var segment = 0
  var bytes: Int64 = 0
  var totalBytes: Int64?
  var subtitles: [SavedSubtitle] = []
  var image: String?
  var errorKind: Failure?
  /// The server's own words for a refusal, with [Failure.server].
  var error: String?
  var addedAt: Int64

  /// Every pause, failure and restart starts a new one, and a task's
  /// answer counts only for the one it was started in.
  var generation = UUID().uuidString
  var attempts = 0
  /// How often a device version was started over on the server's word.
  var restarts = 0
  var retryAt: Date?
  /// The video is all here; it's done once its subtitles are.
  var videoDone = false
}

struct SavedSubtitle: Codable, Hashable {
  var trackId: String
  var file: String
  var url: String
}

/// The downloads, kept as one JSON file, and their files in a folder per
/// item, as Android's `DownloadStore`. Every change writes the list again,
/// on the disk before it takes the old list's place, so a download picks up
/// where it was after the app or the phone restarts. Main thread only.
final class DownloadStore {
  let root: URL
  private let index: URL
  private(set) var entries: [String: OfflineEntry] = [:]
  /// Hears every change.
  var changed: (() -> Void)?

  init() {
    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    root = support.appendingPathComponent("offline", isDirectory: true)
    index = root.appendingPathComponent("index.json")
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    // Downloads can be fetched again, so they stay out of iCloud and computer backups.
    var folder = root
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? folder.setResourceValues(values)
    entries = read()
  }

  /// Every download, oldest first.
  var all: [OfflineEntry] { entries.values.sorted { $0.addedAt < $1.addedAt } }

  subscript(id: String) -> OfflineEntry? { entries[id] }

  func file(_ entry: OfflineEntry) -> URL { root.appendingPathComponent(entry.file) }

  func folder(_ id: String) -> URL { root.appendingPathComponent(id, isDirectory: true) }

  func put(_ entry: OfflineEntry) {
    var next = entries
    next[entry.id] = entry
    set(next)
  }

  /// Changes an entry, if it's still there, and answers what it became.
  @discardableResult
  func update(_ id: String, _ change: (inout OfflineEntry) -> Void) -> OfflineEntry? {
    guard var entry = entries[id] else { return nil }
    let before = entry
    change(&entry)
    if entry != before {
      var next = entries
      next[id] = entry
      set(next)
    }
    return entry
  }

  /// Progress between the steps that are written down: shown, not kept,
  /// since the file's own length says how far an original got.
  func show(_ id: String, _ change: (inout OfflineEntry) -> Void) {
    guard var entry = entries[id], entry.state == .running else { return }
    change(&entry)
    entries[id] = entry
    changed?()
  }

  func remove(_ id: String) {
    try? FileManager.default.removeItem(at: folder(id))
    guard entries[id] != nil else { return }
    var next = entries
    next[id] = nil
    set(next)
  }

  private func set(_ next: [String: OfflineEntry]) {
    do {
      try write(next)
    } catch {
      Logger(subsystem: "io.github.zekurio.matinee", category: "downloads").error(
        "Could not save the downloads: \(String(describing: error), privacy: .public)")
    }
    entries = next
    changed?()
  }

  private func write(_ next: [String: OfflineEntry]) throws {
    let data = try JSONEncoder().encode(next.values.sorted { $0.addedAt < $1.addedAt })
    let temporary = root.appendingPathComponent("index.json.tmp")
    FileManager.default.createFile(atPath: temporary.path, contents: nil)
    let handle = try FileHandle(forWritingTo: temporary)
    try handle.write(contentsOf: data)
    // On the disk before it takes the list's place, so a download that shows
    // as running is still listed after the power goes, not lost with an
    // empty list.
    try handle.synchronize()
    try handle.close()
    guard rename(temporary.path, index.path) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
  }

  /// Each entry on its own, so one this app can't read any more doesn't lose the others.
  private func read() -> [String: OfflineEntry] {
    guard let data = try? Data(contentsOf: index),
      let list = try? JSONDecoder().decode([Readable].self, from: data)
    else { return [:] }
    return Dictionary(list.compactMap(\.entry).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
  }

  private struct Readable: Decodable {
    let entry: OfflineEntry?
    init(from decoder: Decoder) throws { entry = try? OfflineEntry(from: decoder) }
  }
}

/// What the fetches send to each saved server, which Dart hands over as it
/// signs in and out, so a download goes on with the app away, as Android's
/// `Credentials`. A server Dart never named, or forgot, has none: its
/// downloads wait. Tokens are in the Keychain, readable after the first
/// unlock, since a background session asks for the next part with the
/// phone locked.
final class DownloadCredentials {
  struct SignIn {
    let token: String?
    let userAgent: String
  }

  private static let service = "io.github.zekurio.matinee.download-credentials"
  private let defaults = UserDefaults(suiteName: "io.github.zekurio.matinee.downloads") ?? .standard

  func set(_ server: String, token: String?, userAgent: String) {
    defaults.set(true, forKey: "known:" + server)
    defaults.set(userAgent, forKey: "agent")
    let query: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword, kSecAttrService: Self.service, kSecAttrAccount: server,
    ]
    SecItemDelete(query as CFDictionary)
    guard let token else { return }
    var item = query
    item[kSecValueData] = Data(token.utf8)
    item[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(item as CFDictionary, nil)
  }

  func forget(_ server: String) {
    defaults.removeObject(forKey: "known:" + server)
    SecItemDelete(
      [kSecClass: kSecClassGenericPassword, kSecAttrService: Self.service, kSecAttrAccount: server] as CFDictionary)
  }

  /// What to send [server], or nil for a server that isn't saved.
  func of(_ server: String) -> SignIn? {
    guard defaults.bool(forKey: "known:" + server) else { return nil }
    var result: CFTypeRef?
    let status = SecItemCopyMatching(
      [
        kSecClass: kSecClassGenericPassword, kSecAttrService: Self.service, kSecAttrAccount: server,
        kSecReturnData: true, kSecMatchLimit: kSecMatchLimitOne,
      ] as CFDictionary, &result)
    let token = status == errSecSuccess ? (result as? Data).flatMap { String(data: $0, encoding: .utf8) } : nil
    return SignIn(token: token, userAgent: defaults.string(forKey: "agent") ?? "")
  }

  /// Whether [url] is on [server], by scheme, host, and port, so the token
  /// goes nowhere else, as the Dart clients bind it.
  static func sameOrigin(_ url: URL, _ server: String) -> Bool {
    guard let a = URLComponents(url: url, resolvingAgainstBaseURL: false), let b = URLComponents(string: server),
      a.user == nil, a.password == nil, let scheme = a.scheme?.lowercased(), scheme == b.scheme?.lowercased(),
      let host = a.host?.lowercased(), host == b.host?.lowercased()
    else { return false }
    func port(_ c: URLComponents) -> Int { c.port ?? (c.scheme?.lowercased() == "https" ? 443 : 80) }
    return port(a) == port(b)
  }
}
