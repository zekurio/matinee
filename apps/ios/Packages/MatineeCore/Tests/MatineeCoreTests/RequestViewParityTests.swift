import Foundation
import Testing
@testable import MatineeCore

struct RequestViewParityTests {
  func value(_ state: String = "none", _ action: String? = "ask", id: String? = nil) -> Availability {
    Availability(state: state, action: action, progress: nil, etaSeconds: nil, releaseDate: nil, stillLooking: false, reason: nil, askedBySelf: false, requestId: id, others: .init(count: 0, names: []), limit: nil, libraryTitleId: nil, disabledReason: nil)
  }
  func season(_ number: Int, aired: Int = 10, selected: Bool = true) -> CatalogSeason {
    CatalogSeason(number: number, overview: nil, poster: nil, episodeCount: 10, airDate: nil, availability: .init(state: "none", action: "ask", progress: nil, etaSeconds: nil, releaseDate: nil, stillLooking: false, reason: nil, askedBySelf: false, requestId: nil, others: .init(count: 0, names: []), limit: nil, libraryTitleId: nil, disabledReason: nil, number: number, episodesHere: 0, episodesAired: aired), selected: selected)
  }
  let ref = CatalogRef(kind: "movie", provider: "tmdb", providerId: "438631")
  @Test func nothingRequested() {
    let a = value()
    #expect(a.posterAction == .request)
    #expect(a.badge == nil)
    #expect(a.cardLine(year: 2021, ref: ref, today: "2026-05-01") == .yearKind(2021, "movie"))
    #expect(a.requestBlocked == nil && a.declineAnswer == nil)
    #expect(value("none", "add").posterAction == .request)
  }
  @Test func requestedAndComing() {
    #expect(value("asked", "cancel", id: "r").posterAction == .cancel)
    #expect(value("asked").badge == RequestBadge(.clock))
    var a = value("coming", nil, id: "r")
    a.progress = 0.64
    #expect(a.cardLine(year: nil, ref: ref, today: "2026-05-01") == .state(.coming(0.64)))
    #expect(a.badge == RequestBadge(.ring, progress: 0.64))
    #expect(a.posterAction == nil)
    a.progress = nil
    #expect(a.badge == RequestBadge(.ring))
  }
  @Test func releasesAndDeclines() {
    var a = value("release", nil)
    a.releaseDate = "2026-08-14"
    #expect(a.cardLine(year: nil, ref: ref, today: "2026-05-01") == .state(.out("2026-08-14")))
    #expect(a.badge == RequestBadge(.calendar))
    a.releaseDate = "2026-01-02"
    #expect(a.stateWord(today: "2026-05-01") == .notOut)
    a = value("unavailable", nil)
    a.disabledReason = "declined"
    #expect(a.badge == RequestBadge(.slash))
    #expect(a.declineAnswer == nil && a.hasPosterButton)
    a.reason = .init(kind: "declined", code: "notForServer", note: "We have the cut")
    #expect(a.declineAnswer == RequestAnswer(code: "notForServer", note: "We have the cut"))
    a.reason = .init(kind: "declined", code: "notFound", note: nil)
    #expect(requestDeclineWord(a.reason!) == .notFound)
  }
  @Test func someoneElsesRequestAndDimmedButtons() {
    // Someone else asked for it: there's nothing to press, as Android's someoneElseRequestedOffersNothing.
    #expect(value("asked", nil, id: "r").posterAction == nil)
    #expect(value("coming", nil, id: "r").posterAction == nil)
    for reason in ["off", "noDestination", "declined", "limit"] {
      var a = value("none", nil)
      a.disabledReason = reason
      #expect(a.hasPosterButton && a.requestBlocked != nil && a.posterAction == nil)
    }
    var a = value("none", nil)
    a.disabledReason = "limit"
    a.limit = .init(left: 0, resetsAt: "2026-05-04T00:00:00.000Z")
    #expect(a.requestBlocked == .limitUntil(requestInstant(a.limit?.resetsAt)))
  }
  @Test func chooserAndEpisodes() {
    let seasons = [season(1), season(2), season(0, selected: false)]
    #expect(requestChooserStart(seasons) == [1, 2])
    #expect(requestChooserStart(seasons, only: 0) == [0])
    #expect(requestChooserLabel(chosen: Array(seasons.prefix(2)), future: true, first: true) == .many(2))
    #expect(requestChooserLabel(chosen: [seasons[1]], future: false, first: true) == .one(2))
    #expect(requestChooserLabel(chosen: [seasons[2]], future: false, first: true) == .specials)
    #expect(requestChooserLabel(chosen: [], future: true, first: true) == .future)
    #expect(requestChooserLabel(chosen: [], future: true, first: false) == .pickOne)
    #expect(requestSeasonDetail(season(1), today: "2026-05-01") == .episodes(10))
    #expect(requestSeasonDetail(season(4, aired: 3), today: "2026-05-01") == .airing(3, 10))
    #expect(requestSeasonDetail(season(5, aired: 0), today: "2026-05-01") == .release(.notOut))
    var a = value(); a.disabledReason = "off"
    #expect(requestAskable([CatalogTitleSummary(ref: ref, name: "Dune", year: nil, poster: nil, availability: a)]).isEmpty)
  }
}
