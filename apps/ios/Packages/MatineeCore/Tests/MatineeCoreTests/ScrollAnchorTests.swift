import Testing

@testable import MatineeCore

/// A page held by the row at its top, as Home is across an iPad's window crossing between the shells.
struct ScrollAnchorTests {
  /// Home's rows under the banner, which isn't one of them: it changes height.
  private let tops = ["continue": 720.0, "movies": 1100, "shows": 1500]

  @Test func theRowAtTheTopIsTheLastToStartAboveIt() {
    #expect(ScrollAnchor(offset: 800, tops: tops) == ScrollAnchor(row: "continue", into: 80))
    #expect(ScrollAnchor(offset: 1100, tops: tops) == ScrollAnchor(row: "movies", into: 0))
    #expect(ScrollAnchor(offset: 2000, tops: tops) == ScrollAnchor(row: "shows", into: 500))
  }

  @Test func overTheBannerTheFirstRowIsHeldWhereItShows() {
    // Scrolled 500 into a banner 720 tall: Continue watching shows 220 down.
    #expect(ScrollAnchor(offset: 500, tops: tops) == ScrollAnchor(row: "continue", into: -220))
    // Only rows further down laid out.
    #expect(ScrollAnchor(offset: 500, tops: ["movies": 1100]) == ScrollAnchor(row: "movies", into: -600))
  }

  @Test func atRestThePageStaysAtItsTop() {
    #expect(ScrollAnchor(offset: 0, tops: tops) == nil)
    #expect(ScrollAnchor(offset: -40, tops: tops) == nil)
    #expect(ScrollAnchor(offset: 300, tops: [:]) == nil)
  }

  @Test func theRowComesBackAsFarIntoIt() {
    // The banner, 720 tall, traded for cards 300 tall: Continue watching moves up 420.
    #expect(ScrollAnchor(row: "continue", into: 80).offset(top: 300) == 380)
    #expect(ScrollAnchor(row: "continue", into: -220).offset(top: 300) == 80)
    // Never above the page's top.
    #expect(ScrollAnchor(row: "continue", into: -220).offset(top: 200) == 0)
  }
}
