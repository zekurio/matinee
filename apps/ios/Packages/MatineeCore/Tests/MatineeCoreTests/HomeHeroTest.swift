import Foundation
import Testing

@testable import MatineeCore

/// The iPad's featured banner's rules, after the web's hero.tsx.
struct HomeHeroTest {
  @Test func theBannerRepeatsForwardAndADotFindsTheNearestPage() {
    #expect(HeroPaging.pages(1) == 1)
    #expect(HeroPaging.initialPage(1) == 0)
    #expect(HeroPaging.pages(3) == 3000)
    #expect(HeroPaging.initialPage(3) == 1500)
    #expect(HeroPaging.slide(1500, count: 3) == 0)
    #expect(HeroPaging.slide(1502, count: 3) == 2)
    #expect(HeroPaging.slide(1503, count: 3) == 0)
    #expect(HeroPaging.slide(-1, count: 3) == 2)
    #expect(HeroPaging.page(showing: 2, from: 1504, count: 3) == 1505)
    #expect(HeroPaging.page(showing: 0, from: 1505, count: 3) == 1503)
  }

  @Test func anIPadInPortraitIsTheWebsTabletAndStopsAt720() {
    // iPad Pro 11-inch, 834 by 1210.
    let layout = HeroLayout(width: 834, height: 1210, rowsBelow: true)
    #expect(layout.size == .medium)
    #expect(layout.height == 720)
    #expect(layout.buttonsBottom == 112)
    #expect(layout.dotsBottom == 48)
    #expect(!layout.dotsBesideButtons)
    #expect(layout.showsOverview)
    #expect(layout.showsGenres)
    #expect(layout.titleSize == 48)
    // A shorter tablet window's is 68% of it, and never under 480.
    #expect(near(HeroLayout(width: 800, height: 900, rowsBelow: true).height, 612))
    #expect(HeroLayout(width: 800, height: 600, rowsBelow: true).height == 480)
    #expect(!HeroLayout(width: 800, height: 700, rowsBelow: true).showsOverview)
  }

  @Test func anIPadOnItsSideIsTheWebsDesktopAndLeavesRoomForTheRows() {
    // iPad Pro 11-inch, 1210 by 834: the web's floor, 40% of the width.
    let layout = HeroLayout(width: 1210, height: 834, rowsBelow: true)
    #expect(layout.size == .large)
    #expect(layout.height == 484)
    #expect(layout.buttonsBottom == 32)
    #expect(layout.dotsBesideButtons)
    #expect(!layout.showsOverview)
    #expect(layout.titleSize == 48)
    // With nothing to watch next under it, the tablet's height.
    #expect(near(HeroLayout(width: 1210, height: 834, rowsBelow: false).height, 567.12))
    // iPad Pro 13-inch on its side, 1376 by 1032.
    #expect(near(HeroLayout(width: 1376, height: 1032, rowsBelow: true).height, 550.4))
    #expect(near(HeroLayout(width: 1376, height: 1032, rowsBelow: true).titleSize, 56.76))
    // Never under 360.
    #expect(HeroLayout(width: 1024, height: 500, rowsBelow: true).height == 360)
  }

  @Test func aShortWindowTakesItAllAndDropsTheGenres() {
    let layout = HeroLayout(width: 900, height: 520, rowsBelow: true)
    #expect(layout.size == .short)
    #expect(layout.height == 520)
    #expect(layout.buttonsBottom == 48)
    #expect(layout.dotsBottom == 12)
    #expect(!layout.showsGenres)
    #expect(!layout.showsOverview)
  }

  @Test func theRowsFollowWhileTheyLoadOrHaveTitles() {
    let none = Load<[Int]>.ready([])
    #expect(rowsFollowBanner(resume: Load<[Int]>.loading, nextUp: none))
    #expect(rowsFollowBanner(resume: none, nextUp: Load<[Int]>.ready([1])))
    #expect(!rowsFollowBanner(resume: none, nextUp: none))
    #expect(!rowsFollowBanner(resume: Load<[Int]>.failed("x"), nextUp: none))
  }

  @Test func theIPadKeepsAllOfTheWebsBanner() {
    #expect(BannerParts.ipad == BannerParts(genres: .badges, facts: true, buttons: true, overview: true))
  }

  @Test func aSlideListsTheYearAndAShowsEpisodes() {
    let episodes: (Int) -> String = { "\($0) episodes" }
    #expect(featured(kind: TitleKind.movie, year: 1999, count: 1).facts(episodes: episodes) == ["1999"])
    #expect(
      featured(kind: TitleKind.show, year: 2008, count: 6).facts(episodes: episodes) == ["2008", "6 episodes"])
    #expect(featured(kind: TitleKind.show, year: nil, count: 1).facts(episodes: episodes).isEmpty)
  }

  @Test func theCardAndTheBannerNameATitleAndListItsGenresAlike() {
    let slide = featured(kind: TitleKind.movie, year: 1999, count: 1, genres: ["Action", "Sci-Fi", "Drama", "War"])
    #expect(slide.featuredName == "Name")
    #expect(slide.shownGenres == ["Action", "Sci-Fi", "Drama"])
    #expect(slide.cardLine() == slide.shownGenres.joined(separator: " · "))
  }

  private func near(_ value: Double, _ expected: Double) -> Bool { abs(value - expected) < 0.001 }

  private func featured(kind: String, year: Int?, count: Int, genres: [String] = []) -> FeaturedTitle {
    let title = TitleSummary(
      id: "t", libraryId: "l", kind: kind, name: "Name", year: year, overview: nil,
      images: .init(poster: nil, backdrop: nil, logo: nil), genres: genres, rating: nil, contentRating: nil, runtimeMinutes: nil,
      originalLanguage: nil, favorite: false, watched: false)
    return FeaturedTitle(title: title, item: Answers.item(), count: count)
  }
}
