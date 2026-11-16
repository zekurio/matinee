import Foundation
import Testing

@testable import MatineeCore

private func summary(
  _ id: String, kind: String = TitleKind.movie, year: Int? = nil, rating: Double? = nil, runtime: Int? = nil
) -> TitleSummary {
  TitleSummary(
    id: id, libraryId: "l", kind: kind, name: id, year: year, overview: nil,
    images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: rating, contentRating: nil,
    runtimeMinutes: runtime, originalLanguage: nil, favorite: false, watched: false)
}

private func options(ratings: Int = 1, sorts: [String] = TitleSort.knownValues) -> TitleFilterOptions {
  TitleFilterOptions(
    genres: [], studios: [],
    ratings: (0..<ratings).map { RatingSystem(kind: $0 == 0 ? TitleKind.movie : TitleKind.show, country: "DE", ratings: []) },
    languages: [], years: nil, scores: nil, runtime: nil,
    watched: TitleFilterOptions.Watched(unwatched: 0, inProgress: 0, watched: 0), total: 0, sorts: sorts)
}

/// TitleFilters.kt's chips, card details, and sort menu; Android has no test for them.
@MainActor struct TitleFilterChipsTests {
  @Test func chipsFollowAndroidOrderAndEachRemovesOnlyItself() {
    let filters = TitleFilters(
      genres: ["Drama", "Comedy"], studios: ["A24"], yearFrom: 1990, yearTo: nil, scoreMin: 7, scoreMax: 9,
      movieRating: AgeLimit(country: "DE", rating: "12"), showRating: AgeLimit(country: "DE", rating: "16"),
      language: "de", runtimeMin: nil, runtimeMax: 120, watched: WatchFilter.unwatched)
    let chips = activeTitleFilters(filters, options: options(ratings: 2))
    #expect(
      chips == [
        .watched(WatchFilter.unwatched), .genre("Drama"), .genre("Comedy"), .studio("A24"),
        .years(from: 1990, to: nil), .score(min: 7, max: 9), .movieRating("12", named: true),
        .showRating("16", named: true), .language("de"), .runtime(min: nil, max: 120),
      ])
    #expect(Set(chips.map(\.key)).count == chips.count)
    // A range counts once, as the button's count does.
    #expect(chips.count == filters.activeCount)
    for chip in chips {
      let left = chip.removed(from: filters)
      #expect(activeTitleFilters(left, options: options(ratings: 2)) == chips.filter { $0 != chip })
    }
  }

  @Test func ratingChipsNameTheirKindOnlyWithBoth() {
    let filters = TitleFilters(movieRating: AgeLimit(country: "US", rating: "PG-13"))
    #expect(activeTitleFilters(filters, options: options(ratings: 1)) == [.movieRating("PG-13", named: false)])
    #expect(activeTitleFilters(filters, options: nil) == [.movieRating("PG-13", named: false)])
    #expect(activeTitleFilters(NO_TITLE_FILTERS, options: nil).isEmpty)
  }

  @Test func cardDetailFollowsTheSort() {
    let rated = summary("a", year: 1999, rating: 8.7, runtime: 136)
    #expect(titleCardDetail(rated, sort: TitleSort.name) == .year(1999))
    #expect(titleCardDetail(rated, sort: TitleSort.recent) == .year(1999))
    #expect(titleCardDetail(rated, sort: TitleSort.score) == .score(8.7, year: 1999))
    #expect(titleCardDetail(rated, sort: TitleSort.runtime) == .runtime(136, year: 1999))
    let bare = summary("b", runtime: 0)
    #expect(titleCardDetail(bare, sort: TitleSort.name) == nil)
    // No score or no length: the year, as any other order.
    #expect(titleCardDetail(bare, sort: TitleSort.score) == nil)
    #expect(titleCardDetail(bare, sort: TitleSort.runtime) == nil)
    #expect(titleCardDetail(summary("c", year: 2001), sort: TitleSort.score) == .year(2001))
    #expect(titleCardDetail(summary("d", rating: 6), sort: TitleSort.score) == .score(6, year: nil))
  }

  @Test func sortMenuOffersWhatTheListHas() {
    #expect(offeredTitleOrders(nil) == TITLE_ORDERS)
    let offered = offeredTitleOrders(options(sorts: [TitleSort.name, TitleSort.year]))
    #expect(offered.map(\.sort) == [TitleSort.name, TitleSort.name, TitleSort.year, TitleSort.year])
    let state = TitleListState()
    #expect(state.currentOrder == TITLE_ORDERS[0])
    state.apply(TITLE_ORDERS[7])
    #expect(state.sort == TitleSort.score && state.order == SortOrder.asc)
    #expect(state.currentOrder == TITLE_ORDERS[7])
  }

  @Test func emptyReasonsSearchFirstThenFilters() {
    let state = TitleListState()
    #expect(libraryEmpty(state) == .none)
    state.filters.genres = ["Drama"]
    #expect(libraryEmpty(state) == .noFilterMatch)
    #expect(state.activeFilters == 1)
    state.query = "dune"
    state.settleNow()
    #expect(libraryEmpty(state) == .noMatch("dune"))
    state.clearFilters()
    #expect(state.filters == NO_TITLE_FILTERS)
    #expect(state.settled == "dune")
  }

  @Test func browsePutsThePagesOwnFirstOnce() {
    let picked = TitleFilters(genres: ["Drama", "Comedy"], studios: [], watched: WatchFilter.watched)
    let genre = browseFilters(genre: "Drama", studio: nil, picked: picked)
    #expect(genre.genres == ["Drama", "Comedy"])
    #expect(genre.studios == [])
    #expect(genre.watched == WatchFilter.watched)
    let studio = browseFilters(genre: nil, studio: "Pixar", picked: NO_TITLE_FILTERS)
    #expect(studio.genres == [])
    #expect(studio.studios == ["Pixar"])
  }

  @Test func kindChipsOnlyWithBothKinds() {
    #expect(browseKindChoices(nil, picked: nil) == nil)
    #expect(browseKindChoices(.init(movie: 3, show: 0), picked: nil) == nil)
    // One picked keeps a way back, even when the filters leave none of it.
    #expect(browseKindChoices(.init(movie: 3, show: 0), picked: TitleKind.show)?.map(\.count) == [3, 3, 0])
    let both = browseKindChoices(.init(movie: 3, show: 2), picked: nil)
    #expect(both?.map(\.kind) == [nil, TitleKind.movie, TitleKind.show])
    #expect(both?.map(\.count) == [5, 3, 2])
  }
}

/// The person page's helpers, after the web's people.$name.tsx.
struct PersonPresentationTests {
  private func person(
    kind: String = CreditKind.actor, credits: [PersonCredit], profile: PersonProfile? = nil,
    catalog: [PersonCatalogCredit] = []
  ) -> Person {
    Person(
      name: "Someone", photo: nil, kind: kind, titleCount: Set(credits.map(\.title.id)).count, credits: credits,
      profile: profile, catalog: catalog, stale: false)
  }

  @Test func sectionsPutWhatTheyreKnownForFirst() {
    let movie = summary("m", year: 1999)
    let show = summary("s", kind: TitleKind.show)
    let someone = person(
      kind: CreditKind.director,
      credits: [
        PersonCredit(title: movie, kind: CreditKind.actor, role: "Neo"),
        PersonCredit(title: movie, kind: CreditKind.director, role: nil),
        PersonCredit(title: show, kind: CreditKind.writer, role: ""),
      ])
    #expect(personCreditKinds(someone) == [CreditKind.director, CreditKind.actor, CreditKind.writer])
    #expect(personCreditSections(someone).map(\.kind) == [CreditKind.director, CreditKind.actor, CreditKind.writer])
    #expect(personCreditSections(someone, titleKind: TitleKind.show).map(\.kind) == [CreditKind.writer])
    #expect(personSubtitle(someone) == .credits(kinds: [CreditKind.director, CreditKind.actor, CreditKind.writer], titleCount: 2))
    // Each title once, however many ways they're credited on it.
    let counts = personKindCounts(someone)
    #expect(counts.movie == 1 && counts.show == 1)
    #expect(personCreditDetail(someone.credits[0]) == (1999, "Neo"))
    #expect(personCreditDetail(someone.credits[2]) == (nil, nil))
  }

  @Test func profileLineOnlyWithSomethingToSay() {
    let credits = [PersonCredit(title: summary("m"), kind: CreditKind.actor, role: nil)]
    let known = person(
      credits: credits,
      profile: PersonProfile(tmdbId: "1", knownFor: "acting", birthday: "1964-09-02", deathday: nil, biography: "B"))
    #expect(personSubtitle(known) == .profile(knownFor: "acting", born: "1964-09-02", died: nil))
    let odd = person(
      credits: credits,
      profile: PersonProfile(tmdbId: "1", knownFor: "juggling", birthday: nil, deathday: "", biography: nil))
    #expect(personSubtitle(odd) == .credits(kinds: [CreditKind.actor], titleCount: 1))
  }

  @Test func aKindWithNothingIsntShown() {
    let someone = person(credits: [PersonCredit(title: summary("m"), kind: CreditKind.actor, role: nil)])
    #expect(personShownKind(someone, picked: nil) == nil)
    #expect(personShownKind(someone, picked: TitleKind.movie) == TitleKind.movie)
    #expect(personShownKind(someone, picked: TitleKind.show) == nil)
  }
}

/// FavoritesData.kt's `lists`: the marks made here over what the server sent.
@MainActor struct FavoritesLiveTests {
  @Test func takenOffTitlesGoAndSeasonsKeepTheirOwnMark() {
    let show = summary("show", kind: TitleKind.show)
    var marked = show
    marked.favorite = true
    let season = Season(
      number: 1, name: "Season 1", overview: nil, poster: nil, itemCount: 3, watchedCount: 0, favorite: true)
    let favorites = Favorites(
      shows: [marked], seasons: [FavoriteSeason(title: marked, season: season)], episodes: [], movies: [])
    let viewer = ViewerState()
    #expect(favorites.live(viewer) == favorites)
    // The show no longer one, by the mark it carries; its season still is, by its own.
    let unmarked = Favorites(
      shows: [show], seasons: [FavoriteSeason(title: show, season: season)], episodes: [], movies: [show])
    let live = unmarked.live(viewer)
    #expect(live.shows.isEmpty && live.movies.isEmpty)
    #expect(live.seasons.count == 1)
    var off = season
    off.favorite = false
    var unnumbered = season
    unnumbered.number = nil
    let seasons = Favorites(
      shows: [], seasons: [FavoriteSeason(title: show, season: off), FavoriteSeason(title: show, season: unnumbered)],
      episodes: [], movies: [])
    #expect(seasons.live(viewer).seasons.map(\.season.number) == [nil])
  }
}
