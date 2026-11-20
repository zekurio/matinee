import Foundation
import Testing

@testable import MatineeCore

/// Android's HomeSectionsTest.kt, and the featured carousel's rules.
struct HomeSectionsTest {
  @Test func railsTellLoadingEmptyFailedAndShownApart() {
    #expect(railState(Load<[Int]>.loading) == .loading)
    #expect(railState(Load<[Int]>.ready([])) == .empty)
    #expect(railState(Load<[Int]>.failed("offline")) == .failed("offline"))
    #expect(railState(Load.ready([1])) == .shown([1]))
  }

  @Test func aRailKnowsItFailedForWantOfTheServer() {
    #expect(
      railState(Load<[Int]>.failed("unreachable", disconnected: true))
        == .failed("unreachable", disconnected: true))
    #expect(railState(Load<[Int]>.failed("broke")) == .failed("broke", disconnected: false))
  }

  @Test func homeIsOneErrorOnlyWhenNothingCouldShow() {
    let failed = Load<[Int]>.failed("offline")
    let empty = Load<[Int]>.ready([])
    #expect(failedOutright(failed, [failed, empty, failed]))
    #expect(!failedOutright(failed, [failed, Load.ready([1]), failed]))
    #expect(!failedOutright(failed, [failed, Load<[Int]>.loading, failed]))
    #expect(!failedOutright(Load<[Int]>.ready([]), [failed, failed, failed]))
  }

  @Test func anAdminIsToldNoneExistAndAnyoneElseNoneAreOpen() {
    #expect(NoLibraries(admin: true) == .noneExist)
    #expect(NoLibraries(admin: false) == .noneOpen)
  }

  @Test func aPhoneShowsOneCardATabletTwoAndAWideWindowThree() {
    #expect(FeaturedCarousel.columns(width: 402) == 1)
    #expect(FeaturedCarousel.columns(width: 599) == 1)
    #expect(FeaturedCarousel.columns(width: 600) == 2)
    #expect(FeaturedCarousel.columns(width: 820) == 2)
    #expect(FeaturedCarousel.columns(width: 840) == 3)
    #expect(FeaturedCarousel.columns(width: 1366) == 3)
  }

  @Test func fewTitlesFillTheRowRatherThanLeaveAHole() {
    #expect(FeaturedCarousel.perRow(width: 1032, count: 6) == 3)
    #expect(FeaturedCarousel.perRow(width: 1032, count: 2) == 2)
    #expect(FeaturedCarousel.perRow(width: 820, count: 1) == 1)
    #expect(FeaturedCarousel.perRow(width: 402, count: 0) == 1)
  }

  @Test func theRowRestsWhereACardCanLeadIt() {
    #expect(FeaturedCarousel.stops(count: 6, perRow: 1) == 6)
    #expect(FeaturedCarousel.stops(count: 6, perRow: 3) == 4)
    #expect(FeaturedCarousel.stops(count: 2, perRow: 2) == 1)
    #expect(FeaturedCarousel.stops(count: 0, perRow: 1) == 1)
  }

  @Test func theAdvanceGoesBackToTheFirstAfterTheLast() {
    #expect(FeaturedCarousel.next(after: 0, stops: 4) == 1)
    #expect(FeaturedCarousel.next(after: 3, stops: 4) == 0)
    #expect(FeaturedCarousel.next(after: 0, stops: 1) == 0)
    #expect(FeaturedCarousel.previous(before: 0, stops: 4) == 3)
    #expect(FeaturedCarousel.previous(before: 2, stops: 4) == 1)
  }

  @Test func aScrolledRowRestsAtTheNearestStop() {
    #expect(FeaturedCarousel.stop(offset: 0, stride: 370, stops: 6) == 0)
    #expect(FeaturedCarousel.stop(offset: 190, stride: 370, stops: 6) == 1)
    #expect(FeaturedCarousel.stop(offset: 5000, stride: 370, stops: 6) == 5)
    #expect(FeaturedCarousel.stop(offset: -40, stride: 370, stops: 6) == 0)
    #expect(FeaturedCarousel.stop(offset: 100, stride: 0, stops: 6) == 0)
  }

  @Test func theRowRestsWhereTheTitleInViewIs() {
    // One to a row: each card is a place of its own.
    #expect(FeaturedCarousel.stop(showing: 3, stops: 6) == 3)
    // Three to a row of six: the last two can't lead it, and show at the last place.
    #expect(FeaturedCarousel.stop(showing: 5, stops: 4) == 3)
    #expect(FeaturedCarousel.stop(showing: -1, stops: 4) == 0)
    #expect(FeaturedCarousel.stop(showing: 2, stops: 0) == 0)
  }

  @Test func theCardsAndTheBannerShowTheSameTitle() {
    let ids = ["a", "b", "c"]
    #expect(featuredIndex(showing: "c", in: ids) == 2)
    // None yet, or titles that changed since: the first.
    #expect(featuredIndex(showing: nil, in: ids) == 0)
    #expect(featuredIndex(showing: "z", in: ids) == 0)
    #expect(featuredIndex(showing: "a", in: []) == 0)
  }

  @Test func aCardNamesUpToThreeGenresAndNothingElse() {
    let genres = ["Action", "Sci-Fi", "Drama", "War"]
    #expect(featured(kind: TitleKind.movie, year: 1999, count: 1, genres: genres).cardLine { $0 } == "Action · Sci-Fi · Drama")
    #expect(featured(kind: TitleKind.movie, year: 1999, count: 1, genres: ["Drama"]).cardLine(separator: ", ") { $0 } == "Drama")
    #expect(featured(kind: TitleKind.movie, year: 1999, count: 1).cardLine { $0 } == nil)
    #expect(featured(kind: TitleKind.show, year: nil, count: 1).cardLine { $0 } == nil)
  }

  private func featured(kind: String, year: Int?, count: Int, genres: [String] = []) -> FeaturedTitle {
    let title = TitleSummary(
      id: "t", libraryId: "l", kind: kind, name: "Name", year: year, overview: nil,
      images: .init(poster: nil, backdrop: nil, logo: nil), genres: genres, rating: nil, contentRating: nil, runtimeMinutes: nil,
      originalLanguage: nil, favorite: false, watched: false)
    return FeaturedTitle(title: title, item: Answers.item(), count: count)
  }
}
