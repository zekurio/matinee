import Foundation

/// The profile and its statistics as the server last sent them, kept
/// across restarts, as Home keeps its rows: the profile shows them while
/// the server can't be reached, and in offline mode. One account's are
/// kept apart from another's by `username`. Android's `ProfileSnapshot`.
public struct ProfileSnapshot: Sendable {
  private let username: String
  private let suite: String?

  /// Kept in the defaults suite `suite`, or the app's own with nil, as tests keep theirs apart.
  public init(username: String, suite: String? = "profile_snapshot") {
    self.username = username
    self.suite = suite
  }

  public var profile: SavedEntry<Profile> { SavedEntry(key: "\(username)/profile", suite: suite) }

  /// The statistics for one range, like `all` or `30d`.
  public func stats(_ range: String) -> SavedEntry<WatchStats?> {
    SavedEntry(key: "\(username)/stats-\(range)", suite: suite)
  }
}

/// One answer saved as JSON under `key`; one that no longer decodes reads as none.
public struct SavedEntry<T: Codable & Sendable>: Kept, Sendable {
  let key: String
  let suite: String?

  private var defaults: UserDefaults { suite.flatMap(UserDefaults.init(suiteName:)) ?? .standard }

  public func read() -> T? {
    guard let text = defaults.string(forKey: key) else { return nil }
    return try? decodeSaved(T.self, text: text)
  }

  public func write(_ value: T) {
    guard let data = try? JSONEncoder().encode(value) else { return }
    defaults.set(String(decoding: data, as: UTF8.self), forKey: key)
  }
}
