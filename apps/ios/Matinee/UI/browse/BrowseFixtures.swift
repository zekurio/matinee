#if DEBUG
  import Foundation
  import MatineeCore

  /*
   * Debug builds' `-dev.browseFixtures YES`: genres, studios, age ratings,
   * languages, scores, runtimes, and people for the pages that show them,
   * since the dev server has no metadata provider and so none of its own.
   * The titles stay the server's; the filters only it can't answer stay on
   * the page and its chips but aren't sent, so the grid still shows its
   * titles. Release builds don't compile this.
   */

  nonisolated enum BrowseFixtures {
    static var on: Bool { UserDefaults.standard.bool(forKey: "dev.browseFixtures") }

    /// `-dev.browse.open filters|language|search|sort|more`: what a page opens with, for screenshots:
    /// the filter sheet, the language list over it, the search, the sort menu, a biography in full.
    static var open: String? { UserDefaults.standard.string(forKey: "dev.browse.open") }

    /// `-dev.browse.query TEXT`: what the library's or the search page's field starts with.
    static var query: String? { UserDefaults.standard.string(forKey: "dev.browse.query") }

    /// `-dev.browse.filters "genre=Drama;studio=Pixar;years=1980-2000;score=7-;runtime=-120;watched=unwatched;rating=DE:12;language=de"`:
    /// the filters a list starts with. A launch argument can't hold JSON, which it reads as a property list.
    static var filters: TitleFilters? {
      guard let text = UserDefaults.standard.string(forKey: "dev.browse.filters") else { return nil }
      var filters = TitleFilters(genres: [], studios: [])
      for part in text.split(separator: ";") {
        let pair = part.split(separator: "=", maxSplits: 1).map(String.init)
        guard pair.count == 2 else { continue }
        let value = pair[1]
        let ends = value.split(separator: "-", omittingEmptySubsequences: false).map { Double($0) }
        let low = ends.first ?? nil
        let high = ends.count > 1 ? ends[1] : nil
        switch pair[0] {
        case "genre": filters.genres?.append(value)
        case "studio": filters.studios?.append(value)
        case "years": (filters.yearFrom, filters.yearTo) = (low.map { Int($0) }, high.map { Int($0) })
        case "score": (filters.scoreMin, filters.scoreMax) = (low, high)
        case "runtime": (filters.runtimeMin, filters.runtimeMax) = (low.map { Int($0) }, high.map { Int($0) })
        case "watched": filters.watched = value
        case "language": filters.language = value
        case "rating":
          let rating = value.split(separator: ":").map(String.init)
          if rating.count == 2 { filters.movieRating = AgeLimit(country: rating[0], rating: rating[1]) }
        default: break
        }
      }
      return filters
    }

    /// `-dev.browse.sort score|runtime|…`: the order a list starts in.
    static var sort: String? { UserDefaults.standard.string(forKey: "dev.browse.sort") }

    static let genres = [
      Facet(name: "Science Fiction", titleCount: 3), Facet(name: "Adventure", titleCount: 2),
      Facet(name: "Animation", titleCount: 1), Facet(name: "Drama", titleCount: 1),
      Facet(name: "Comedy", titleCount: 1), Facet(name: "Thriller", titleCount: 2),
    ]

    static let studios = [
      Facet(name: "Warner Bros. Pictures", titleCount: 2), Facet(name: "Pixar", titleCount: 1),
      Facet(name: "Legendary Pictures", titleCount: 1), Facet(name: "Amblin Entertainment", titleCount: 1),
    ]

    static let people = [
      PersonSummary(name: "Keanu Reeves", photo: nil, kind: CreditKind.actor, titleCount: 2),
      PersonSummary(name: "Lana Wachowski", photo: nil, kind: CreditKind.director, titleCount: 1),
      PersonSummary(name: "Christopher Nolan", photo: nil, kind: CreditKind.director, titleCount: 1),
      PersonSummary(name: "Vince Gilligan", photo: nil, kind: CreditKind.creator, titleCount: 1),
    ]

    /// What the server offers, with what only metadata would give.
    static func options(_ found: TitleFilterOptions) -> TitleFilterOptions {
      var options = found
      options.genres = genres
      options.studios = studios
      options.ratings = [
        RatingSystem(
          kind: TitleKind.movie, country: "DE",
          ratings: ["0", "6", "12", "16", "18"].map { RatingCount(rating: $0, titleCount: 1) })
      ]
      options.languages = [
        LanguageCount(language: "en", titleCount: 5), LanguageCount(language: "de", titleCount: 2),
        LanguageCount(language: "ja", titleCount: 1),
      ]
      options.scores = FilterRange(min: 0, max: 10, step: 0.5)
      options.runtime = FilterRange(min: 0, max: 240, step: 10)
      options.sorts = TitleSort.knownValues
      return options
    }

    /// What the server is asked with: the filters it can answer, watched and the years.
    static func served(_ filters: TitleFilters) -> TitleFilters {
      TitleFilters(genres: [], studios: [], yearFrom: filters.yearFrom, yearTo: filters.yearTo, watched: filters.watched)
    }

    /// `list` with a score and a length on each title that has none, for the cards' line under a score or runtime order.
    static func rated(_ list: TitleList) -> TitleList {
      var list = list
      list.items = list.items.map { title in
        var title = title
        let seed = title.name.unicodeScalars.reduce(0) { $0 + Int($1.value) } % 40
        if title.rating == nil { title.rating = 5 + Double(seed) / 10 }
        if title.runtimeMinutes == nil { title.runtimeMinutes = 80 + seed * 2 }
        return title
      }
      return list
    }

    /// `found` with a show, its seasons, and the episodes in progress as
    /// favorites too, so every rail shows; the fixture favors only a movie.
    static func favorites(_ found: Favorites, api: MatineeApi) async throws -> Favorites {
      var favorites = found
      let shows = try await api.titles.browse(kind: TitleKind.show, limit: 4).items.map { title in
        var title = title
        title.favorite = true
        return title
      }
      if favorites.shows.isEmpty { favorites.shows = shows }
      if favorites.seasons.isEmpty, let show = shows.first {
        let detail = try await api.titles.get(id: show.id)
        favorites.seasons = detail.seasons.map { season in
          var season = season
          season.favorite = true
          return FavoriteSeason(title: show, season: season)
        }
      }
      if favorites.episodes.isEmpty {
        favorites.episodes = try await api.home.continueWatching(limit: 6).filter { $0.title?.kind == TitleKind.show }
          .map { item in
            var item = item
            item.favorite = true
            return item
          }
      }
      return favorites
    }

    /// `found` with the fixtures whose names hold `text`.
    static func search(_ found: SearchResults, _ text: String) -> SearchResults {
      var found = found
      let match = { (name: String) in name.localizedCaseInsensitiveContains(text) }
      found.people += people.filter { match($0.name) }
      found.genres += genres.filter { match($0.name) }
      found.studios += studios.filter { match($0.name) }
      return found
    }

    /// Someone credited on the first titles the server has, as a role, a
    /// year, or a kind, with a biography and, for the first, a second kind
    /// of credit, so the page shows its sections.
    static func person(_ name: String, api: MatineeApi) async throws -> Person {
      let titles = try await api.titles.browse(limit: 6).items
      let kind = people.first { $0.name == name }?.kind ?? CreditKind.actor
      var credits = titles.enumerated().map { index, title in
        PersonCredit(title: title, kind: kind, role: index == 0 && kind == CreditKind.actor ? "Neo" : nil)
      }
      if let first = titles.first {
        credits.append(PersonCredit(title: first, kind: kind == CreditKind.actor ? CreditKind.director : CreditKind.writer, role: nil))
      }
      let profile = PersonProfile(
        tmdbId: "6384", knownFor: kind == CreditKind.actor ? PersonDepartment.acting : PersonDepartment.directing,
        birthday: "1964-09-02", deathday: nil,
        biography:
          "A test fixture standing in for a biography, long enough to run past three lines on a phone so the "
          + "page shows how it folds. It names no one real: the dev server has no metadata provider, so every "
          + "person here is made up for the screen.\n\nA second paragraph shows in full once it's opened.")
      return Person(
        name: name, photo: nil, kind: kind, titleCount: titles.count, credits: credits, profile: profile, catalog: [],
        stale: false)
    }
  }
#endif
