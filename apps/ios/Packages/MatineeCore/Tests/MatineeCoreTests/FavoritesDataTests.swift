import Foundation
import Testing
@testable import MatineeCore

struct FavoritesDataTests {
  @Test func independentKindsRetainServerOrder() {
    let item = Answers.item("episode")
    let all = Favorites(shows: [], seasons: [], episodes: [item, Answers.item("second")], movies: [])
    #expect(!all.isEmpty)
    let filtered = all.filtering(title: { _ in false }, season: { _, _ in false }, episode: { $0.id == "second" })
    #expect(filtered.episodes.map(\.id) == ["second"])
    #expect(all.filtering(title: { _ in false }, season: { _, _ in false }, episode: { _ in false }).isEmpty)
  }
}
