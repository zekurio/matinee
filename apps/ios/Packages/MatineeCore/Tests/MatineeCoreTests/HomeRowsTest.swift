import Foundation
import Testing

@testable import MatineeCore

private func ref(_ id: String) -> CatalogRef { CatalogRef(kind: TitleKind.movie, provider: "tmdb", providerId: id) }

private func pick(_ id: String) -> RecommendedTitle {
  RecommendedTitle(
    ref: ref(id),
    title: TitleSummary(
      id: "title-\(id)", libraryId: "movies", kind: TitleKind.movie, name: id, year: nil, overview: nil,
      images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: nil, contentRating: nil,
      runtimeMinutes: nil, originalLanguage: nil, favorite: false, watched: false),
    reason: nil)
}

/// Which rows Home lists, as HomeScreen.kt, Recommendations.kt, and Asked.kt
/// leave the empty ones out since #53; Android has no test for it.
struct HomeRowsTest {
  private let forYou = HomeRecommendationRail(id: RecommendationRailId.forYou, seed: nil, items: [pick("1"), pick("2")])
  private let because = HomeRecommendationRail(
    id: RecommendationRailId.becauseWatched, seed: RecommendationSeed(ref: ref("9"), name: "Dune"), items: [pick("3")])

  @Test func everyRowWithSomethingShowsInOrder() {
    let rows = homeRows(
      resume: Load.ready([1]), nextUp: Load.ready([2]),
      recommendations: HomeRecommendations(rails: [forYou, because], computedAt: nil), hiding: [], asked: ["asked"])
    #expect(rows.map(\.id) == ["continue", "nextUp", "recommended-forYou", "recommended-\(because.key)", "asked"])
  }

  @Test func rowsWithNothingAreLeftOut() {
    let rows = homeRows(
      resume: Load<[Int]>.loading, nextUp: Load<[Int]>.failed("offline"),
      recommendations: nil, hiding: [], asked: [String]())
    #expect(rows.isEmpty)
    let empty = homeRows(
      resume: Load<[Int]>.ready([]), nextUp: Load<[Int]>.ready([]),
      recommendations: HomeRecommendations(rails: [], computedAt: nil), hiding: [], asked: [String]())
    #expect(empty.isEmpty)
  }

  @Test func aRecommendationRowWhoseTitlesAreAllHiddenIsLeftOut() {
    let rows = homeRows(
      resume: Load<[Int]>.ready([]), nextUp: Load<[Int]>.ready([]),
      recommendations: HomeRecommendations(rails: [forYou, because], computedAt: nil), hiding: [ref("3").key],
      asked: [String]())
    #expect(rows.map(\.id) == ["recommended-forYou"])
  }

  @Test func aRecommendationRowShowsOnlyItsTitlesNotHidden() {
    let rows = homeRows(
      resume: Load<[Int]>.ready([]), nextUp: Load<[Int]>.ready([]),
      recommendations: HomeRecommendations(rails: [forYou], computedAt: nil), hiding: [ref("1").key], asked: [String]())
    guard case .recommended(_, let shown) = rows.first else {
      Issue.record("no recommendation row")
      return
    }
    #expect(shown.map(\RecommendedTitle.ref.providerId) == ["2"])
  }

  @Test func myRequestsShowsOnlyWithSomethingInIt() {
    let none = homeRows(
      resume: Load.ready([1]), nextUp: Load<[Int]>.ready([]), recommendations: nil, hiding: [], asked: [String]())
    #expect(none.map(\.id) == ["continue"])
    let some = homeRows(
      resume: Load.ready([1]), nextUp: Load<[Int]>.ready([]), recommendations: nil, hiding: [], asked: ["asked"])
    #expect(some.map(\.id) == ["continue", "asked"])
  }
}
