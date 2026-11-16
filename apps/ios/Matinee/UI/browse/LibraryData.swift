import MatineeCore
import MatineeKit
import SwiftUI

/*
 * LibraryData.kt's words: the names of a genre's or studio's kinds, why a
 * page has no titles, and the filter choices a list offers. What the pages
 * load and filter by is MatineeCore's (Browse/).
 */

/// A kind's name on a genre's or studio's page: all, movies, or shows.
func browseKindLabel(_ kind: String?) -> String {
  switch kind {
  case TitleKind.movie: Str.browseKindMovie
  case TitleKind.show: Str.browseKindShow
  default: Str.browseKindAll
  }
}

/// Why a library page shows no titles, with its icon and the way out: nothing
/// matches the search, nothing the filters, or there are none.
@MainActor func libraryEmptyState(_ library: Library?, _ state: TitleListState) -> GridEmpty {
  let shows = library?.kind == LibraryKind.shows
  switch libraryEmpty(state) {
  case .noMatch(let query):
    return GridEmpty(
      icon: .searchX, title: shows ? Str.libraryNoMatchShows(query) : Str.libraryNoMatchMovies(query),
      action: (Str.libraryClearSearch, state.clearQuery))
  case .noFilterMatch:
    return GridEmpty(
      icon: .listFilter, title: shows ? Str.libraryNoFilterMatchShows : Str.libraryNoFilterMatchMovies,
      action: (Str.browseClearFilters, state.clearFilters))
  case .none:
    return GridEmpty(icon: shows ? .tv : .film, title: shows ? Str.libraryNoneShows : Str.libraryNoneMovies)
  }
}

extension View {
  /// Loads what each filter offers for the titles in a scope, into `options`,
  /// as Android's `rememberFilterOptions`; another scope fetches again.
  func loadsFilterOptions(
    _ options: Loader<TitleFilterOptions>, libraryId: String? = nil, kind: String? = nil, genre: String? = nil,
    studio: String? = nil
  ) -> some View {
    modifier(LoadsFilterOptions(options: options, scope: [libraryId, kind, genre, studio]))
  }
}

private struct LoadsFilterOptions: ViewModifier {
  let options: Loader<TitleFilterOptions>
  /// The library, kind, genre, and studio.
  let scope: [String?]
  @Environment(\.api) private var api

  func body(content: Content) -> some View {
    let scope = scope
    content
      .loads(options) { api in try await Self.fetch(api, scope) }
      .onChange(of: scope) {
        // Another scope, as another kind picked: the fetch for it, at once.
        guard let api else { return }
        options.configure(describe: describeFailure) { try await Self.fetch(api, scope) }
        options.reload()
      }
  }

  private nonisolated static func fetch(_ api: MatineeApi, _ scope: [String?]) async throws -> TitleFilterOptions {
    let found = try await api.titles.filterOptions(
      libraryId: scope[0], kind: scope[1], genre: scope[2], studio: scope[3])
    #if DEBUG
      if BrowseFixtures.on { return BrowseFixtures.options(found) }
    #endif
    return found
  }
}
