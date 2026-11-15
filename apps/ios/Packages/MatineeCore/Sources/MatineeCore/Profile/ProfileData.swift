import Foundation
import Observation

/// The full recently watched page asks for at most 100 entries, as Android does.
public let PROFILE_RECENT_LIMIT = 100

/// Profile page data. Requests attach separately; they are not part of this loader.
@MainActor public func profileLoader(api: MatineeApi, username: String, snapshot: ProfileSnapshot? = nil,
                                     describe: @escaping @MainActor (Failure) -> String) -> Loader<Profile> {
  let loader = Loader<Profile>(kept: snapshot?.profile)
  loader.configure(describe: describe) { try await api.profiles.get(username: username) }
  return loader
}

/// The range's last answer stays visible while a different range loads.
@MainActor @Observable
public final class ProfileStats {
  public private(set) var range = "all"
  public private(set) var loader: Loader<WatchStats?>
  private var savedState: Load<WatchStats?>?
  private var last: WatchStats?
  private let snapshot: ProfileSnapshot?

  public init(snapshot: ProfileSnapshot? = nil) {
    self.snapshot = snapshot
    loader = Loader(kept: snapshot?.stats("all"))
  }

  public var state: Load<WatchStats?> { savedState ?? loader.state }
  public var stats: WatchStats? {
    if let savedState { return savedState.value ?? nil }
    if case .ready(let value) = state { return value ?? last }
    return last
  }
  public var neverWatched: Bool { range == "all" && stats?.totals.plays == 0 }

  /// Configure the current range with the app's localized failure description.
  public func configure(api: MatineeApi, username: String, timeZone: String = TimeZone.current.identifier,
                        describe: @escaping @MainActor (Failure) -> String) {
    savedState = nil
    let range = range
    loader.configure(describe: describe) {
      try await api.profiles.stats(username: username, range: range, timeZone: timeZone)
    }
  }

  /// A caller configures the new loader after selecting a range.
  public func select(_ range: String) {
    guard range != self.range else { return }
    if case .ready(let value) = state { last = value }
    self.range = range
    savedState = nil
    loader = Loader(kept: snapshot?.stats(range))
  }

  /// Offline statistics never fetch. A range never saved is disconnected.
  public func showSaved() {
    if let saved = snapshot?.stats(range).read() {
      savedState = .ready(saved)
    } else {
      savedState = .failed("", disconnected: true)
    }
  }
}

@MainActor public func recentLoader(api: MatineeApi, username: String,
                                    describe: @escaping @MainActor (Failure) -> String) -> Loader<[WatchedEntry]?> {
  let loader = Loader<[WatchedEntry]?>()
  loader.configure(describe: describe) {
    try await api.profiles.recent(username: username, limit: PROFILE_RECENT_LIMIT)
  }
  return loader
}

@MainActor public func favoritesLoader(api: MatineeApi, username: String,
                                       describe: @escaping @MainActor (Failure) -> String) -> Loader<Favorites?> {
  let loader = Loader<Favorites?>()
  loader.configure(describe: describe) { try await api.profiles.favorites(username: username) }
  return loader
}

@MainActor public func leaderboardLoader(api: MatineeApi, range: String, timeZone: String = TimeZone.current.identifier,
                                         describe: @escaping @MainActor (Failure) -> String) -> Loader<Leaderboard> {
  let loader = Loader<Leaderboard>()
  loader.configure(describe: describe) { try await api.stats.leaderboard(range: range, timeZone: timeZone) }
  return loader
}
