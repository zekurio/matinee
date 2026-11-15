import Foundation
import Testing

@testable import MatineeCore

/// Android's HomeSectionsTest.kt, and the banner's rules from Hero.kt and HomeScreen.kt.
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

  @Test func theBannerRepeatsForwardAndADotFindsTheNearestPage() {
    #expect(HeroPaging.pages(1) == 1)
    #expect(HeroPaging.initialPage(1) == 0)
    #expect(HeroPaging.pages(3) == 3000)
    #expect(HeroPaging.initialPage(3) == 1500)
    #expect(HeroPaging.slide(1500, count: 3) == 0)
    #expect(HeroPaging.slide(1502, count: 3) == 2)
    #expect(HeroPaging.slide(1503, count: 3) == 0)
    #expect(HeroPaging.page(showing: 2, from: 1504, count: 3) == 1505)
    #expect(HeroPaging.page(showing: 0, from: 1505, count: 3) == 1503)
  }

  @Test func aPhonesBannerIsShortAndATabletsTall() {
    #expect(heroHeight(window: 952, wide: false) == 328.44)
    #expect(heroHeight(window: 700, wide: false) == 320)
    #expect(heroHeight(window: 1400, wide: false) == 400)
    // Under a taller status bar, the banner reaches further up.
    #expect(heroHeight(window: 700, wide: false, topInset: 62) == 358)
    #expect(heroHeight(window: 1000, wide: true) == 680)
    #expect(heroHeight(window: 600, wide: true) == 460)
    #expect(heroHeight(window: 400, wide: true) == 360)
    // A tall tablet's stops at the web's 720.
    #expect(heroHeight(window: 1366, wide: true) == 720)
  }

  @Test func onlyATabletSizedWindowGetsTheTallBanner() {
    #expect(heroIsWide(width: 820, height: 1180))
    #expect(heroIsWide(width: 1180, height: 820))
    #expect(!heroIsWide(width: 402, height: 874))
    // A phone on its side.
    #expect(!heroIsWide(width: 874, height: 402))
  }

  @Test func aSlideListsTheYearAndAShowsEpisodes() {
    let episodes: (Int) -> String = { "\($0) episodes" }
    #expect(featured(kind: TitleKind.movie, year: 1999, count: 1).facts(episodes: episodes) == ["1999"])
    #expect(
      featured(kind: TitleKind.show, year: 2008, count: 6).facts(episodes: episodes) == ["2008", "6 episodes"])
    #expect(featured(kind: TitleKind.show, year: nil, count: 1).facts(episodes: episodes).isEmpty)
  }

  @Test func aPhoneShowsHowFarThePersonIsOverTheGenres() {
    let slide = featured(kind: TitleKind.movie, year: 1999, count: 1, genres: ["Action", "Sci-Fi", "Drama", "War"])
    #expect(slide.showsGenres(wide: false, resuming: false))
    #expect(!slide.showsGenres(wide: false, resuming: true))
    #expect(slide.showsGenres(wide: true, resuming: true))
    #expect(slide.shownGenres == ["Action", "Sci-Fi", "Drama"])
    #expect(!featured(kind: TitleKind.movie, year: 1999, count: 1).showsGenres(wide: true, resuming: false))
  }

  private func featured(kind: String, year: Int?, count: Int, genres: [String] = []) -> FeaturedTitle {
    let title = TitleSummary(
      id: "t", libraryId: "l", kind: kind, name: "Name", year: year, overview: nil,
      images: .init(poster: nil, backdrop: nil, logo: nil), genres: genres, rating: nil, contentRating: nil, runtimeMinutes: nil,
      originalLanguage: nil, favorite: false, watched: false)
    return FeaturedTitle(title: title, item: Answers.item(), count: count)
  }
}
