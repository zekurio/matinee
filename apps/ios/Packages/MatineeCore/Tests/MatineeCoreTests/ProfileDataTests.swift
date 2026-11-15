import Foundation
import Testing
@testable import MatineeCore

@MainActor struct ProfileDataTests {
  private func stats(_ range: String, plays: Int = 1) -> WatchStats {
    WatchStats(range: range, unit: "day", totals: WatchTotals(watchSeconds: 60, plays: plays, movies: 0, episodes: 0, shows: 0), buckets: [], activity: [], genres: [], titles: [])
  }

  @Test func rangeChangesKeepTheLastFiguresUntilTheNextAnswer() {
    let state = ProfileStats()
    #expect(state.range == "all")
    #expect(state.stats == nil)
    state.loader.show(stats("all"))
    state.select("7d")
    #expect(state.state.isLoading)
    #expect(state.stats?.range == "all")
    state.loader.show(stats("7d", plays: 2))
    #expect(state.stats?.totals.plays == 2)
    let loader = state.loader
    state.select("7d")
    #expect(state.loader === loader)
    state.select("all")
    state.loader.show(stats("all", plays: 0))
    #expect(state.neverWatched)
    state.select("30d")
    #expect(!state.neverWatched)
  }

  @Test func offlineRangesUseOnlyTheirOwnSavedFigures() {
    let suite = "profile-data-\(UUID().uuidString)"
    defer { UserDefaults.standard.removePersistentDomain(forName: suite) }
    let snapshot = ProfileSnapshot(username: "me", suite: suite)
    snapshot.stats("all").write(stats("all"))
    snapshot.stats("7d").write(nil)
    let state = ProfileStats(snapshot: snapshot)
    state.showSaved()
    #expect(state.stats?.range == "all")
    state.select("7d")
    state.showSaved()
    #expect(!state.state.isFailed)
    #expect(state.stats == nil)
    state.select("30d")
    state.showSaved()
    #expect(state.state == .failed("", disconnected: true))
    #expect(state.stats == nil)
  }
}
