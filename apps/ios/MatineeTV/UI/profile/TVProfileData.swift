import Foundation
import MatineeCore
import Observation
import SwiftUI

/*
 * What the TV's profile loads: the iPhone's ProfileLoads
 * (Matinee/UI/profile/ProfileData.swift) without what offline mode and
 * pull to refresh need, which a TV has neither of. The range and what the
 * statistics section shows are MatineeCore's `ProfileStats`; the profile
 * and each range's figures are kept per account in `ProfileSnapshot`, so a
 * profile opened again shows at once while it's fetched anew. In a debug
 * build `-dev.statsFixtures` puts the iPhone's made-up watching over the
 * answers (Matinee/UI/profile/StatsFixtures.swift).
 */

@MainActor @Observable final class TVProfileLoads {
  let username: String
  let profile: Loader<Profile>
  let stats: ProfileStats
  @ObservationIgnored private var boards: [String: Loader<Leaderboard>] = [:]
  /// The board shown for the range before this one, standing in while this one loads.
  private var lastBoard: Leaderboard?

  init(username: String) {
    self.username = username
    let snapshot = ProfileSnapshot(username: username)
    profile = Loader(kept: snapshot.profile)
    stats = ProfileStats(snapshot: snapshot)
    #if DEBUG
      // `-dev.statsRange 7d`, for screenshots of each range.
      if let range = UserDefaults.standard.string(forKey: "dev.statsRange") { stats.select(range) }
    #endif
  }

  var range: String { stats.range }

  /// Picks the range the statistics and the leaderboard show.
  func pick(_ range: String) {
    if let shown = leaderboard(self.range).state.value { lastBoard = shown }
    stats.select(range)
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

/// "November 2026", the month the person joined.
func joinedMonth(_ profile: Profile) -> String? {
  formatJoinedMonth(profile.user.createdAt, locale: .app)
}

extension View {
  /// Loads the profile, and the statistics and the leaderboard for the range picked.
  func loadsTVProfile(_ loads: TVProfileLoads) -> some View {
    let username = loads.username
    let range = loads.range
    return
      self
      .loads(loads.profile) { api in try await TVProfileLoads.fetchProfile(api, username: username) }
      .background {
        // A view of their own per range, so a range picked loads when it's picked.
        ZStack {
          Color.clear
            .loads(loads.stats.loader) { api in try await TVProfileLoads.fetchStats(api, username: username, range: range) }
          Color.clear
            .loads(loads.leaderboard(range)) { api in try await TVProfileLoads.fetchLeaderboard(api, range: range) }
        }
        .id(range)
        .accessibilityHidden(true)
      }
  }
}
