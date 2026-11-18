import Foundation
import Observation

/// The full recently watched page asks for at most 100 entries, as Android does.
public let PROFILE_RECENT_LIMIT = 100

/// The range's last answer stays visible while a different range loads.
/// Each range keeps its own loader, as Android keeps one per range's key,
/// so a range picked again shows its answer at once while it refreshes.
@MainActor @Observable
public final class ProfileStats {
  public private(set) var range = "all"
  public private(set) var loader: Loader<WatchStats?>
  private var savedState: Load<WatchStats?>?
  private var last: WatchStats?
  @ObservationIgnored private var loaders: [String: Loader<WatchStats?>] = [:]
  private let snapshot: ProfileSnapshot?

  public init(snapshot: ProfileSnapshot? = nil) {
    self.snapshot = snapshot
    loader = Loader(kept: snapshot?.stats("all"))
    loaders["all"] = loader
  }

  public var state: Load<WatchStats?> { savedState ?? loader.state }
  public var stats: WatchStats? {
    if let savedState { return savedState.value ?? nil }
    if case .ready(let value) = state { return value ?? last }
    return last
  }
  public var neverWatched: Bool { range == "all" && stats?.totals.plays == 0 }

  /// A caller configures the new loader after selecting a range; one
  /// picked before comes back as it was, already configured.
  public func select(_ range: String) {
    guard range != self.range else { return }
    if case .ready(let value) = state { last = value }
    self.range = range
    savedState = nil
    if let known = loaders[range] {
      loader = known
    } else {
      loader = Loader(kept: snapshot?.stats(range))
      loaders[range] = loader
    }
  }

  /// Offline statistics never fetch. A range never saved is disconnected.
  public func showSaved() {
    if let saved = snapshot?.stats(range).read() {
      savedState = .ready(saved)
    } else {
      savedState = .failed("", disconnected: true)
    }
  }

  /// What the statistics section shows now: ProfileScreen.kt's `statistics`.
  public var content: StatsContent {
    let stats = stats
    if case .failed(let message, let disconnected) = state, stats == nil {
      return .failed(message, disconnected: disconnected)
    }
    guard let stats else { return state.isLoading ? .loading : .unavailable }
    if neverWatched { return .neverWatched }
    if stats.totals.plays == 0 { return .nothingInRange }
    return .shown(stats)
  }
}

/// The statistics section's states, in the order ProfileScreen.kt checks them.
public enum StatsContent: Equatable, Sendable {
  /// Nothing to show, and the fetch failed.
  case failed(String, disconnected: Bool)
  /// The first figures are on their way.
  case loading
  /// The server sent none, as for a profile whose statistics aren't shared.
  case unavailable
  /// Nothing ever watched: the range chips step aside.
  case neverWatched
  /// Nothing in the range picked, though there is in all time.
  case nothingInRange
  case shown(WatchStats)
}
