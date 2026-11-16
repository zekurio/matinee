import Foundation
import Testing
@testable import MatineeCore

/// RequestScreens.swift and the season folding in RequestView.swift: what
/// the request screens decide, as Android's screens decide it.
struct RequestScreensTests {
  let movie = CatalogRef(kind: "movie", provider: "tmdb", providerId: "438631")
  let show = CatalogRef(kind: "show", provider: "tmdb", providerId: "1396")

  func value(_ state: String = "none", _ action: String? = "ask", id: String? = nil, here: String? = nil) -> Availability {
    Availability(
      state: state, action: action, progress: nil, etaSeconds: nil, releaseDate: nil, stillLooking: false, reason: nil,
      askedBySelf: false, requestId: id, others: .init(count: 0, names: []), limit: nil,
      libraryTitleId: here, disabledReason: nil)
  }

  func seasonState(
    _ number: Int, _ state: String = "none", action: String? = "ask", progress: Double? = nil, release: String? = nil
  ) -> SeasonAvailability {
    SeasonAvailability(
      state: state, action: action, progress: progress, etaSeconds: nil, releaseDate: release, stillLooking: false,
      reason: nil, askedBySelf: false, requestId: nil, others: .init(count: 0, names: []), limit: nil,
      libraryTitleId: nil, disabledReason: nil, number: number, episodesHere: 2, episodesAired: 8)
  }

  func season(_ number: Int, _ state: String = "none", action: String? = "ask") -> CatalogSeason {
    CatalogSeason(
      number: number, overview: nil, poster: nil, episodeCount: 8, airDate: nil,
      availability: seasonState(number, state, action: action), selected: true)
  }

  // MARK: Seasons, folded in from the title page's gap helpers

  @Test func aSeasonReadsAsATitle() {
    let today = "2026-01-01"
    #expect(seasonState(3, "asked").stateWord(today: today) == .asked)
    #expect(seasonState(3, "coming", progress: 0.4).stateWord(today: today) == .coming(0.4))
    #expect(seasonState(3, "coming", progress: 0.4).stateWord(today: today, percent: false) == .coming(nil))
    #expect(seasonState(3, "release", release: "2026-05-01").stateWord(today: today) == .out("2026-05-01"))
    #expect(seasonState(3, "release").stateWord(today: today) == .notOut)
    #expect(seasonState(3, "unavailable").stateWord(today: today) == .unavailable)
    #expect(seasonState(3).stateWord(today: today) == nil)
    #expect(seasonState(3, "coming", progress: 0.4).badge == RequestBadge(.ring, progress: 0.4))
    #expect(seasonState(3).badge == nil)
    #expect(seasonState(3, action: "ask").asks && seasonState(3, action: "add").asks)
    #expect(!seasonState(3, "asked", action: "cancel").asks && !seasonState(3, action: nil).asks)
    #expect(seasonState(3, "asked", action: "cancel").asTitle.state == "asked")
    #expect(requestRestCount(season(3)) == 6)
  }

  // MARK: Live overlay

  @Test @MainActor func anAnswerShowsAtOnceAndSeasonsFollowTheStream() {
    let state = RequestAvailabilityState()
    state.apply(movie, availability: value("asked", "cancel", id: "r"))
    #expect(state.availability(movie, fallback: value()).state == "asked")
    #expect(state.seasons(show, [season(1)]) == [season(1)])
    state.apply(show, availability: value("asked", nil, id: "r"), season: seasonState(2, "asked", action: "cancel"))
    let overlaid = state.seasons(show, [season(1), season(2)])
    #expect(overlaid[0].availability.state == "none")
    #expect(overlaid[1].availability.state == "asked")
    #expect(state.season(show, 2, fallback: seasonState(2)).state == "asked")
    #expect(state.season(show, 5, fallback: seasonState(5)).state == "none")
  }

  @Test @MainActor func pagesShareOneOverlay() async {
    let shared = RequestAvailabilityState()
    let ref = movie
    let controller = RequestLiveController(state: shared) { _ in
      AsyncThrowingStream { continuation in
        continuation.yield([RequestsLiveEvent(ref: ref, availability: Availability(
          state: "coming", action: nil, progress: 0.5, etaSeconds: nil, releaseDate: nil, stillLooking: false,
          reason: nil, askedBySelf: false, requestId: "r", others: .init(count: 0, names: []),
          limit: nil, libraryTitleId: nil, disabledReason: nil), seasons: [])])
      }
    }
    #expect(controller.state === shared)
    controller.updateVisible([CatalogInput(ref: ref, libraryId: nil)])
    for _ in 0..<50 where shared.titles[ref] == nil { await Task.yield() }
    #expect(shared.availability(ref, fallback: value()).state == "coming")
    controller.hide()
  }

  // MARK: Catalog page

  @Test func aCatalogPagesButton() {
    #expect(catalogPageAction(ref: movie, availability: value(), seasons: []) == .poster)
    #expect(catalogPageAction(ref: movie, availability: value("here", nil), seasons: []) == .none)
    // A show asked for already, with a season still to ask for.
    #expect(catalogPageAction(ref: show, availability: value("asked", nil), seasons: [season(1, "asked", action: nil), season(2)]) == .more)
    #expect(catalogPageAction(ref: show, availability: value("asked", "cancel", id: "r"), seasons: [season(2)]) == .poster)
    #expect(catalogPageAction(ref: show, availability: value("asked", nil), seasons: [season(1, "asked", action: nil)]) == .none)
    #expect(catalogAsksAtOnce(ref: movie, action: .poster))
    #expect(!catalogAsksAtOnce(ref: show, action: .poster))
    #expect(!catalogAsksAtOnce(ref: movie, action: .more))
    #expect(value("here", nil, here: "t").arrivedTitleId == "t")
    #expect(value("coming", nil, here: "t").arrivedTitleId == nil)
  }

  @Test func fewRequestsLeftIsTheServersCount() {
    var a = value()
    a.limit = .init(left: 2, resetsAt: "2026-05-04T00:00:00Z")
    #expect(RequestPermission(a).leftToSay(asks: a.asks) == 2)
    a.limit = .init(left: 3, resetsAt: "2026-05-04T00:00:00Z")
    #expect(RequestPermission(a).leftToSay(asks: a.asks) == nil)
    a.limit = .init(left: 0, resetsAt: "2026-05-04T00:00:00Z")
    a.disabledReason = "limit"
    // Blocked says why instead.
    #expect(RequestPermission(a).leftToSay(asks: a.asks) == nil)
    #expect(RequestPermission(value()).leftToSay(asks: true) == nil)
  }

  @Test func aLongNoteIsCutAtAWord() {
    #expect(requestShortNote("Short.") == "Short.")
    let long = String(repeating: "word ", count: 40) + "end."
    let cut = requestShortNote(long)
    #expect(cut.hasSuffix("word…"))
    #expect(cut.count <= 141)
    #expect(requestShortNote("one two, three", limit: 9) == "one two…")
  }

  // MARK: My requests

  func item(_ availability: Availability, season: SeasonAvailability? = nil) -> RequestItem {
    RequestItem(
      id: "r1", title: CatalogTitleSummary(ref: show, name: "Breaking Bad", year: 2008, poster: nil, availability: availability),
      library: RequestDestination(id: "l", name: "Shows"), scope: nil, createdAt: "2026-01-01T00:00:00Z",
      arrivedAt: nil, availability: availability, season: season)
  }

  @Test func anAskedShowPartlyHereShowsTheSeasonItWaitsFor() {
    let partly = item(value("here", nil, here: "t"), season: seasonState(3, "coming", action: nil, progress: 0.2))
    #expect(askedCardKind(partly, live: nil) == .pendingSeason(titleId: "t", season: seasonState(3, "coming", action: nil, progress: 0.2)))
    // The stream says the season came: the library's card.
    let live = RequestsLiveEvent(ref: show, availability: value("here", nil, here: "t"), seasons: [seasonState(3, "here", action: nil)])
    #expect(askedCardKind(partly, live: live) == .catalog(hereAtFirst: true))
    #expect(askedCardKind(item(value("asked", "cancel", id: "r")), live: nil) == .catalog(hereAtFirst: false))
    var declined = value("unavailable", nil)
    declined.reason = .init(kind: "declined", code: "notForServer", note: nil)
    #expect(askedDeclined(declined)?.code == "notForServer")
    #expect(askedDeclined(value("asked", nil)) == nil)
  }

  // MARK: Admin

  func adminItem(
    _ id: String, followers: [AdminRequestItem.Follower] = [], scope: ShowScope? = nil, availability: Availability? = nil,
    status: String = "waiting", fulfilment: String? = nil, connection: AdminRequestItem.Connection? = nil,
    reason: String? = nil
  ) -> AdminRequestItem {
    AdminRequestItem(
      id: id, title: CatalogTitleSummary(ref: movie, name: "Dune", year: 2021, poster: nil, availability: value()),
      library: RequestDestination(id: "l", name: "Movies"), scope: scope, createdAt: "2026-01-01T00:00:00Z",
      arrivedAt: nil, availability: availability ?? value("asked", nil, id: id), season: nil, status: status,
      fulfilmentState: fulfilment, error: nil, reason: reason, note: nil, declinedAt: nil, connection: connection,
      followers: followers, destinationDescription: "", destinations: [], remoteUrl: nil, diagnostics: [])
  }

  @Test func whoAskedFirstComesFirst() {
    let anna = AdminRequestItem.Follower(id: "a", name: "anna", avatarId: nil, createdAt: "2026-01-02T00:00:00Z")
    let ben = AdminRequestItem.Follower(id: "b", name: "ben", avatarId: nil, createdAt: "2026-01-01T00:00:00Z")
    let cleo = AdminRequestItem.Follower(id: "c", name: "cleo", avatarId: nil, createdAt: "2026-01-03T00:00:00Z")
    let (first, rest) = requestAskers(adminItem("r", followers: [cleo, anna, ben]))
    #expect(first?.name == "ben")
    #expect(rest.map(\.name) == ["anna", "cleo"])
    #expect(requestedBy(adminItem("r")) == .waiting)
    #expect(requestedBy(adminItem("r", followers: [anna])) == .one(name: "anna", at: anna.createdAt))
    #expect(requestedBy(adminItem("r", followers: [anna, ben])) == .many(["ben", "anna"]))
  }

  @Test func aShowsRequestSaysWhatItCovers() {
    #expect(requestSeasonRuns([1, 2, 3, 4, 6]) == "1–4, 6")
    #expect(requestSeasonRuns([1, 2, 5]) == "1, 2, 5")
    #expect(requestSeasonRuns([]) == "")
    #expect(requestScopeParts(nil) == nil)
    #expect(requestScopeParts(ShowScope(seasons: [], future: false)) == nil)
    let parts = requestScopeParts(ShowScope(seasons: [3, 0, 1, 2], future: true))
    #expect(parts?.seasons?.runs == "1–3" && parts?.seasons?.count == 3 && parts?.specials == true && parts?.future == true)
    #expect(requestScopeParts(ShowScope(seasons: [], future: true))?.seasons == nil)
  }

  @Test @MainActor func theQueueCountsWhatNeedsTheAdmin() {
    let queue = RequestAdminQueue(sleep: { _ in try await Task.sleep(for: .seconds(60)) })
    #expect(queue.needsYou == 0 && queue.count(.waiting) == nil)
    queue.queue = RequestQueue(
      waiting: [adminItem("a"), adminItem("b")], needsAttention: [adminItem("c")], onTheWay: [], done: [],
      counts: .init(waiting: 2, needsAttention: 1, onTheWay: 4, done: 9), nextCursor: nil)
    #expect(queue.needsYou == 3)
    queue.answer(id: "a", answer: .add, perform: { _, _ in })
    #expect(queue.needsYou == 2)
    #expect(queue.rows(.waiting).map(\.id) == ["b"])
    #expect(queue.count(.waiting) == 1 && queue.count(.onTheWay) == 4 && queue.count(.done) == nil)
    queue.undo(id: "a")
    #expect(queue.rows(.waiting).map(\.id) == ["a", "b"])
  }

  @Test func howFarAlongAndWhatBecameOfIt() {
    var coming = value("coming", nil, id: "r")
    coming.progress = 0.3
    coming.etaSeconds = 600
    #expect(requestProgress(adminItem("r", availability: coming)) == .share(0.3, etaSeconds: 600))
    var release = value("release", nil)
    release.releaseDate = "2026-09-01"
    #expect(requestProgress(adminItem("r", availability: release)) == .release("2026-09-01"))
    var looking = value("coming", nil)
    looking.stillLooking = true
    #expect(requestProgress(adminItem("r", availability: looking)) == .looking)
    #expect(requestProgress(adminItem("r", availability: value("coming", nil), fulfilment: "queued")) == .queued)
    let byHand = AdminRequestItem.Connection(id: "c", name: "By hand", reportsProgress: false)
    #expect(requestProgress(adminItem("r", availability: value("coming", nil), connection: byHand)) == .byHand)
    #expect(requestProgress(adminItem("r", availability: value("coming", nil))) == .sent)
    #expect(requestOutcome(adminItem("r", status: "declined", reason: "notFound")) == .declined(at: nil, reason: "notFound", gaveUp: true))
    #expect(requestOutcome(adminItem("r", status: "fulfilled")) == .arrived(at: nil))
  }

  // MARK: Discover and browse

  func browseTitle(_ id: String, here: TitleSummary? = nil) -> CatalogBrowseTitle {
    CatalogBrowseTitle(
      ref: CatalogRef(kind: "movie", provider: "tmdb", providerId: id), name: id, year: nil, poster: nil,
      availability: here.map { value("here", nil, here: $0.id) } ?? value(), title: here, score: nil, votes: 0,
      releaseDate: nil)
  }

  @Test func discoverRows() {
    let seed = RecommendationSeed(ref: movie, name: "Dune")
    #expect(discoverRailKey(DiscoverRail(id: "becauseWatched", seed: seed, browse: nil)) == "becauseWatched:movie:tmdb:438631")
    #expect(discoverRailKey(DiscoverRail(id: "comingSoon", browse: nil)) == "comingSoon")
    let items = (0..<30).map { browseTitle("\($0)") }
    let hidden: Set<String> = [items[0].ref.key]
    #expect(discoverRailCards(DiscoverRail(id: "forYou", browse: nil), items, hidden: hidden).first?.name == "1")
    #expect(discoverRailCards(DiscoverRail(id: "popularFilms", browse: nil), items, hidden: hidden).first?.name == "0")
    #expect(discoverRailCards(DiscoverRail(id: "popularFilms", browse: nil), items, hidden: []).count == DISCOVER_RAIL_CARDS)
  }

  @Test func aRowsHeadingOpensTheServersBrowse() {
    var filters = CatalogFilters.none
    filters.upcoming = true
    filters.requestable = true
    let soon = DiscoverRail(
      id: DiscoverRailId.comingSoon, browse: DiscoverBrowse(kinds: ["show", "movie"], filters: filters, sort: CatalogSort.popular))
    // Of its first kind, with its filters and sort, as Android's heading.
    #expect(discoverRailBrowse(soon) == CatalogBrowseStart(kind: "show", filters: filters, sort: CatalogSort.popular))
    // "Because you watched" has no browse, so its heading opens nothing.
    let seed = RecommendationSeed(ref: movie, name: "Dune")
    #expect(discoverRailBrowse(DiscoverRail(id: DiscoverRailId.becauseWatched, seed: seed, browse: nil)) == nil)
  }

  @Test func theRowsFollowOnlyTheirCatalogCards() {
    let summary = TitleSummary(
      id: "t", libraryId: "l", kind: TitleKind.movie, name: "Dune", year: 2021, overview: nil,
      images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: nil, contentRating: nil,
      runtimeMinutes: nil, originalLanguage: nil, favorite: false, watched: false)
    let first = DiscoverRow(items: [browseTitle("1"), browseTitle("2", here: summary)], stale: false, detail: nil)
    let second = DiscoverRow(items: (3..<30).map { browseTitle("\($0)") }, stale: false, detail: nil)
    let followed = discoverRailFollowed([first, second])
    // Library cards play and don't change; a row's cards past the twentieth don't show.
    #expect(followed.first?.ref.providerId == "1")
    #expect(!followed.contains { $0.ref.providerId == "2" })
    #expect(followed.count == 1 + DISCOVER_RAIL_CARDS)
  }

  @Test func browseFiltersAndCards() {
    #expect(CatalogFilters.none.count == 0)
    var filters = CatalogFilters.none
    filters.genres = [18, 878]
    filters.yearFrom = 1990
    filters.yearTo = 2000
    filters.language = "de"
    #expect(filters.count == 4)
    // The server's three switches count once each, when on.
    filters.recommended = true
    filters.upcoming = false
    filters.requestable = true
    #expect(filters.count == 6)
    #expect(filters.recommends)
    // Switching kind keeps all but what the other kind lacks.
    filters.rating = "PG"
    let other = filters.forOtherKind
    #expect(other.genres == nil && other.rating == nil && other.yearFrom == 1990 && other.language == "de" && other.recommends)
    let summary = TitleSummary(
      id: "t", libraryId: "l", kind: TitleKind.movie, name: "Dune", year: 2021, overview: nil,
      images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: nil, contentRating: nil,
      runtimeMinutes: nil, originalLanguage: nil, favorite: false, watched: false)
    let item = CatalogBrowseTitle(
      ref: movie, name: "Dune", year: 2021, poster: nil, availability: value("here", nil, here: "t"), title: summary,
      score: 7.8, votes: 900, releaseDate: "2021-10-22")
    #expect(browseCardDetail("score", item) == .score(7.8, year: 2021))
    #expect(browseCardDetail("releaseDate", item) == .day("2021-10-22"))
    #expect(browseCardDetail(nil, item) == .year(2021))
    #expect(browseLibraryTitle(summary, item.availability) == summary)
    #expect(browseLibraryTitle(summary, value("coming", nil, here: "t")) == nil)
    #expect(browseLibraryTitle(nil, item.availability) == nil)
  }

  @Test func bestMatchGoesOnlyWithRecommendations() {
    var filters = CatalogFilters.none
    #expect(!catalogSortFits(CatalogSort.forYou, filters))
    #expect(catalogSortFits(CatalogSort.scoreHigh, filters))
    #expect(catalogSort(CatalogSort.forYou, fitting: filters) == CatalogSort.popular)
    #expect(catalogSort(CatalogSort.newest, fitting: filters) == CatalogSort.newest)
    filters.recommended = true
    #expect(catalogSortFits(CatalogSort.forYou, filters))
    #expect(catalogSort(CatalogSort.forYou, fitting: filters) == CatalogSort.forYou)
  }

  @Test func aLongGridFollowsTheBlocksOnScreen() {
    #expect(requestFollowWindow(visible: [], count: 0) == 0..<0)
    #expect(requestFollowWindow(visible: [0, 1, 2, 3], count: 100) == 0..<24)
    #expect(requestFollowWindow(visible: [40, 41, 47], count: 100) == 24..<60)
    #expect(requestFollowWindow(visible: [40], count: 50) == 24..<50)
    // At most six blocks, however much shows.
    #expect(requestFollowWindow(visible: Set(0..<200), count: 500).count == 72)
  }
}
