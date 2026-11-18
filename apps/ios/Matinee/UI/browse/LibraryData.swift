import MatineeCore
import MatineeKit
import SwiftUI

/*
 * LibraryData.kt's words for why a library's page has no titles. What the
 * pages load and filter by is MatineeCore's (Browse/), and what both apps
 * share of it is in BrowseData.swift.
 */

/// Why a library page shows no titles, with its icon and the way out:
/// nothing matches the filters, or there are none. The page has no search
/// of its own (the Apple TV's grids do, and say when nothing matches it),
/// so its query is always empty.
@MainActor func libraryEmptyState(_ library: Library?, _ state: TitleListState) -> GridEmpty {
  let shows = library?.kind == LibraryKind.shows
  switch libraryEmpty(state) {
  case .noFilterMatch:
    return GridEmpty(
      icon: .listFilter, title: shows ? Str.libraryNoFilterMatchShows : Str.libraryNoFilterMatchMovies,
      action: (Str.browseClearFilters, state.clearFilters))
  case .none, .noMatch:
    return GridEmpty(icon: shows ? .tv : .film, title: shows ? Str.libraryNoneShows : Str.libraryNoneMovies)
  }
}
