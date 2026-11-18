import Foundation
import Testing
@testable import MatineeCore

/// Answers every PUT with nothing, as the favorite endpoints do; anything else is refused.
private final class FavoriteStub: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let ok = request.httpMethod == "PUT" && request.url!.path.hasSuffix("favorite")
    let status = ok ? 200 : 403
    client?.urlProtocol(
      self,
      didReceive: HTTPURLResponse(
        url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!,
      cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data((ok ? "null" : "{\"message\":\"Denied\"}").utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}

@MainActor struct ProfileDataTests {
  private func stats(_ range: String, plays: Int = 1) -> WatchStats {
    WatchStats(range: range, unit: "day", totals: WatchTotals(watchSeconds: 60, plays: plays, movies: 0, episodes: 0, shows: 0), buckets: [], activity: [], genres: [], titles: [])
  }

  @Test func rangeChangesKeepTheLastFiguresUntilTheNextAnswer() {
    let state = ProfileStats()
    #expect(state.range == "all")
    #expect(state.stats == nil)
    state.loader.show(stats("all"))
    state.select("7d")
    #expect(state.state.isLoading)
    #expect(state.stats?.range == "all")
    state.loader.show(stats("7d", plays: 2))
    #expect(state.stats?.totals.plays == 2)
    let loader = state.loader
    state.select("7d")
    #expect(state.loader === loader)
    state.select("all")
    state.loader.show(stats("all", plays: 0))
    #expect(state.neverWatched)
    state.select("30d")
    #expect(!state.neverWatched)
  }

  @Test func offlineRangesUseOnlyTheirOwnSavedFigures() {
    let suite = "profile-data-\(UUID().uuidString)"
    defer { UserDefaults.standard.removePersistentDomain(forName: suite) }
    let snapshot = ProfileSnapshot(username: "me", suite: suite)
    snapshot.stats("all").write(stats("all"))
    snapshot.stats("7d").write(nil)
    let state = ProfileStats(snapshot: snapshot)
    state.showSaved()
    #expect(state.stats?.range == "all")
    state.select("7d")
    state.showSaved()
    #expect(!state.state.isFailed)
    #expect(state.stats == nil)
    state.select("30d")
    state.showSaved()
    #expect(state.state == .failed("", disconnected: true))
    #expect(state.stats == nil)
  }

  @Test func aRangePickedAgainShowsItsAnswerAtOnce() {
    let state = ProfileStats()
    let all = state.loader
    all.show(stats("all", plays: 3))
    state.select("7d")
    let week = state.loader
    week.show(stats("7d", plays: 1))
    state.select("all")
    #expect(state.loader === all)
    #expect(state.state == .ready(stats("all", plays: 3)))
    state.select("7d")
    #expect(state.loader === week)
    #expect(state.stats?.totals.plays == 1)
  }

  @Test func theSectionShowsWhatTheFiguresSay() {
    let state = ProfileStats()
    #expect(state.content == .loading)
    state.loader.show(stats("all", plays: 0))
    #expect(state.content == .neverWatched)
    state.select("7d")
    // The last range's figures stand in while this one loads, and they say never.
    state.loader.show(stats("7d", plays: 0))
    #expect(state.content == .nothingInRange)
    state.loader.show(stats("7d", plays: 4))
    #expect(state.content == .shown(stats("7d", plays: 4)))
    state.select("30d")
    state.loader.show(nil)
    #expect(state.content == .shown(stats("7d", plays: 4)))
  }

  @Test func aFailureShowsOnlyWithNothingElseToShow() async {
    let state = ProfileStats()
    state.loader.configure(describe: { _ in "Nope" }) { throw URLError(.cannotConnectToHost) }
    await state.loader.settled()
    #expect(state.content == .failed("Nope", disconnected: true))
    state.loader.show(stats("all"))
    state.select("7d")
    state.loader.configure(describe: { _ in "Nope" }) { throw ApiException(status: 500, code: nil, message: "Broken") }
    await state.loader.settled()
    // The figures shown before stay up.
    #expect(state.content == .shown(stats("all")))
  }

  private func title(_ id: String, kind: String = TitleKind.movie, favorite: Bool = true) -> TitleSummary {
    TitleSummary(
      id: id, libraryId: "l", kind: kind, name: id, year: nil, overview: nil,
      images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: nil, contentRating: nil,
      runtimeMinutes: nil, originalLanguage: nil, favorite: favorite, watched: false)
  }

  private func profile(_ favorites: [Favorite]?) -> Profile {
    Profile(
      user: ProfileUser(
        id: "u", username: "me", displayName: nil, role: "user", avatarId: nil, createdAt: "2026-01-01T00:00:00Z"),
      isSelf: true, sharing: ProfileSharing(favorites: true, stats: true), favorites: favorites, recent: nil)
  }

  private func api() -> MatineeApi {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [FavoriteStub.self]
    return MatineeApi(transport: ApiTransport(base: URL(string: "https://profile")!, configuration: configuration))
  }

  @Test func theRailKeepsTheServersOrderAndEveryKind() {
    var episode = Answers.item("episode-1")
    episode.favorite = true
    let season = Season(number: 2, name: "Season 2", overview: nil, poster: nil, itemCount: 3, watchedCount: 0, favorite: true)
    var loose = season
    loose.number = nil
    let favorites: [Favorite] = [
      .episode(Favorite.Episode(item: episode)),
      .show(Favorite.Show(title: title("show", kind: TitleKind.show))),
      .showSeason(Favorite.ShowSeason(title: title("show", kind: TitleKind.show), season: season)),
      .movie(Favorite.Movie(title: title("movie"))),
      .showSeason(Favorite.ShowSeason(title: title("other", kind: TitleKind.show), season: loose)),
    ]
    let shown = shownFavorites(profile(favorites), viewer: ViewerState())
    // Files without a season number aren't a season to keep.
    #expect(shown == Array(favorites.prefix(4)))
    #expect(shownFavorites(profile(favorites), viewer: nil) == favorites)
    #expect(shownFavorites(profile(nil), viewer: ViewerState()).isEmpty)
  }

  @Test func oneTakenOffHereLeavesTheRailAtOnce() async throws {
    let viewer = ViewerState()
    let movie = title("movie")
    let show = title("show", kind: TitleKind.show)
    let season = Season(number: 1, name: "Season 1", overview: nil, poster: nil, itemCount: 3, watchedCount: 0, favorite: true)
    let favorites: [Favorite] = [
      .movie(Favorite.Movie(title: movie)),
      .showSeason(Favorite.ShowSeason(title: show, season: season)),
      .show(Favorite.Show(title: show)),
    ]
    try await viewer.setFavorite(api(), movie, false)
    try await viewer.setSeasonFavorite(api(), show, number: 1, favorite: false)
    #expect(shownFavorites(profile(favorites), viewer: viewer) == [.show(Favorite.Show(title: show))])
    // Put back here, it shows again before the profile is fetched.
    try await viewer.setFavorite(api(), movie, true)
    #expect(shownFavorites(profile(favorites), viewer: viewer).first == .movie(Favorite.Movie(title: movie)))
  }
}
