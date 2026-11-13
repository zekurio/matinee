import Foundation
import MatineeCore
import Observation

/*
 * ProfileData.kt: what the profile loads and says, apart from its layout.
 * The snapshot it keeps is MatineeCore's (Profile/ProfileSnapshot.swift).
 */

/// "November 2026", the month the person joined, or nil when the server didn't say.
nonisolated func joinedMonth(_ profile: Profile) -> String? {
  formatJoinedMonth(profile.user.createdAt, locale: .app)
}

/// The statistics for a range, all time to start, a loader per range so a
/// range picked again shows at once. The last range's figures stay up while
/// the next one loads, so the page doesn't jump. Offline they're only what
/// was saved for each range.
@Observable final class ProfileStats {
  let username: String
  let snapshot: ProfileSnapshot
  private(set) var range = StatsRange.all
  /// The range shown before this one, whose figures stand in while this one loads.
  @ObservationIgnored private var previous: String?
  @ObservationIgnored private var loaders: [String: Loader<WatchStats?>] = [:]
  @ObservationIgnored private var saved: [String: WatchStats?] = [:]
  @ObservationIgnored private var savedOwn: Profile??

  init(username: String) {
    self.username = username
    snapshot = ProfileSnapshot(username: username)
  }

  func pick(_ next: String) {
    guard next != range else { return }
    if figures(offline: false) != nil { previous = range }
    range = next
  }

  /// The loader for `range`, made the first time it's asked for.
  func loader(_ range: String) -> Loader<WatchStats?> {
    if let loader = loaders[range] { return loader }
    let loader = Loader<WatchStats?>(kept: snapshot.stats(range))
    loaders[range] = loader
    return loader
  }

  var current: Loader<WatchStats?> { loader(range) }

  /// The profile as the server sent it last, read once a launch, for offline mode.
  func savedProfile() -> Profile? {
    if let savedOwn { return savedOwn }
    let read = snapshot.profile.read()
    savedOwn = .some(read)
    return read
  }

  /// What the server sent for `range` last, read once a launch.
  func savedStats(_ range: String) -> WatchStats? {
    if let kept = saved[range] { return kept }
    let read = snapshot.stats(range).read() ?? nil
    saved[range] = .some(read)
    return read
  }

  /// Where the shown range's figures stand: offline, saved or out of reach.
  func state(offline: Bool) -> Load<WatchStats?> {
    if offline {
      return savedStats(range).map { .ready($0) } ?? .failed("", disconnected: true)
    }
    return current.state
  }

  /// The figures shown: the range's, or the last range's while it loads.
  func figures(offline: Bool) -> WatchStats? {
    if offline { return savedStats(range) }
    if case .ready(let stats) = current.state { return stats }
    if let previous, case .ready(let stats) = loader(previous).state { return stats }
    return nil
  }

  /// With nothing ever watched, picking a period changes nothing.
  func neverWatched(offline: Bool) -> Bool { MatineeCore.neverWatched(figures(offline: offline), range: range) }

  /// Fetches `username`'s figures for `range`.
  nonisolated static func fetch(_ api: MatineeApi, username: String, range: String) async throws -> WatchStats? {
    let stats = try await api.profiles.stats(username: username, range: range, timeZone: statsTimeZone)
    #if DEBUG
      if StatsFixtures.on { return try await StatsFixtures.stats(stats, range: range, api: api) }
    #endif
    return stats
  }
}
