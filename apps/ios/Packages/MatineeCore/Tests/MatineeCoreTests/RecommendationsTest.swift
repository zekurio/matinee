import Foundation
import Testing

@testable import MatineeCore

private func ref(_ id: String) -> CatalogRef { CatalogRef(kind: TitleKind.movie, provider: "tmdb", providerId: id) }

private func pick(_ id: String, reason: RecommendationReason? = nil) -> RecommendedTitle {
  RecommendedTitle(
    ref: ref(id),
    title: TitleSummary(
      id: "title-\(id)", libraryId: "movies", kind: TitleKind.movie, name: id, year: nil, overview: nil,
      images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: nil, contentRating: nil,
      runtimeMinutes: nil, originalLanguage: nil, favorite: false, watched: false),
    reason: reason)
}

private struct Refused: Error {}

/// Recommendations.kt's rules for Home's recommendation rows; Android has no test for them.
@MainActor
struct RecommendationsTest {
  @Test func aRowIsNamedForYouOrByTheTitleItStartsFrom() {
    let forYou = HomeRecommendationRail(id: RecommendationRailId.forYou, seed: nil, items: [])
    let because = HomeRecommendationRail(
      id: RecommendationRailId.becauseWatched, seed: RecommendationSeed(ref: ref("438631"), name: "Dune"), items: [])
    #expect(forYou.name == .forYou)
    #expect(because.name == .becauseWatched("Dune"))
    // A row this app doesn't know yet still has a name to show.
    #expect(HomeRecommendationRail(id: "trending", seed: nil, items: []).name == .forYou)
  }

  @Test func rowsOfTheSameKindStayApartByTheirSeed() {
    let dune = HomeRecommendationRail(
      id: RecommendationRailId.becauseWatched, seed: RecommendationSeed(ref: ref("1"), name: "Dune"), items: [])
    let alien = HomeRecommendationRail(
      id: RecommendationRailId.becauseWatched, seed: RecommendationSeed(ref: ref("2"), name: "Alien"), items: [])
    #expect(dune.key != alien.key)
    #expect(HomeRecommendationRail(id: RecommendationRailId.forYou, seed: nil, items: []).key == "forYou")
    #expect(ref("1").key == "movie:tmdb:1")
  }

  @Test func aTitleSaysWhyItsThere() {
    #expect(pick("1", reason: RecommendationReason(kind: "watched", name: "Dune")).why == .watched("Dune"))
    #expect(pick("1", reason: RecommendationReason(kind: "person", name: "Zendaya")).why == .person("Zendaya"))
    #expect(pick("1", reason: RecommendationReason(kind: "taste", name: nil)).why == .taste)
    #expect(pick("1").why == .taste)
  }

  @Test func notInterestedLeavesTitlesAndThenEmptyRowsOut() {
    let rows = HomeRecommendations(
      rails: [
        HomeRecommendationRail(id: RecommendationRailId.forYou, seed: nil, items: [pick("1"), pick("2")]),
        HomeRecommendationRail(
          id: RecommendationRailId.becauseWatched, seed: RecommendationSeed(ref: ref("9"), name: "Dune"),
          items: [pick("3")]),
      ], computedAt: nil)
    #expect(rows.shownRails(hiding: []).count == 2)
    #expect(rows.rails[0].visible(hiding: [ref("1").key]).map(\.ref) == [ref("2")])
    #expect(rows.shownRails(hiding: [ref("3").key]).map(\.key) == ["forYou"])
  }

  @Test func notInterestedHidesAtOnceAndComesBackWhenTheServerRefuses() async throws {
    let hidden = HiddenRecommendations()
    try await hidden.dismiss(ref("1")) {}
    #expect(hidden.keys == [ref("1").key])

    await #expect(throws: Refused.self) {
      try await hidden.dismiss(ref("2")) { throw Refused() }
    }
    #expect(hidden.keys == [ref("1").key])

    // Asked again for one already hidden, a refusal doesn't bring it back.
    await #expect(throws: Refused.self) {
      try await hidden.dismiss(ref("1")) { throw Refused() }
    }
    #expect(hidden.keys == [ref("1").key])
  }
}
