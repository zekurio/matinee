import MatineeCore
import MatineeKit
import SwiftUI

/*
 * LibraryData.kt's words: the names of a library's orders and of a
 * genre's or studio's kinds, and why a page has no titles. What the pages
 * load and filter by is MatineeCore's (Browse/LibraryData.swift).
 */

/// A library order's name in the sort menu.
func librarySortLabel(_ sort: String) -> String {
  switch sort {
  case TitleSort.recent: Str.librarySortRecent
  case TitleSort.year: Str.librarySortYear
  default: Str.librarySortName
  }
}

/// A kind's name on a genre's or studio's page: all, movies, or shows.
func browseKindLabel(_ kind: String?) -> String {
  switch kind {
  case TitleKind.movie: Str.browseKindMovie
  case TitleKind.show: Str.browseKindShow
  default: Str.browseKindAll
  }
}

/// Why a library page shows no titles: nothing matches the search, nothing the genre, or there are none.
func libraryEmptyMessage(_ library: Library?, _ filters: LibraryFilters) -> String {
  let shows = library?.kind == LibraryKind.shows
  switch libraryEmpty(filters) {
  case .noMatch(let query): return shows ? Str.libraryNoMatchShows(query) : Str.libraryNoMatchMovies(query)
  case .noFilterMatch: return shows ? Str.libraryNoFilterMatchShows : Str.libraryNoFilterMatchMovies
  case .none: return shows ? Str.libraryNoneShows : Str.libraryNoneMovies
  }
}
