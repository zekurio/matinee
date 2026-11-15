#if DEBUG
  import Foundation
  import MatineeCore

  /*
   * Debug builds' `-dev.browseFixtures YES`: a few genres, studios, and
   * people for the pages that show them, since the dev server has no
   * metadata provider and so none of its own. The titles stay the
   * server's. Release builds don't compile this.
   */

  nonisolated enum BrowseFixtures {
    static var on: Bool { UserDefaults.standard.bool(forKey: "dev.browseFixtures") }

    static let genres = [
      Facet(name: "Science Fiction", titleCount: 3), Facet(name: "Adventure", titleCount: 2),
      Facet(name: "Animation", titleCount: 1), Facet(name: "Drama", titleCount: 1),
    ]

    static let studios = [Facet(name: "Warner Bros. Pictures", titleCount: 2), Facet(name: "Pixar", titleCount: 1)]

    static let people = [
      PersonSummary(name: "Keanu Reeves", photo: nil, kind: CreditKind.actor, titleCount: 2),
      PersonSummary(name: "Lana Wachowski", photo: nil, kind: CreditKind.director, titleCount: 1),
      PersonSummary(name: "Christopher Nolan", photo: nil, kind: CreditKind.director, titleCount: 1),
      PersonSummary(name: "Vince Gilligan", photo: nil, kind: CreditKind.creator, titleCount: 1),
    ]

    /// `found` with the fixtures whose names hold `text`.
    static func search(_ found: SearchResults, _ text: String) -> SearchResults {
      var found = found
      let match = { (name: String) in name.localizedCaseInsensitiveContains(text) }
      found.people += people.filter { match($0.name) }
      found.genres += genres.filter { match($0.name) }
      found.studios += studios.filter { match($0.name) }
      return found
    }

    /// Someone credited on the first titles the server has, as a role, a year, or a kind.
    static func person(_ name: String, api: MatineeApi) async throws -> Person {
      let titles = try await api.titles.browse(limit: 5).items
      let kind = people.first { $0.name == name }?.kind ?? CreditKind.actor
      let credits = titles.enumerated().map { index, title in
        PersonCredit(title: title, kind: kind, role: index == 0 && kind == CreditKind.actor ? "Neo" : nil)
      }
      return Person(name: name, photo: nil, kind: kind, titleCount: credits.count, credits: credits)
    }
  }
#endif
