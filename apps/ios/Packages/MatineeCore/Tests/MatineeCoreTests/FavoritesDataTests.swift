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
    #expect(Favorite.episode(.init(item: item)).isFavorite(
      title: { _ in false }, season: { _, _ in false }, episode: { _ in true }))
  }

  @Test func routePayloadsRoundTrip() throws {
    let routes: [CoreRoute] = [
      .season(titleId: "show", number: nil), .season(titleId: "show", number: 0),
      .person(name: "A/B", tmdbId: "42"), .library(id: "l", sort: "score"),
      .browse(genre: "Drama", studio: "Studio"),
      .images(titleId: "show", season: 0, episode: 2),
      .folderPicker(start: "/media", added: ["/media/a"]),
    ]
    #expect(try JSONDecoder().decode([CoreRoute].self, from: JSONEncoder().encode(routes)) == routes)
  }
}
