import Foundation
import MatineeCore
import Observation
import SwiftUI

/*
 * ProfileData.kt: what the profile loads, apart from its layout. The
 * figures' range and what the section shows from them are MatineeCore's
 * `ProfileStats` (Profile/ProfileData.swift), the favorites rail's
 * filtering is `shownFavorites` (Profile/ProfileFavorites.swift), and the
 * snapshot kept for offline is `ProfileSnapshot`, all tested on the Mac.
 * This file holds them together for the page and gives them their fetches.
 */

/// "November 2026", the month the person joined, or nil when the server didn't say.
nonisolated func joinedMonth(_ profile: Profile) -> String? {
  formatJoinedMonth(profile.user.createdAt, locale: .app)
}

/// The profile page's loads: the profile, the statistics for the range
/// picked, and the leaderboard for it, one per range, as Android keeps one
/// per range's key. What the server sent last is kept per account
/// (`ProfileSnapshot`), for while it can't be reached and for offline mode.
@MainActor @Observable final class ProfileLoads {
  let username: String
  @ObservationIgnored let snapshot: ProfileSnapshot
  let profile: Loader<Profile>
  let stats: ProfileStats
  @ObservationIgnored private var boards: [String: Loader<Leaderboard>] = [:]
  /// The board shown for the range before this one, standing in while this one loads.
  private var lastBoard: Leaderboard?
  @ObservationIgnored private var saved: Profile??

  init(username: String) {
    self.username = username
    snapshot = ProfileSnapshot(username: username)
    profile = Loader(kept: snapshot.profile)
    stats = ProfileStats(snapshot: snapshot)
    #if DEBUG
      // `-dev.statsRange 7d`, for screenshots of each range.
      if let range = UserDefaults.standard.string(forKey: "dev.statsRange") { stats.select(range) }
    #endif
  }

  var range: String { stats.range }

  /// Picks the range the statistics and the leaderboard show. Offline,
  /// what was saved for it, or the cloud for one never opened online.
  func pick(_ range: String, offline: Bool) {
    if let shown = leaderboard(self.range).state.value { lastBoard = shown }
    stats.select(range)
    if offline { stats.showSaved() }
  }

  /// The leaderboard's loader for `range`, made the first time it's asked for.
  func leaderboard(_ range: String) -> Loader<Leaderboard> {
    if let loader = boards[range] { return loader }
    let loader = Loader<Leaderboard>()
    boards[range] = loader
    return loader
  }

  /// The board to show: the range's, or the last range's while it loads.
  var board: Leaderboard? { leaderboard(range).state.value ?? lastBoard }

  /// The profile as the server sent it last, read once, for offline mode,
  /// which leaves the server alone.
  func savedProfile() -> Profile? {
    if let saved { return saved }
    let read = snapshot.profile.read()
    saved = .some(read)
    return read
  }

  /// Where the profile stands: offline, what was saved, or nil with nothing.
  func profileState(offline: Bool) -> Load<Profile>? {
    offline ? savedProfile().map { .ready($0) } : profile.state
  }

  /// Everything the page shows that can't reach the server, for the cloud in its header.
  var reloadable: [any Reloadable] { [profile, stats.loader, leaderboard(range)] }

  /// Everything on the page again, as a pull asks.
  func refresh() async {
    profile.reload()
    stats.loader.reload()
    leaderboard(range).reload()
    await profile.settled()
    await stats.loader.settled()
    await leaderboard(range).settled()
  }

  // MARK: Fetches

  nonisolated static func fetchProfile(_ api: MatineeApi, username: String) async throws -> Profile {
    let profile = try await api.profiles.get(username: username)
    #if DEBUG
      if StatsFixtures.mode != .off { return StatsFixtures.profile(profile) }
    #endif
    return profile
  }

  nonisolated static func fetchStats(_ api: MatineeApi, username: String, range: String) async throws -> WatchStats? {
    let stats = try await api.profiles.stats(username: username, range: range, timeZone: statsTimeZone)
    #if DEBUG
      if StatsFixtures.mode != .off { return try await StatsFixtures.stats(stats, range: range, api: api) }
    #endif
    return stats
  }

  nonisolated static func fetchLeaderboard(_ api: MatineeApi, range: String) async throws -> Leaderboard {
    let board = try await api.stats.leaderboard(range: range, timeZone: statsTimeZone)
    #if DEBUG
      if StatsFixtures.mode != .off { return StatsFixtures.leaderboard(board) }
    #endif
    return board
  }
}

extension View {
  /// Loads the profile page's `loads` from the server, the statistics and
  /// the leaderboard for the range picked; offline, shows what was saved.
  func loadsProfile(_ loads: ProfileLoads) -> some View { modifier(LoadsProfile(loads: loads)) }
}

private struct LoadsProfile: ViewModifier {
  let loads: ProfileLoads
  @Environment(\.offline) private var offline

  func body(content: Content) -> some View {
    if offline {
      content.onAppear { loads.stats.showSaved() }
    } else {
      let username = loads.username
      let range = loads.range
      content
        .loads(loads.profile) { api in try await ProfileLoads.fetchProfile(api, username: username) }
        .background {
          // A view of their own per range, so a range picked loads when it's picked.
          ZStack {
            Color.clear
              .loads(loads.stats.loader) { api in
                try await ProfileLoads.fetchStats(api, username: username, range: range)
              }
            Color.clear
              .loads(loads.leaderboard(range)) { api in try await ProfileLoads.fetchLeaderboard(api, range: range) }
          }
          .id(range)
          .accessibilityHidden(true)
        }
    }
  }
}
